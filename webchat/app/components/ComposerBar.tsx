"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
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
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 自适应高度
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = `${Math.min(120, taRef.current.scrollHeight)}px`;
  }, [text]);

  function send() {
    if (stagedImage) {
      onSendImage(stagedImage);
      setStagedImage(null);
      // 不清 text；用户可能图配文一起想发，但 v1 只发图
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
              // 桌面端 Enter 发送（手机端不触发，物理键盘兼容）
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
