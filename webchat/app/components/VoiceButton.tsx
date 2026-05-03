"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { createSpeech, isSpeechSupported, type SpeechController } from "@/app/lib/speech";

type Props = {
  /** 听写过程中实时回填到输入框 */
  onInterim?: (text: string) => void;
  /** 听写最终结果（点 stop 或自然结束） */
  onFinal: (text: string) => void;
};

/** 单击切换：开始 / 停止听写。
 *  长按 / 滑动取消的交互在 v1 不做，保持简单。 */
export default function VoiceButton({ onInterim, onFinal }: Props) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    setSupported(isSpeechSupported());
  }, []);

  if (!supported) return null;

  function toggle() {
    setError(null);
    if (active) {
      ctrlRef.current?.stop();
      return;
    }
    const c = createSpeech({
      lang: "zh-CN",
      onInterim: (t) => onInterim?.(t),
      onFinal: (t) => {
        onFinal(t);
        setActive(false);
      },
      onError: (msg) => {
        setError(msg);
        setActive(false);
      },
      onEnd: () => {
        setActive(false);
      },
    });
    if (!c) {
      setError("浏览器不支持语音听写");
      return;
    }
    ctrlRef.current = c;
    c.start();
    setActive(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={active ? "停止听写" : "开始听写"}
      className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
      style={{
        background: active ? "var(--tb-accent)" : "var(--tb-bg)",
        color: active ? "white" : "var(--tb-muted)",
        border: `1px solid ${active ? "var(--tb-accent)" : "var(--tb-border)"}`,
      }}
      title={error ?? undefined}
    >
      {active ? (
        <Loader2 size={18} strokeWidth={2.4} className="animate-spin" />
      ) : (
        <Mic size={18} strokeWidth={2.2} />
      )}
    </button>
  );
}

export { MicOff };
