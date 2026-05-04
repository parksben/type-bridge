// TypeBridge 本地 WebAssembly 语音引擎 —— 基于 @huggingface/transformers + whisper-tiny。
//
// 设计要点：
//   1. **懒加载**：transformers.js 主包（~2MB）走 dynamic import()，用户不主动触发
//      「安装本地语音引擎」就不会被下载，不影响普通用户首屏
//   2. **自托管 CDN**：模型 + ONNX 运行时都从 Netlify 静态资源加载（由 scripts/
//      fetch-models.mjs 在 build 前落到 public/ 下），避开 HF / jsdelivr 在国内
//      不稳定的问题
//   3. **累计进度 + 单调递增**：跨文件累加 loaded/total 字节数，避免
//      "下一个文件开始时进度回到 0%"的抖动
//   4. **指数退避自动重试**：默认 3 次重试，delay 1→2→4s。配合 transformers.js
//      的 Cache API 自然形成文件级"断点续传" —— 已下完的文件不会重下
//   5. **SSR 安全**：所有 transformers.js 访问都在动态 import 之后、且调用方必须是
//      client component；本模块 top-level 不导入 transformers

export type InstallProgress =
  | { kind: "initiate" }
  | { kind: "download" }
  | {
      kind: "progress";
      /** 预估总字节数（固定分母，约 42 MB） */
      totalBytes: number;
      /** 累计已下载字节数（只增） */
      totalLoaded: number;
      /** 百分比 0-99（只在 "ready" 事件到 100） */
      percent: number;
    }
  | { kind: "done" }
  | { kind: "ready" }
  | {
      kind: "retrying";
      /** 第几次重试（从 1 开始） */
      attempt: number;
      /** 最多重试几次 */
      maxAttempts: number;
      /** 距离下次重试还剩多少秒 */
      delaySecs: number;
      /** 触发重试的错误消息 */
      reason: string;
    };

const MODEL_ID = "Xenova/whisper-tiny";
const DEFAULT_MAX_RETRIES = 3;

/** whisper-tiny q8 全部资源约 42 MB（encoder 9MB + decoder 30MB + metadata 3MB）。
 *  用这个做分母算进度百分比，loaded 单调递增 → percent 天然单调递增，
 *  不会出现"文件加入时分母变大、百分比回退"的抖动。
 *  如果实际文件总量略小/略大（±5MB），只是最后一段进度略快/略慢，用户无感。 */
const ESTIMATED_TOTAL_BYTES = 42 * 1024 * 1024;

// 懒初始化的 pipeline 实例
let transcriberPromise: Promise<unknown> | null = null;

async function loadTransformers() {
  const mod = await import("@huggingface/transformers");
  // 让模型 + ONNX WASM 运行时从**同域 Netlify 站点**加载，避开 HuggingFace Hub
  // 和 jsdelivr CDN 在国内不稳定的问题。这些文件由 scripts/fetch-models.mjs
  // 在 build 前落到 public/ 下，部署后走 Netlify CDN 分发。
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    mod.env.remoteHost = origin + "/";
    mod.env.remotePathTemplate = "models/{model}/";
    const wasm = mod.env.backends?.onnx?.wasm;
    if (wasm) {
      (wasm as unknown as { wasmPaths: string }).wasmPaths = origin + "/ort/";
    }
  }
  return mod;
}

/** 指数退避：1s, 2s, 4s, 8s 上限 */
function backoffSecs(attempt: number): number {
  return Math.min(2 ** attempt, 8);
}

/** 判断错误是否值得重试（网络类错误都重试；业务错误不重试） */
function isRetryableError(e: unknown): boolean {
  const msg = ((e as Error)?.message || String(e)).toLowerCase();
  // fetch 网络错误 / 超时 / 读流失败 等都重试
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("failed to") ||
    msg.includes("load") ||
    msg.includes("load failed") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("connection") ||
    msg.includes("reset")
  );
}

/** 安装（或复用缓存的）Whisper 模型。
 *  - 自动指数退避重试（默认 3 次）
 *  - 跨 retry 保留累计进度，不会回到 0%
 *  - 已完成的文件命中 transformers.js 的 Cache API，重试时不会重下 */
