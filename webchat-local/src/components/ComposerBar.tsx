import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import ImagePicker from "./ImagePicker";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type StagedImage = { previewUrl: string; compressed: CompressResult };

type Props = {
  onSendText: (text: string) => void;
  onSendTextAndEnter: (text: string) => void;
  onSendImage: (img: CompressResult, previewUrl: string) => void;
  onImageError: (msg: string) => void;
  disabled: boolean;
};

export default function ComposerBar({
  onSendText,
  onSendTextAndEnter,
  onSendImage,
  onImageError,
  disabled,
}: Props) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedImage | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自适应高度
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = `${Math.min(120, taRef.current.scrollHeight)}px`;
  }, [text]);

  function handleSendPress() {
    if (disabled) return;
    if (staged) {
      onSendImage(staged.compressed, staged.previewUrl);
      setStaged(null);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    setShowConfirm(true);
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

  const canSend = !disabled && (staged !== null || text.trim().length > 0);

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
            {/* Title */}
            <div
              className="px-5 py-3.5 text-center text-[13px] font-medium"
              style={{ color: "var(--tb-muted)", borderBottom: "1px solid var(--tb-border)" }}
            >
              {t("chat.sendConfirmTitle")}
            </div>

            {/* 仅发送文本 */}
            <button
              type="button"
              onClick={confirmTextOnly}
              className="w-full px-5 py-4 text-[16px] text-center transition-colors active:opacity-60"
              style={{ color: "var(--tb-accent)", borderBottom: "1px solid var(--tb-border)" }}
            >
              {t("chat.sendTextOnly")}
            </button>

            {/* 发送并提交 */}
            <button
              type="button"
              onClick={confirmTextAndEnter}
              className="w-full px-5 py-4 text-[16px] font-semibold text-center transition-colors active:opacity-60"
              style={{ color: "var(--tb-accent)", borderBottom: "1px solid var(--tb-border)" }}
            >
              {t("chat.sendTextAndEnter")}
            </button>

            {/* 取消 */}
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
        className="border-t safe-area-bottom"
        style={{
          background: "var(--tb-surface)",
          borderColor: "var(--tb-border)",
        }}
      >
        <div className="flex items-end gap-2 px-3 py-2.5">
          <ImagePicker
            staged={staged}
            onPicked={(d) => setStaged(d)}
            onCleared={() => setStaged(null)}
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
              placeholder={staged ? t("composer.placeholderImageReady") : t("composer.placeholder")}
              rows={1}
              disabled={!!staged}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                  e.preventDefault();
                  handleSendPress();
                }
              }}
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-snug"
              style={{ color: "var(--tb-text)" }}
              data-allow-select
            />
          </div>

          {!staged && (
            <button
              type="button"
              onClick={handleSendPress}
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
          )}
        </div>
      </div>
    </>
  );
}
