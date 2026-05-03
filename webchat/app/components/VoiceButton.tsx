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

const PREF_KEY = "typebridge_voice_engine"; // "wasm" | "web-speech" | null

type Pref = "wasm" | "web-speech" | null;

type Mode =
  | { kind: "idle" }
  | { kind: "web-speech" }
  | { kind: "recording" }
  | { kind: "picker"; pickerMode: "choose" | "fallback"; reason?: string };

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
    case "engine-timeout":
    case "engine-silent":
    case "start-failed":
      return "你的系统缺少中文语音引擎，或浏览器阻止了语音识别。";
    case "aborted":
      return "";
    default:
      if (code.includes("engine") || code.includes("引擎") || code.includes("timeout")) {
        return "你的系统缺少中文语音引擎，或浏览器阻止了语音识别。";
      }
      return "浏览器语音听写启动失败。";
  }
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ 的 Safari 默认 UA 是 "MacIntel" desktop-like，用 maxTouchPoints 识别
  const isIPadOS = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || isIPadOS;
}

function readPref(): Pref {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === "wasm" || v === "web-speech" ? v : null;
  } catch {
    return null;
  }
}

function writePref(v: Pref) {
  try {
    if (v) window.localStorage.setItem(PREF_KEY, v);
    else window.localStorage.removeItem(PREF_KEY);
  } catch { /* ignore */ }
}

export default function VoiceButton({ onInterim, onFinal, onHint }: Props) {
  const [browserSupported, setBrowserSupported] = useState<boolean | null>(null);
  const [ios, setIos] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const ctrlRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    setBrowserSupported(isSpeechSupported());
    setIos(isIOS());
  }, []);

  // 决策：什么时候**完全不**渲染按钮？
  // - 不支持 SpeechRecognition **且** 未装 WASM 引擎 → 用户实际上没任何可用方案
  // - 否则都展示按钮（Web Speech / WASM / 输入法 都算可用）
  if (browserSupported === null) return null; // hydration 之前
  const wasmInstalled = isEngineInstalled();
  if (!browserSupported && !wasmInstalled) return null;

  function click() {
    const pref = readPref();

    // 偏好 1：WASM 已装 → 直接录音
    if (pref === "wasm" && wasmInstalled) {
      setMode({ kind: "recording" });
      return;
    }

    // 偏好 2：用户选过浏览器自带 → 试 Web Speech
    if (pref === "web-speech" && browserSupported) {
      tryWebSpeech();
      return;
    }

    // 无偏好：iOS 默认试 Web Speech（实测可靠、零摩擦）
    // 其他平台（Android / 鸿蒙等，Web Speech 可靠性差）→ 直接弹 Picker 让用户选
    if (!pref && ios && browserSupported) {
      tryWebSpeech();
      return;
    }

    // 默认走 Picker：让用户选方式
    setMode({ kind: "picker", pickerMode: "choose" });
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
        ctrlRef.current = null;
        const msg = friendlyErrorMessage(code);
        if (!msg) {
          // "aborted" 等静默
          setMode({ kind: "idle" });
          return;
        }
        // 之前用户偏好是 web-speech，现在失败了 → 清偏好避免下次还走这条路卡住
        if (readPref() === "web-speech") writePref(null);
        // 一次性切到 picker（fallback 模式不再展示"浏览器自带"选项）
        setMode({ kind: "picker", pickerMode: "fallback", reason: msg });
      },
      onEnd: () => {
        // speech.ts 保证 errored 时不再触发 onEnd，所以 setMode(idle) 不会覆盖 picker
        setMode({ kind: "idle" });
        ctrlRef.current = null;
      },
    });
    if (!c) {
      setMode({ kind: "picker", pickerMode: "fallback", reason: "你的浏览器不支持标准语音听写。" });
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
          pickerMode={mode.pickerMode}
          reason={mode.reason}
          webSpeechAvailable={browserSupported === true}
          onUseIme={() => {
            setMode({ kind: "idle" });
            onHint(
              "点击输入框，再点键盘上的麦克风按钮即可（搜狗 / 百度 / 讯飞 / 系统键盘都支持）。",
            );
          }}
          onUseWebSpeech={() => {
            writePref("web-speech");
            setMode({ kind: "idle" });
            // 关闭 picker 后立即启动 Web Speech；setTimeout 避免同步 setState 批处理
            // 把 picker 还没消失就开始录音的状态合并掉
            setTimeout(() => tryWebSpeech(), 50);
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
