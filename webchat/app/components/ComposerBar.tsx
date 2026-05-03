"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Send, X } from "lucide-react";
import VoiceButton from "./VoiceButton";
import ImagePicker from "./ImagePicker";
import type { CompressResult } from "@/app/lib/image";

type Props = {
  onSendText: (text: string) => void;
  onSendImage: (img: CompressResult) => void;
};

export default function ComposerBar({ onSendText, onSendImage }: Props) {
  const [text, setText] = useState("");
  const [stagedImage, setStagedImage] = useState<CompressResult | null>(null);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自适应高度
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = `${Math.min(120, taRef.current.scrollHeight)}px`;
  }, [text]);

  // 语音提示 8s 后自动消失
  useEffect(() => {
    if (!voiceHint) return;
    const id = window.setTimeout(() => setVoiceHint(null), 8000);
    return () => window.clearTimeout(id);
  }, [voiceHint]);

  function send() {
    if (stagedImage) {
      onSendImage(stagedImage);
      setStagedImage(null);
      return;
    }
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText("");
  }

  const canSend = stagedImage !== null || text.trim().length > 0;

  return (
    <div
      className="border-t safe-area-bottom"
      style={{
        background: "var(--tb-surface)",
        borderColor: "var(--tb-border)",
      }}
    >
      {/* 语音降级提示条 */}
      {voiceHint && (
        <div
          className="px-3 py-2 flex items-start gap-2 text-[12px] leading-relaxed animate-fade-up"
          style={{
            background: "color-mix(in srgb, var(--tb-accent) 10%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--tb-accent) 20%, transparent)",
            color: "var(--tb-text)",
          }}
        >
          <AlertCircle
            size={13}
            strokeWidth={2}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--tb-accent)" }}
          />
          <span className="flex-1">{voiceHint}</span>
          <button
            type="button"
            onClick={() => setVoiceHint(null)}
            aria-label="关闭提示"
            className="shrink-0 -m-1 p-1 text-[var(--tb-muted)]"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2.5">
        <ImagePicker
          staged={stagedImage}
          onPicked={(img) => setStagedImage(img)}
          onCleared={() => setStagedImage(null)}
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
            placeholder={stagedImage ? "图片已就绪，点发送" : "输入消息…"}
            rows={1}
            disabled={!!stagedImage}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                send();
              }
            }}
            className="w-full bg-transparent outline-none resize-none text-[15px] leading-snug placeholder:text-[var(--tb-muted)]"
            style={{ color: "var(--tb-text)" }}
            data-allow-select
          />
        </div>

        {!stagedImage && (
          <VoiceButton
            onInterim={(t) => setText(t)}
            onFinal={(t) => setText(t)}
            onError={(msg) => setVoiceHint(msg)}
          />
        )}

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="发送"
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
