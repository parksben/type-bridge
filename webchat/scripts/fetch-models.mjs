#!/usr/bin/env node
// 预构建脚本：把 Whisper tiny 模型文件 + ONNX Runtime WASM 文件放到 public/ 下，
// 让浏览器从同域（webchat-typebridge.parksben.xyz）加载，避开国际 CDN 在国内
// 不稳定 / 慢的问题。
//
// 运行时机：npm run build 之前自动触发（作为 prebuild script）；Netlify build
// 环境在美国，从 HuggingFace 下载正常快；本地 dev 时若国内网络没代理会失败，
// 可以拷贝 node_modules/@huggingface/transformers 的缓存或手动下一份放 public/
// 下即可（一次性）。
//
// 已存在的文件会被 skip，支持增量 + 本地缓存。

import { mkdir, stat, copyFile, readdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const HF_BASE = "https://huggingface.co";
const MODEL = "Xenova/whisper-tiny";

// Whisper 模型需要的文件清单。运行时由 wasm-speech.ts 里 dtype: "int8" 指定
// transformers.js 加载 int8 变体。这里只下 int8（~30MB），不下其他 dtype 的备份，
// 避免 deploy 体积膨胀。如果将来要切 dtype，改这里 + wasm-speech.ts 同步。
// 404 文件自动跳过（某些可选 config 不存在于所有模型仓库）。
const MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "normalizer.json",
  "added_tokens.json",
  "merges.txt",
  "vocab.json",
  "onnx/encoder_model_int8.onnx",
  "onnx/decoder_model_merged_int8.onnx",
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, dest) {
  if (await exists(dest)) {
    console.log(`  cached: ${dest.replace(ROOT + "/", "")}`);
    return "cached";
  }
  console.log(`  get:    ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      console.log(`  skip(404): ${url}`);
      return "missing";
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  const fileStream = createWriteStream(dest);
  await pipeline(res.body, fileStream);
  return "downloaded";
}

async function downloadModel() {
  console.log(`\n[model] ${MODEL}`);
  const modelDir = join(ROOT, "public", "models", MODEL);
  let downloaded = 0;
  let cached = 0;
  let missing = 0;
  for (const file of MODEL_FILES) {
    const url = `${HF_BASE}/${MODEL}/resolve/main/${file}`;
    const dest = join(modelDir, file);
    try {
      const r = await downloadFile(url, dest);
      if (r === "downloaded") downloaded++;
      else if (r === "cached") cached++;
      else if (r === "missing") missing++;
    } catch (e) {
      console.warn(`  FAIL: ${file} — ${e.message}`);
      // 关键文件失败继续，但整体 build 是否能跑起来取决于运行时
    }
  }
  console.log(
    `  [model] ${downloaded} downloaded, ${cached} cached, ${missing} missing`,
  );
}

// transformers.js 运行时实际会加载的两组 ONNX WASM：
//   1) ort-wasm-simd-threaded.{wasm,mjs} — 主力（SIMD + 多线程，~12MB）
//      需要 SharedArrayBuffer（默认要求 COOP+COEP；现代手机浏览器大都能满足）
//   2) ort-wasm-simd-threaded.asyncify.{wasm,mjs} — fallback（asyncify，~22MB）
//      不依赖 SharedArrayBuffer，iOS 16.4 以下 / 无 COOP-COEP 环境走这组
//
// jsep (WebGPU) / jspi (WebAssembly Promise Integration) 是特殊加速变体，
// transformers.js 不会自动用；丢掉省带宽。
const ORT_KEEP = new Set([
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
]);

async function copyOrtWasm() {
  console.log(`\n[ort] onnxruntime-web runtime`);
  const src = join(ROOT, "node_modules", "onnxruntime-web", "dist");
  const dst = join(ROOT, "public", "ort");
  if (!(await exists(src))) {
    console.warn(`  onnxruntime-web 不在 node_modules 里，跳过`);
    return;
  }
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src);
  let copied = 0;
  let cached = 0;
  for (const f of entries) {
    if (!ORT_KEEP.has(f)) continue;
    const s = join(src, f);
    const d = join(dst, f);
    if (await exists(d)) {
      cached++;
      continue;
    }
    await copyFile(s, d);
    copied++;
  }
  console.log(`  [ort] ${copied} copied, ${cached} cached`);
}

console.log("Fetching WebChat voice engine assets to public/ …");
await downloadModel();
await copyOrtWasm();
console.log("\nDone.\n");
