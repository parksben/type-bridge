// 客户端图片处理：File → canvas → JPEG base64，自动压到 ≤2MB。
//
// iOS 12+ Safari 拍照得到的 HEIC 在 <input type="file"> 通常会被自动转 JPEG
// （只要 input 没指定 capture="environment"），所以我们这里**不**特意处理 HEIC，
// 只统一走 canvas 重编码就够。

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1920;

export type CompressResult = {
  data: string; // base64 (no `data:` prefix)
  mime: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
};

export async function compressImage(file: File): Promise<CompressResult> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const { width, height } = scaleToMax(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(img, 0, 0, width, height);

  // 逐档降 quality 直到 ≤2 MB
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const blob = await canvasToBlob(canvas, q);
    if (blob.size <= MAX_BYTES) {
      const base64 = await blobToBase64(blob);
      return {
        data: base64,
        mime: "image/jpeg",
        width,
        height,
        bytes: blob.size,
      };
    }
  }

  // 最差情况：再缩一半
  const halfCanvas = document.createElement("canvas");
  halfCanvas.width = Math.round(width / 2);
  halfCanvas.height = Math.round(height / 2);
  const ctx2 = halfCanvas.getContext("2d");
  if (!ctx2) throw new Error("canvas context unavailable");
  ctx2.drawImage(canvas, 0, 0, halfCanvas.width, halfCanvas.height);
  const blob = await canvasToBlob(halfCanvas, 0.7);
  const base64 = await blobToBase64(blob);
  return {
    data: base64,
    mime: "image/jpeg",
    width: halfCanvas.width,
    height: halfCanvas.height,
    bytes: blob.size,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

function scaleToMax(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const r = Math.max(w, h) / max;
  return { width: Math.round(w / r), height: Math.round(h / r) };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      // strip "data:image/jpeg;base64,"
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
