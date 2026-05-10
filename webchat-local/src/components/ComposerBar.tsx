import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import ImagePicker from "./ImagePicker";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type StagedImage = { id: string; previewUrl: string; compressed: CompressResult };

type Props = {
  onSendText: (text: string) => void;
  onSendTextAndEnter: (text: string) => void;
  onSendImage: (img: CompressResult, previewUrl: string) => void;
  onImageError: (msg: string) => void;
  disabled: boolean;
};

let _idCounter = 0;
function nextId() { return String(++_idCounter); }

export default function ComposerBar({
  onSendText,
  onSendTextAndEnter,
  onSendImage,
  onImageError,
  disabled,
}: Props) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自适应高度
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = `${Math.min(120, taRef.current.scrollHeight)}px`;
  }, [text]);

  function addImage(data: { previewUrl: string; compressed: CompressResult }) {
    setStaged((prev) => [...prev, { id: nextId(), ...data }]);
  }

  function removeImage(id: string) {
    setStaged((prev) => {
      const item = prev.find((s) => s.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  async function handleSendPress() {
    if (disabled) return;
    const hasImages = staged.length > 0;
    const hasText = text.trim().length > 0;
    if (!hasImages && !hasText) return;

    // 先发所有图片
    if (hasImages) {
      const toSend = [...staged];
      setStaged([]);
      for (const img of toSend) {
        onSendImage(img.compressed, img.previewUrl);
      }
    }

    // 有文字再弹确认
    if (hasText) {
      setShowConfirm(true);
    }
  }

  function confirmTextOnly() {
    setShowConfirm(false);
    const trimmed = text.trim();
    if (trimmed) { onSendText(trimmed); setText(""); }
  }

  function confirmTextAndEnter() {
    setShowConfirm(false);
    const trimmed = text.trim();
    if (trimmed) { onSendTextAndEnter(trimmed); setText(""); }
  }

  const canSend = !disabled && (staged.length > 0 || text.trim().length > 0);

  return (
    <>
      {/* ── Send confirmation bottom sheet ─────────────────── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.42)" }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full rounded-t-2xl overflow-hidden safe-area-bottom"
            style={{ background: "var(--tb-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-5 py-3.5 text-center text-[13px] font-medium"
              style={{ color: "var(--tb-muted)", borderBottom: "1px solid var(--tb-border)" }}
            >
              {t("chat.sendConfirmTitle")}
            </div>
            <button
              type="button"
              onClick={confirmTextOnly}
              className="w-full px-5 py-4 text-[16px] text-center transition-colors active:opacity-60"
              style={{ color: "var(--tb-accent)", borderBottom: "1px solid var(--tb-border)" }}
            >
              {t("chat.sendTextOnly")}
            </button>
            <button
              type="button"
              onClick={confirmTextAndEnter}
              className="w-full px-5 py-4 text-[16px] font-semibold text-center transition-colors active:opacity-60"
              style={{ color: "var(--tb-accent)", borderBottom: "1px solid var(--tb-border)" }}
            >
              {t("chat.sendTextAndEnter")}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="w-full px-5 py-4 text-[16px] text-center transition-colors active:opacity-60"
              style={{ color: "var(--tb-muted)" }}
            >
              {t("chat.cancelSend")}
            </button>
          </div>
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────── */}
      <div
        className="border-t safe-area-bottom shrink-0"
        style={{
          background: "var(--tb-surface)",
          borderColor: "var(--tb-border)",
        }}
      >
        {/* ── Attachments strip（仅有图片时显示）──────────── */}
        {staged.length > 0 && (
          <div
            className="flex gap-2 px-3 pt-2.5 pb-1 overflow-x-auto scrollbar-none"
          >
            {staged.map((img) => (
              <div key={img.id} className="relative shrink-0">
                <img
                  src={img.previewUrl}
                  alt=""
                  className="w-14 h-14 object-cover rounded-xl"
                  style={{ border: "1px solid var(--tb-border)" }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  aria-label={t("composer.imageRemoveAria")}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: "var(--tb-text)",
                    color: "var(--tb-surface)",
                  }}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Input row ──────────────────────────────────── */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <ImagePicker
            onPicked={addImage}
            onError={onImageError}
          />

          <div
            className="flex-1 rounded-2xl border px-3.5 py-2 min-h-10 flex items-center"
            style={{
              background: "var(--tb-bg)",
              borderColor: "var(--tb-border)",
            }}
          >
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("composer.placeholder")}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                  e.preventDefault();
                  void handleSendPress();
                }
              }}
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-snug"
              style={{ color: "var(--tb-text)" }}
              data-allow-select
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSendPress()}
            disabled={!canSend}
            aria-label={t("composer.sendAria")}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{
              background: canSend ? "var(--tb-accent)" : "var(--tb-bg)",
              color: canSend ? "white" : "var(--tb-muted)",
              border: canSend ? "none" : "1px solid var(--tb-border)",
            }}
          >
            <Send size={17} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </>
  );
}
