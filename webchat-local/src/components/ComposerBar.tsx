import { useEffect, useRef, useState } from "react";
import { Keyboard, Send } from "lucide-react";
import ImagePicker from "./ImagePicker";
import ShortcutKeysPanel from "./ShortcutKeysPanel";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type StagedImage = { previewUrl: string; compressed: CompressResult };

const LS_SHORTCUTS_EXPANDED = "tb_webchat_shortcuts_expanded";

type Props = {
  onSendText: (text: string) => void;
  onSendImage: (img: CompressResult, previewUrl: string) => void;
  onSendKey: (code: string) => void;
  onImageError: (msg: string) => void;
  disabled: boolean;
};

export default function ComposerBar({
  onSendText,
  onSendImage,
  onSendKey,
  onImageError,
  disabled,
}: Props) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedImage | null>(null);
  const [shortcutsExpanded, setShortcutsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_SHORTCUTS_EXPANDED) === "1";
    } catch {
      return false;
    }
  });
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自适应高度
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = `${Math.min(120, taRef.current.scrollHeight)}px`;
  }, [text]);

  function toggleShortcuts() {
    setShortcutsExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_SHORTCUTS_EXPANDED, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
    <div
      className="border-t safe-area-bottom"
      style={{
        background: "var(--tb-surface)",
        borderColor: "var(--tb-border)",
      }}
    >
      {shortcutsExpanded && (
        <ShortcutKeysPanel onPress={onSendKey} disabled={disabled} />
      )}

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
          <button
            type="button"
            onClick={toggleShortcuts}
            aria-label={t(
              shortcutsExpanded
                ? "composer.shortcutsCollapse"
                : "composer.shortcutsExpand",
            )}
            aria-pressed={shortcutsExpanded}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
            style={{
              background: shortcutsExpanded ? "var(--tb-accent)" : "var(--tb-bg)",
              color: shortcutsExpanded ? "white" : "var(--tb-muted)",
              border: shortcutsExpanded ? "none" : "1px solid var(--tb-border)",
            }}
          >
            <Keyboard size={18} strokeWidth={2.2} />
          </button>
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
  );
}
