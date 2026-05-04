// TypeBridge 本地 WebAssembly 语音引擎 —— 基于 @huggingface/transformers + whisper-tiny。
//
// 设计要点：
//   1. **懒加载**：transformers.js 主包（~2MB）走 dynamic import()，用户不主动触发
//      「安装本地语音引擎」就不会被下载，不影响普通用户首屏
//   2. **内置缓存**：transformers.js 默认用浏览器 Cache API 按 URL 哈希持久化模型文件；
//      浏览器关闭重开仍在，只有用户清浏览数据才会丢
//   3. **渐进反馈**：install() 接收 progress_callback，上层据此渲染进度条 + 当前下载文件
//   4. **SSR 安全**：所有 transformers.js 访问都在动态 import 之后、且调用方必须是 client
//      component；本模块 top-level 不导入 transformers
//
// 推理管线（transcribe）：
//   Blob (webm/opus) → decodeAudioData → Float32 (48k) → resample to 16k → pipeline()

export type InstallProgress =
  | { kind: "initiate"; file: string }
  | { kind: "download"; file: string }
  | { kind: "progress"; file: string; loaded: number; total: number; percent: number }
  | { kind: "done"; file: string }
  | { kind: "ready" };

const MODEL_ID = "Xenova/whisper-tiny";

// 懒初始化的 pipeline 实例 —— 跨 install / transcribe 共用，避免重复加载模型权重
let transcriberPromise: Promise<unknown> | null = null;

async function loadTransformers() {
  const mod = await import("@huggingface/transformers");
  // 让模型 + ONNX WASM 运行时从**同域 Netlify 站点**加载，避开 HuggingFace Hub
  // 和 jsdelivr CDN 在国内不稳定的问题。这些文件由 scripts/fetch-models.mjs
  // 在 build 前落到 public/ 下，部署后走 Netlify CDN 分发。
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    // 模型：origin + "models/" + "Xenova/whisper-tiny/" + "onnx/encoder_model_quantized.onnx"
    //     = https://webchat-typebridge.parksben.xyz/models/Xenova/whisper-tiny/onnx/...
    mod.env.remoteHost = origin + "/";
    mod.env.remotePathTemplate = "models/{model}/";
    // ONNX runtime WASM：origin + "/ort/" + "ort-wasm-simd-threaded.wasm"
    // 用 optional chain 容错：transformers.js v4 定义中 onnx.wasm 是 optional，
    // 但运行时一定存在；遇到类型问题就 cast 成 unknown 再赋值
    const wasm = mod.env.backends?.onnx?.wasm;
    if (wasm) {
      (wasm as unknown as { wasmPaths: string }).wasmPaths = origin + "/ort/";
    }
  }
  return mod;
}

/**
 * 安装（或复用缓存的）Whisper 模型。
 * 若模型已缓存：快速完成，progress 只会收到少量 initiate/done/ready
 * 若首次安装：按文件触发 download + 多次 progress 事件
 */
export async function installEngine(
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  if (transcriberPromise) {
    // 已经在 loading 或已 loaded，不重复
    await transcriberPromise;
    onProgress?.({ kind: "ready" });
    return;
  }

  transcriberPromise = (async () => {
    const { pipeline } = await loadTransformers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transcriber = await pipeline("automatic-speech-recognition" as any, MODEL_ID, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (p: any) => {
        if (!onProgress) return;
        switch (p.status) {
          case "initiate":
            onProgress({ kind: "initiate", file: p.file || "" });
            break;
          case "download":
            onProgress({ kind: "download", file: p.file || "" });
            break;
          case "progress":
            onProgress({
              kind: "progress",
              file: p.file || "",
              loaded: p.loaded || 0,
              total: p.total || 0,
              percent: p.progress || 0,
            });
            break;
          case "done":
            onProgress({ kind: "done", file: p.file || "" });
            break;
          case "ready":
            onProgress({ kind: "ready" });
            break;
        }
      },
    });
    return transcriber;
  })();

  await transcriberPromise;
  onProgress?.({ kind: "ready" });
}

/**
 * 检查模型是否已缓存在浏览器 Cache API 里。
 * transformers.js 的 cache key 是 huggingface.co/<model>/resolve/main/<file>。
 * 我们不读 cache 细节，而是用一个轻量"静默 pipeline()"探测：
 * 若缓存齐全，progress 只会 fire initiate → ready 很快（~200ms）；
 * 若需下载，会有 download 事件，我们直接中止探测（但 transformers.js 没提供中止接口，
 * 所以用 transcriberPromise 的存在性来代替 — 只在明确安装过之后该模块对 isInstalled 返 true）。
 *
 * 实际上更可靠的方式是 localStorage 旗标：install 成功后写旗标，本函数只读 localStorage。
 */
export function isEngineInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALLED_FLAG) === "1";
  } catch {
    return false;
  }
}

const INSTALLED_FLAG = "typebridge_wasm_engine_installed";

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

/**
 * 用已加载的模型做一次转写。
 * audioBlob 是 MediaRecorder 的输出（webm/opus），需解码 + 重采样到 16kHz 再喂 Whisper。
 */
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

/**
 * Blob → Float32Array @ 16kHz mono
 * 兼容 webm/opus（MediaRecorder）、audio/mp4（iOS Safari 某些版本）等
 */
async function blobToFloat32_16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctx: any =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded: AudioBuffer = await ctx.decodeAudioData(buf.slice(0));
    // 取 channel 0（mono 或合并左声道）
    const src = decoded.getChannelData(0);
    return resampleMonoTo16k(src, decoded.sampleRate);
  } finally {
    try { ctx.close(); } catch { /* ignore */ }
  }
}

/** 线性插值重采样 mono Float32 → 16kHz */
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
