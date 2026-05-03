"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";
import { transcribe } from "@/app/lib/wasm-speech";

type Props = {
  onDone: (text: string) => void;
  onCancel: () => void;
};

type Phase = "recording" | "transcribing" | "error";

const MAX_SECS = 30; // Whisper 单次 chunk 上限

/** 全屏遮罩式录音器：计时 + 停止 + 自动转写 */
export default function AudioRecorder({ onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>("recording");
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  // 启动录音
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // 选一个浏览器都能解码的编码
        const mime =
          (MediaRecorder.isTypeSupported("audio/webm;codecs=opus") && "audio/webm;codecs=opus") ||
          (MediaRecorder.isTypeSupported("audio/webm") && "audio/webm") ||
          (MediaRecorder.isTypeSupported("audio/mp4") && "audio/mp4") ||
          "";

        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (chunksRef.current.length === 0) {
            setError("未录到声音");
            setPhase("error");
            return;
          }
          setPhase("transcribing");
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          try {
            const text = await transcribe(blob);
            if (!text) {
              setError("没有识别到文字，请再说一次");
              setPhase("error");
              return;
            }
            onDone(text);
          } catch (e) {
            setError((e as Error).message || "识别失败");
            setPhase("error");
          }
        };
        recorder.start();

        // 计时 ticker
        tickRef.current = window.setInterval(() => {
          setSecs((s) => {
            const next = s + 1;
            if (next >= MAX_SECS) {
              stopRecording();
            }
            return next;
          });
        }, 1000);
      } catch (e) {
        const msg = (e as Error).message || "无法访问麦克风";
        setError(
          msg.includes("permission") || msg.includes("denied") || msg.includes("NotAllowed")
            ? "浏览器被拒绝访问麦克风，请到系统设置里为浏览器授权。"
            : `无法访问麦克风：${msg}`,
        );
        setPhase("error");
      }
    }

    start();
    return () => {
      cancelled = true;
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try { rec.stop(); } catch { /* ignore */ }
      }
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  function stopRecording() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* ignore */ }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center safe-area-top safe-area-bottom"
      style={{ background: "color-mix(in srgb, var(--tb-bg) 88%, transparent)", backdropFilter: "blur(8px)" }}
    >
      <div className="w-full max-w-sm px-6 py-8 text-center">
        {phase === "recording" && (
          <>
            <div className="flex items-center justify-center mb-6">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: "var(--tb-accent)",
                  boxShadow: "0 0 0 0 var(--tb-accent)",
                  animation: "pulse-record 1.4s ease-in-out infinite",
                }}
              >
                <Mic size={38} strokeWidth={2.2} className="text-white" />
              </div>
            </div>
            <p className="text-[15px] font-medium mb-1 text-[var(--tb-text)]">正在听你说…</p>
            <p className="text-[12px] text-[var(--tb-muted)] font-mono mb-8">
              {formatTime(secs)} / 00:{MAX_SECS.toString().padStart(2, "0")}
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={onCancel}
                aria-label="取消"
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{
                  background: "var(--tb-surface)",
                  border: "1px solid var(--tb-border)",
                  color: "var(--tb-muted)",
                }}
              >
                <X size={20} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                aria-label="完成并识别"
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "var(--tb-accent)", color: "white" }}
              >
                <Square size={22} strokeWidth={2.4} fill="white" />
              </button>
              <div className="w-14" />
            </div>

            <p className="text-[11px] text-[var(--tb-muted)] mt-6">
              在本地识别，音频不离开手机
            </p>
          </>
        )}

        {phase === "transcribing" && (
          <>
            <Loader2 size={36} strokeWidth={1.8} className="animate-spin text-[var(--tb-accent)] mx-auto mb-5" />
            <p className="text-[15px] font-medium mb-1 text-[var(--tb-text)]">正在识别…</p>
            <p className="text-[12px] text-[var(--tb-muted)]">首次推理会慢一点，之后会更快</p>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="text-[15px] font-medium mb-2 text-[var(--tb-text)]">识别未完成</p>
            <p className="text-[13px] text-[var(--tb-muted)] mb-6 leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={onCancel}
              className="h-10 px-6 rounded-lg font-medium text-white"
              style={{ background: "var(--tb-accent)" }}
            >
              知道了
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
