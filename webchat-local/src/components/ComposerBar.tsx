import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import VoiceButton from "./VoiceButton";
import ImagePicker from "./ImagePicker";
import VoiceHintModal from "./VoiceHintModal";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type StagedImage = { previewUrl: string; compressed: CompressResult };

type Props = {
  onSendText: (text: string) => void;
  onSendImage: (img: CompressResult, previewUrl: string) => void;
  onImageError: (msg: string) => void;
  disabled: boolean;
};

export default function ComposerBar({
  onSendText,
  onSendImage,
  onImageError,
  disabled,
}: Props) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedImage | null>(null);
  const [showVoiceHint, setShowVoiceHint] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自适应高度
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = `${Math.min(120, taRef.current.scrollHeight)}px`;
  }, [text]);

  function send() {
    if (disabled) return;
    if (staged) {
      onSendImage(staged.compressed, staged.previewUrl);
      setStaged(null);
      return;
    }
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText("");
  }

  const canSend = !disabled && (staged !== null || text.trim().length > 0);

  return (
    <>
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
                  send();
                }
              }}
              className="w-full bg-transparent outline-none resize-none text-[15px] leading-snug"
              style={{ color: "var(--tb-text)" }}
              data-allow-select
            />
          </div>

          {!staged && (
            <VoiceButton
              onClick={() => setShowVoiceHint(true)}
            />
          )}

          <button
            type="button"
            onClick={send}
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

      {showVoiceHint && (
        <VoiceHintModal
          onClose={() => {
            setShowVoiceHint(false);
            // focus 输入框唤起键盘，让用户紧接着点键盘麦克风按钮
            setTimeout(() => taRef.current?.focus(), 80);
          }}
        />
      )}
    </>
  );
}
