"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { createSpeech, isSpeechSupported, type SpeechController } from "@/app/lib/speech";
import { isEngineInstalled } from "@/app/lib/wasm-speech";
import VoiceEnginePicker from "./VoiceEnginePicker";
import AudioRecorder from "./AudioRecorder";

type Props = {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  /** 展示给用户的降级引导 / 其他文案 */
  onHint: (message: string) => void;
};

const PREF_KEY = "typebridge_voice_engine"; // "wasm" | null

type Mode =
  | { kind: "idle" }
  | { kind: "web-speech" }     // Web Speech API 进行中
  | { kind: "recording" }      // WASM 录音器展开
  | { kind: "picker"; reason?: string };

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
      return "你的系统缺少中文语音引擎。";
    case "aborted":
      return "";
    default:
      if (code.includes("engine") || code.includes("引擎")) {
        return "你的系统缺少中文语音引擎。";
      }
      return "浏览器语音听写启动失败。";
  }
}

function readPref(): "wasm" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === "wasm" ? "wasm" : null;
  } catch {
    return null;
  }
}

function writePref(v: "wasm" | null) {
  try {
    if (v) window.localStorage.setItem(PREF_KEY, v);
    else window.localStorage.removeItem(PREF_KEY);
  } catch { /* ignore */ }
}

export default function VoiceButton({ onInterim, onFinal, onHint }: Props) {
  const [browserSupported, setBrowserSupported] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    setBrowserSupported(isSpeechSupported());
  }, []);

  // 没有任何可行的 Web Speech API 入口 → 完全不展示按钮
  // （此设备连 SpeechRecognition 接口都没有）
  if (!browserSupported) return null;

  const preferWasm = readPref() === "wasm";
  const wasmInstalled = isEngineInstalled();

  function click() {
    // 已选过 WASM 且模型已缓存 → 直接录音
    if (preferWasm && wasmInstalled) {
      setMode({ kind: "recording" });
      return;
    }

    // 否则试 Web Speech（第一段）
    tryWebSpeech();
  }

  function tryWebSpeech() {
    const c = createSpeech({
      lang: "zh-CN",
      onInterim: (t) => onInterim?.(t),
      onFinal: (t) => {
        onFinal(t);
        setMode({ kind: "idle" });
        ctrlRef.current = null;
      },
      onError: (code) => {
        setMode({ kind: "idle" });
        ctrlRef.current = null;
        const msg = friendlyErrorMessage(code);
        if (!msg) return; // "aborted" 之类静默
        // Web Speech 失败 → 弹 Picker，让用户选降级
        setMode({ kind: "picker", reason: msg });
      },
      onEnd: () => {
        setMode({ kind: "idle" });
        ctrlRef.current = null;
      },
    });
    if (!c) {
      setMode({ kind: "picker", reason: "你的浏览器不支持标准语音听写。" });
      return;
    }
    ctrlRef.current = c;
    c.start();
    setMode({ kind: "web-speech" });
  }

  function stopWebSpeech() {
    ctrlRef.current?.stop();
  }

  const active = mode.kind === "web-speech";

  return (
    <>
      <button
        type="button"
        onClick={active ? stopWebSpeech : click}
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

      {mode.kind === "picker" && (
        <VoiceEnginePicker
          reason={mode.reason}
          onUseIme={() => {
            setMode({ kind: "idle" });
            onHint(
              "已切回输入法语音。点击输入框，再点键盘上的麦克风按钮即可（搜狗 / 百度 / 讯飞 / 系统键盘都支持）。",
            );
          }}
          onInstalled={() => {
            writePref("wasm");
            setMode({ kind: "recording" });
          }}
          onClose={() => setMode({ kind: "idle" })}
        />
      )}

      {mode.kind === "recording" && (
        <AudioRecorder
          onDone={(text) => {
            setMode({ kind: "idle" });
            if (text) onFinal(text);
          }}
          onCancel={() => setMode({ kind: "idle" })}
        />
      )}
    </>
  );
}
