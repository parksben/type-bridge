"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, X, Loader2 } from "lucide-react";
import { compressImage, type CompressResult } from "@/app/lib/image";

type Props = {
  /** 用户选好图、压完之后 */
  onPicked: (img: CompressResult) => void;
  /** 用户取消 / 删除当前 staged 的图 */
  onCleared?: () => void;
  /** 是否已经有 staged 图，UI 改为预览 + 删除模式 */
  staged?: CompressResult | null;
};

export default function ImagePicker({ onPicked, onCleared, staged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function pickFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const r = await compressImage(file);
      onPicked(r);
    } catch (e) {
      setError((e as Error).message || "图片处理失败");
    } finally {
      setBusy(false);
    }
  }

  if (staged) {
    return (
      <div className="relative shrink-0">
        <img
          src={`data:${staged.mime};base64,${staged.data}`}
          alt=""
          className="w-10 h-10 rounded-lg object-cover"
        />
        <button
          type="button"
          onClick={() => onCleared?.()}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: "var(--tb-text)", color: "var(--tb-bg)" }}
          aria-label="移除图片"
        >
          <X size={10} strokeWidth={3} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // 允许同一文件二次选取
          if (f) pickFile(f);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="选择图片"
        title={error ?? undefined}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0"
        style={{
          background: "var(--tb-bg)",
          color: "var(--tb-muted)",
          border: "1px solid var(--tb-border)",
        }}
      >
        {busy ? (
          <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
        ) : (
          <ImageIcon size={18} strokeWidth={2.2} />
        )}
      </button>
    </>
  );
}
