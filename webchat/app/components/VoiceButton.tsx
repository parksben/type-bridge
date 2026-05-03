"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { createSpeech, isSpeechSupported, type SpeechController } from "@/app/lib/speech";

type Props = {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  /** 识别失败时的用户友好文案（组件内判断之后抛上去由 ComposerBar 展示） */
  onError: (message: string) => void;
};

// Web Speech API error code → 用户友好文案
function friendlyErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "permission-denied":
      return "浏览器被拒绝访问麦克风，请到系统设置里为浏览器授权。";
    case "no-speech":
      return "没有检测到声音，请在安静环境重试。";
    case "audio-capture":
      return "麦克风不可用，请检查系统设置。";
    case "network":
      return "语音识别需要联网，请检查网络。";
    case "service-not-allowed":
    case "language-not-supported":
      return "你的系统缺少中文语音引擎，请用手机输入法自带的麦克风按钮（搜狗 / 百度 / 讯飞 / 系统键盘都支持）。";
    case "aborted":
      return "";
    default:
      // 华为 / 小米等国产 Android 经常吐 "无法找到 Android 语音引擎" 之类文案
      if (code.includes("engine") || code.includes("引擎")) {
        return "你的系统缺少中文语音引擎，请用手机输入法自带的麦克风按钮（搜狗 / 百度 / 讯飞 / 系统键盘都支持）。";
      }
      return "语音听写启动失败。建议改用手机输入法自带的麦克风按钮。";
  }
}

export default function VoiceButton({ onInterim, onFinal, onError }: Props) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    setSupported(isSpeechSupported());
  }, []);

  if (!supported) return null;

  function toggle() {
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
      onError: (code) => {
        setActive(false);
        const msg = friendlyErrorMessage(code);
        if (msg) onError(msg);
      },
      onEnd: () => {
        setActive(false);
      },
    });
    if (!c) {
      onError("你的浏览器不支持语音听写，请改用输入法自带的麦克风按钮。");
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
