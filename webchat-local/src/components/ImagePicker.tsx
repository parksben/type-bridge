import { useRef } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { compressImage, type CompressResult } from "@/lib/image";

type Props = {
  /** 已选但还没发送的图片（展示预览） */
  staged: { previewUrl: string; compressed: CompressResult } | null;
  onPicked: (data: { previewUrl: string; compressed: CompressResult }) => void;
  onCleared: () => void;
  onError: (message: string) => void;
};

/// 图片选择器：点击按钮 → 打开系统 picker（相机 or 相册）→ 压缩 → 展示预览
export default function ImagePicker({ staged, onPicked, onCleared, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      const compressed = await compressImage(file);
      // 重建一个 Blob 用于预览（避免占用太多内存）
      const bin = atob(compressed.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: compressed.mime });
      const previewUrl = URL.createObjectURL(blob);
      onPicked({ previewUrl, compressed });
    } catch (e) {
      onError((e as Error).message || "图片处理失败");
    }
  }

  if (staged) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
        style={{ background: "var(--tb-surface)", border: "1px solid var(--tb-border)" }}
      >
        <img
          src={staged.previewUrl}
          alt=""
          className="w-10 h-10 object-cover rounded-md"
        />
        <button
          type="button"
          onClick={() => {
            URL.revokeObjectURL(staged.previewUrl);
            onCleared();
          }}
          aria-label="移除图片"
          className="text-[var(--tb-muted)] p-1 -m-1"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // 允许连续选同一张
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="发送图片"
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors"
        style={{
          background: "var(--tb-bg)",
          border: "1px solid var(--tb-border)",
          color: "var(--tb-muted)",
        }}
      >
        <ImageIcon size={18} strokeWidth={2.2} />
      </button>
    </>
  );
}
