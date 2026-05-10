import { useRef } from "react";
import { Image as ImageIcon } from "lucide-react";
import { compressImage, type CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type Props = {
  onPicked: (data: { previewUrl: string; compressed: CompressResult }) => void;
  onError: (message: string) => void;
};

/// 图片选择器：点击按钮 → 打开系统 picker → 压缩 → 回调
export default function ImagePicker({ onPicked, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    try {
      const compressed = await compressImage(file);
      const bin = atob(compressed.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: compressed.mime });
      const previewUrl = URL.createObjectURL(blob);
      onPicked({ previewUrl, compressed });
    } catch (e) {
      onError((e as Error).message || t("composer.imageProcessFail"));
    }
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
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={t("composer.imagePickAria")}
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
