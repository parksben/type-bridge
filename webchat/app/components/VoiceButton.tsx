"use client";

import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { isEngineInstalled } from "@/app/lib/wasm-speech";
import VoiceEnginePicker from "./VoiceEnginePicker";
import AudioRecorder from "./AudioRecorder";

type Props = {
  onFinal: (text: string) => void;
  /** 通用提示（如麦克风权限被拒等，顶部 Alert 展示） — 当前组件暂不使用，
   *  保留为通用通道以便未来扩展。 */
  onHint: (message: string) => void;
};

type Mode =
  | { kind: "idle" }
  | { kind: "installing" } // 安装对话框
  | { kind: "recording" };  // WASM 录音 + 推理

// 浏览器是否支持麦克风录音（getUserMedia + MediaRecorder）。
// 我们放弃 Web Speech API —— 国产 Android ROM 大面积不可用。
// 只要能录音就能用我们的 WASM 引擎。
function isMicSupported(): boolean {
  if (typeof window === "undefined") return false;
  const md = navigator.mediaDevices;
  return Boolean(md && typeof md.getUserMedia === "function" && typeof window.MediaRecorder === "function");
}

export default function VoiceButton({ onFinal }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });

  useEffect(() => {
    setSupported(isMicSupported());
    setInstalled(isEngineInstalled());
  }, []);

  // 浏览器连麦克风录音都不支持 → 完全不展示按钮
  if (supported === null) return null;
  if (!supported) return null;

  function click() {
    if (installed) {
      setMode({ kind: "recording" });
    } else {
      setMode({ kind: "installing" });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={click}
        aria-label="开始语音输入"
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
        style={{
          background: "var(--tb-bg)",
          color: "var(--tb-muted)",
          border: "1px solid var(--tb-border)",
        }}
      >
        <Mic size={18} strokeWidth={2.2} />
      </button>

      {mode.kind === "installing" && (
        <VoiceEnginePicker
          onInstalled={() => {
            setInstalled(true);
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
