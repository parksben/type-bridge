// 图片预处理：
// - 所有图片统一压缩到最长边 ≤1600px、JPEG 85% 质量（≤2MB 目标）
// - iOS HEIC 由系统级 `<input type="file" accept="image/*">` picker 自动转成 JPEG/PNG，
//   前端拿到的就是 decode 好的 bitmap，不需要手动处理 HEIC
// - 返回 base64（不带 data: 前缀）+ mime

export interface CompressResult {
  base64: string;
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export async function compressImage(file: File): Promise<CompressResult> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(blobUrl);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 canvas context");
    ctx.drawImage(img, 0, 0, width, height);

    const outMime = "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outMime, JPEG_QUALITY),
    );
    if (!blob) throw new Error("canvas 压缩失败");

    const b64 = await blobToBase64(blob);
    return {
      base64: b64,
      mime: outMime,
      width,
      height,
      sizeBytes: blob.size,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("加载图片失败，可能是格式不支持"));
    img.src = url;
  });
}

function fitWithin(
  w: number,
  h: number,
  maxEdge: number,
): { width: number; height: number } {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  const ratio = w / h;
  if (w >= h) return { width: maxEdge, height: Math.round(maxEdge / ratio) };
  return { width: Math.round(maxEdge * ratio), height: maxEdge };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const data = reader.result as string;
      // reader 返回 "data:image/jpeg;base64,XXXX"，去掉前缀
      const comma = data.indexOf(",");
      resolve(comma >= 0 ? data.slice(comma + 1) : data);
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}
