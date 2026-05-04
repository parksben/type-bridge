"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import {
  installEngine,
  isEngineInstalled,
  markEngineInstalled,
  type InstallProgress,
} from "@/app/lib/wasm-speech";
import VoiceEnginePicker from "./VoiceEnginePicker";
import AudioRecorder from "./AudioRecorder";

type Props = {
  onFinal: (text: string) => void;
  /** 通用提示（如麦克风权限被拒等，顶部 Alert 展示） */
  onHint: (message: string) => void;
};

type Mode =
  | { kind: "idle" }
  | { kind: "picker" }       // 展示安装对话框（intro / installing / error 都在 Picker 内）
  | { kind: "downloading" }  // 面板已收起到后台，下载继续，麦克风按钮显示环形进度
  | { kind: "recording" };   // WASM 录音 + 推理

export type DownloadState = {
  stage: "intro" | "installing" | "error";
  percent: number;
  loaded: number;
  total: number;
  retryInfo: { attempt: number; maxAttempts: number; delaySecs: number } | null;
  errorMsg: string | null;
};

// 浏览器是否支持麦克风录音（getUserMedia + MediaRecorder）
function isMicSupported(): boolean {
  if (typeof window === "undefined") return false;
  const md = navigator.mediaDevices;
  return Boolean(
    md &&
      typeof md.getUserMedia === "function" &&
      typeof window.MediaRecorder === "function",
  );
}

const INITIAL_DOWNLOAD_STATE: DownloadState = {
  stage: "intro",
  percent: 0,
  loaded: 0,
  total: 35 * 1024 * 1024,
  retryInfo: null,
  errorMsg: null,
};

export default function VoiceButton({ onFinal }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [download, setDownload] = useState<DownloadState>(INITIAL_DOWNLOAD_STATE);

  // 下载任务是否在后台跑。不同于 mode.kind —— 即使用户收起了面板，
  // installEngine 仍在 background 跑，finished 时 flip installed & 清 mode。
  const installTaskActiveRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setSupported(isMicSupported());
    setInstalled(isEngineInstalled());
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const handleProgress = useCallback((p: InstallProgress) => {
    if (cancelledRef.current) return;
    setDownload((prev) => {
      switch (p.kind) {
        case "progress":
          return {
            ...prev,
            percent: p.percent,
            loaded: p.totalLoaded,
            total: p.totalBytes,
            retryInfo: null,
            errorMsg: null,
          };
        case "retrying":
          return {
            ...prev,
            retryInfo: {
              attempt: p.attempt,
              maxAttempts: p.maxAttempts,
              delaySecs: p.delaySecs,
            },
          };
        case "ready":
          return { ...prev, percent: 100, retryInfo: null, errorMsg: null };
        default:
          return prev;
      }
    });
  }, []);

  const startInstall = useCallback(async () => {
    if (installTaskActiveRef.current) return;
    installTaskActiveRef.current = true;
    setDownload({ ...INITIAL_DOWNLOAD_STATE, stage: "installing" });
    setMode({ kind: "picker" });
    try {
      await installEngine(handleProgress);
      if (cancelledRef.current) return;
      markEngineInstalled();
      setInstalled(true);
      installTaskActiveRef.current = false;
      // 下载完成后：
      // - 若用户还开着 Picker → 自动进入录音器
      // - 若已收起到后台 → 回 idle，让麦克风按钮恢复正常（下次点即开始录音）
      setMode((current) =>
        current.kind === "picker"
          ? { kind: "recording" }
          : { kind: "idle" },
      );
    } catch (e) {
      installTaskActiveRef.current = false;
      if (cancelledRef.current) return;
      const msg = (e as Error).message || "下载失败，请检查网络后重试";
      setDownload((prev) => ({ ...prev, stage: "error", errorMsg: msg }));
      // 若面板已收起，失败时主动把面板弹回来让用户看到错误
      setMode({ kind: "picker" });
    }
  }, [handleProgress]);

  const onPickerClose = useCallback(() => {
    // 关闭面板有两种语义：
    // - stage === "intro"：用户放弃，回 idle，什么都不做
    // - stage === "installing"：收起到后台，保留安装任务
    // - stage === "error"：用户关闭错误对话框，回 idle
    setMode((current) => {
      if (download.stage === "installing" && installTaskActiveRef.current) {
        return { kind: "downloading" };
      }
      return { kind: "idle" };
    });
  }, [download.stage]);

  function onMicClick() {
    // 已安装：直接录音
    if (installed) {
      setMode({ kind: "recording" });
      return;
    }
    // 正在后台下载：点击麦克风按钮把面板弹回前台（方便用户看进度）
    if (mode.kind === "downloading") {
      setMode({ kind: "picker" });
      return;
    }
    // 未安装：弹出 intro 面板
    setDownload(INITIAL_DOWNLOAD_STATE);
    setMode({ kind: "picker" });
  }

  if (supported === null) return null;
  if (!supported) return null;

  const isDownloadingInBg = mode.kind === "downloading" && installTaskActiveRef.current;

  return (
    <>
      <button
        type="button"
        onClick={onMicClick}
        aria-label={
          isDownloadingInBg
            ? `语音引擎下载中 ${Math.floor(download.percent)}%`
            : "开始语音输入"
        }
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 relative"
        style={{
          background: "var(--tb-bg)",
          color: isDownloadingInBg ? "var(--tb-accent)" : "var(--tb-muted)",
          border: `1px solid ${isDownloadingInBg ? "transparent" : "var(--tb-border)"}`,
        }}
      >
        {isDownloadingInBg && <ProgressRing percent={download.percent} />}
        <Mic size={18} strokeWidth={2.2} />
      </button>

      {mode.kind === "picker" && (
        <VoiceEnginePicker
          download={download}
          onConfirmInstall={startInstall}
          onMinimize={() => setMode({ kind: "downloading" })}
          onClose={onPickerClose}
          onRetry={startInstall}
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

/** 麦克风按钮外圈的 SVG 环形进度指示。percent 0-100。 */
function ProgressRing({ percent }: { percent: number }) {
  const size = 40;
  const stroke = 2.2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 -rotate-90 pointer-events-none"
      style={{ overflow: "visible" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--tb-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--tb-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        style={{ transition: "stroke-dasharray 0.3s ease-out" }}
      />
    </svg>
  );
}