export async function installEngine(
  onProgress?: (p: InstallProgress) => void,
  opts: { maxRetries?: number } = {},
): Promise<void> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown = null;

  // 跨 retry 共享进度状态。每个文件当前 loaded/total，累加算总进度。
  const files = new Map<string, { loaded: number; total: number }>();

  function emitProgress() {
    if (!onProgress) return;
    let totalLoaded = 0;
    for (const { loaded } of files.values()) {
      totalLoaded += loaded;
    }
    // 用固定分母（预估 42MB），loaded 单调递增 → percent 天然单调递增
    // 实际 loaded 可能略超 ESTIMATED_TOTAL_BYTES，截到 99%，最终 "ready" 事件补到 100
    const percent = Math.min(99, (totalLoaded / ESTIMATED_TOTAL_BYTES) * 100);
    onProgress({
      kind: "progress",
      totalLoaded,
      totalBytes: ESTIMATED_TOTAL_BYTES,
      percent,
    });
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await installOnce(onProgress, files, emitProgress);
      onProgress?.({ kind: "ready" });
      return;
    } catch (e) {
      lastError = e;
      // 业务错误 / 无法重试的错误 → 立即抛
      if (!isRetryableError(e) || attempt >= maxRetries) break;
      // 重试：清 transcriberPromise（重新走 pipeline），files map 保留以延续进度
      transcriberPromise = null;
      const delaySecs = backoffSecs(attempt);
      const reason = (e as Error)?.message || "网络错误";
      onProgress?.({
        kind: "retrying",
        attempt: attempt + 1,
        maxAttempts: maxRetries,
        delaySecs,
        reason,
      });
      // 睡一下再重试。延迟期间 UI 可以展示倒计时或重试文案。
      await new Promise((r) => setTimeout(r, delaySecs * 1000));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError) || "install failed");
}

async function installOnce(
  onProgress: ((p: InstallProgress) => void) | undefined,
  files: Map<string, { loaded: number; total: number }>,
  emitProgress: () => void,
): Promise<void> {
  if (transcriberPromise) {
    await transcriberPromise;
    return;
  }

  transcriberPromise = (async () => {
    const { pipeline } = await loadTransformers();
    const transcriber = await pipeline(
      "automatic-speech-recognition" as never,
      MODEL_ID,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (p: any) => {
          if (!onProgress) return;
          const file: string = p.file || "";
          switch (p.status) {
            case "initiate":
              // 只在不存在时初始化，避免覆盖 retry 中已有进度
              if (!files.has(file)) files.set(file, { loaded: 0, total: 0 });
              // 不 emit "initiate" 事件，避免 UI state 跳变
              break;
            case "download":
              // 同上
              break;
            case "progress": {
              const existing = files.get(file) || { loaded: 0, total: 0 };
              // 单文件 loaded/total 也用 max 保护，防止 transformers 上报抖动
              files.set(file, {
                loaded: Math.max(existing.loaded, Number(p.loaded) || 0),
                total: Math.max(existing.total, Number(p.total) || 0),
              });
              emitProgress();
              break;
            }
            case "done": {
              const existing = files.get(file);
              if (existing && existing.total > 0) {
                files.set(file, {
                  loaded: existing.total,
                  total: existing.total,
                });
              }
              emitProgress();
              break;
            }
            default:
              break;
          }
        },
      },
    );
    return transcriber;
  })();

  await transcriberPromise;
}

// ──────────────────────────────────────────────────────────────
// 安装状态持久化（localStorage flag）
// ──────────────────────────────────────────────────────────────

const INSTALLED_FLAG = "typebridge_wasm_engine_installed";

export function isEngineInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALLED_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markEngineInstalled() {
  try {
    window.localStorage.setItem(INSTALLED_FLAG, "1");
  } catch {
    /* ignore */
  }
}

export function clearEngineInstalled() {
  try {
    window.localStorage.removeItem(INSTALLED_FLAG);
  } catch {
    /* ignore */
  }
  transcriberPromise = null;
}

// ──────────────────────────────────────────────────────────────
// 推理：Blob (MediaRecorder) → Float32 @ 16k → Whisper pipeline → text
// ──────────────────────────────────────────────────────────────

export async function transcribe(audioBlob: Blob): Promise<string> {
  if (!transcriberPromise) {
    throw new Error("engine not installed");
  }
  const audio = await blobToFloat32_16k(audioBlob);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transcriber: any = await transcriberPromise;
  const result = await transcriber(audio, {
    language: "chinese",
    task: "transcribe",
    chunk_length_s: 30,
    return_timestamps: false,
  });
  if (result && typeof result.text === "string") {
    return result.text.trim();
  }
  return "";
}

async function blobToFloat32_16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctx: any =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded: AudioBuffer = await ctx.decodeAudioData(buf.slice(0));
    const src = decoded.getChannelData(0);
    return resampleMonoTo16k(src, decoded.sampleRate);
  } finally {
    try { ctx.close(); } catch { /* ignore */ }
  }
}

function resampleMonoTo16k(src: Float32Array, srcRate: number): Float32Array {
  if (srcRate === 16000) return src;
  const ratio = srcRate / 16000;
  const dstLen = Math.floor(src.length / ratio);
  const dst = new Float32Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, src.length - 1);
    const frac = pos - i0;
    dst[i] = src[i0] * (1 - frac) + src[i1] * frac;
  }
  return dst;
}
