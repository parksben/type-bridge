"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Cpu, Download, Loader2, Mic, Shield, X } from "lucide-react";
import {
  installEngine,
  markEngineInstalled,
  type InstallProgress,
} from "@/app/lib/wasm-speech";

// 用户首次点击麦克风按钮时弹出。文件名保留 VoiceEnginePicker 是历史原因，
// 实际上现在只有一个 "安装本地语音引擎" 功能，不再是多选项 picker。

type Props = {
  onInstalled: () => void;
  onClose: () => void;
};

type Stage = "intro" | "installing" | "error";

export default function VoiceEnginePicker({ onInstalled, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const startInstall = useCallback(async () => {
    setStage("installing");
    setErrorMsg(null);
    setProgress(null);
    try {
      await installEngine((p) => {
        if (cancelledRef.current) return;
        setProgress(p);
      });
      if (cancelledRef.current) return;
      markEngineInstalled();
      onInstalled();
    } catch (e) {
      if (cancelledRef.current) return;
      setErrorMsg((e as Error).message || "下载失败，请检查网络后重试");
      setStage("error");
    }
  }, [onInstalled]);

  // 进度文案 + 条宽度计算（基于新的累计进度协议，无抖动）
  let progressText = "准备中…";
  let progressSubText: string | null = null;
  let percent = 0;
  let retrying = false;
  if (progress) {
    switch (progress.kind) {
      case "progress":
        percent = Math.max(0, Math.min(99, progress.percent));
        progressText = `${formatBytes(progress.totalLoaded)} / ${formatBytes(progress.totalBytes)}`;
        progressSubText = `${percent.toFixed(0)}% · ${progress.currentFile || ""}`;
        break;
      case "download":
        progressText = `正在下载 ${progress.file || "模型文件"}…`;
        break;
      case "done":
        progressText = `${progress.file || "文件"} 完成，继续…`;
        break;
      case "initiate":
        progressText = `准备下载 ${progress.file || "模型"}…`;
        break;
      case "ready":
        progressText = "加载完成";
        percent = 100;
        break;
      case "retrying":
        retrying = true;
        progressText = `网络不稳，第 ${progress.attempt}/${progress.maxAttempts} 次重试…`;
        progressSubText = `${progress.delaySecs}s 后自动重试 · 已下完的文件会跳过，不会重下`;
        break;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: "color-mix(in srgb, var(--tb-bg) 70%, transparent)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== "installing") onClose();
      }}
    >
      <div
        className="w-full max-w-md mx-auto animate-fade-up safe-area-bottom"
        style={{
          background: "var(--tb-surface)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderTop: "1px solid var(--tb-border)",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.10)",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--tb-border)" }} />
        </div>

        {stage === "intro" && <IntroView onCancel={onClose} onConfirm={startInstall} />}

        {stage === "installing" && (
          <InstallingView
            progressText={progressText}
            progressSubText={progressSubText}
            percent={percent}
            retrying={retrying}
            onCancel={() => {
              cancelledRef.current = true;
              onClose();
            }}
          />
        )}

        {stage === "error" && (
          <ErrorView
            message={errorMsg || "下载失败"}
            onRetry={startInstall}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}

function IntroView({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)" }}
        >
          <Cpu size={22} strokeWidth={2} className="text-[var(--tb-accent)]" />
        </div>
        <div className="flex-1">
          <p className="text-[16px] font-semibold text-[var(--tb-text)] mb-1">
            启用语音输入
          </p>
          <p className="text-[13px] text-[var(--tb-muted)] leading-relaxed">
            语音功能需要先在手机浏览器里下载一个 <strong className="text-[var(--tb-text)]">~40MB</strong> 的本地语音引擎。
            <br />
            下载后保存在浏览器，<span className="text-[var(--tb-text)]">下次打开直接用，不再下载</span>。
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="关闭"
          className="shrink-0 -m-1 p-1 text-[var(--tb-muted)]"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div
        className="rounded-lg p-3 mb-5"
        style={{
          background: "var(--tb-bg)",
          border: "1px solid var(--tb-border)",
        }}
      >
        <ul className="flex flex-col gap-2 text-[12px] text-[var(--tb-muted)] leading-relaxed">
          <li className="flex items-start gap-2">
            <Mic size={12} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: "var(--tb-accent)" }} />
            <span>
              基于 Whisper tiny 开源模型，支持中文。识别完全在
              <span className="text-[var(--tb-text)]">你的手机本地</span>完成。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Shield size={12} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: "var(--tb-accent)" }} />
            <span>
              音频不会离开你的手机，不上传到任何服务器。
            </span>
          </li>
        </ul>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-lg font-medium text-[14px]"
          style={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
            color: "var(--tb-text)",
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 h-11 rounded-lg font-medium text-[14px] text-white flex items-center justify-center gap-1.5"
          style={{ background: "var(--tb-accent)" }}
        >
          <Download size={14} strokeWidth={2.2} />
          开始下载
        </button>
      </div>
    </div>
  );
}

function InstallingView({
  progressText,
  progressSubText,
  percent,
  retrying,
  onCancel,
}: {
  progressText: string;
  progressSubText: string | null;
  percent: number;
  retrying: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-center mb-4 mt-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: retrying
              ? "color-mix(in srgb, var(--tb-muted) 14%, transparent)"
              : "color-mix(in srgb, var(--tb-accent) 14%, transparent)",
          }}
        >
          <Loader2
            size={22}
            strokeWidth={2}
            className={retrying ? "animate-spin text-[var(--tb-muted)]" : "animate-spin text-[var(--tb-accent)]"}
          />
        </div>
      </div>

      <p className="text-[16px] font-semibold text-center mb-1 text-[var(--tb-text)]">
        {retrying ? "网络不稳，正在自动重试" : "正在下载语音引擎"}
      </p>
      <p className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-5">
        首次下载会慢一点，下次打开直接从浏览器缓存读取。
      </p>

      <div
        className="h-2 rounded-full overflow-hidden mb-2"
        style={{
          background: "var(--tb-bg)",
          border: "1px solid var(--tb-border)",
        }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: retrying ? "var(--tb-muted)" : "var(--tb-accent)",
            opacity: retrying ? 0.5 : 1,
          }}
        />
      </div>
      <p
        className="text-[12px] text-[var(--tb-text)] font-mono truncate mb-0.5"
        title={progressText}
      >
        {progressText}
      </p>
      {progressSubText && (
        <p
          className="text-[10.5px] text-[var(--tb-muted)] font-mono truncate mb-3"
          title={progressSubText}
        >
          {progressSubText}
        </p>
      )}
      <div className="mt-5" />

      <button
        type="button"
        onClick={onCancel}
        className="w-full h-10 rounded-lg text-[13px]"
        style={{
          background: "var(--tb-surface)",
          border: "1px solid var(--tb-border)",
          color: "var(--tb-muted)",
        }}
      >
        取消下载
      </button>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
  onCancel,
}: {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-center mb-4 mt-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--tb-danger) 14%, transparent)" }}
        >
          <AlertCircle size={24} strokeWidth={2} className="text-[var(--tb-danger)]" />
        </div>
      </div>

      <p className="text-[16px] font-semibold text-center mb-1 text-[var(--tb-text)]">
        下载失败
      </p>
      <p className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-5">
        {message}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-lg font-medium text-[14px]"
          style={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
            color: "var(--tb-text)",
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 h-11 rounded-lg font-medium text-[14px] text-white"
          style={{ background: "var(--tb-accent)" }}
        >
          重试
        </button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
