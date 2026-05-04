"use client";

import { AlertCircle, ChevronDown, Cpu, Download, Loader2, Mic, Shield, X } from "lucide-react";
import type { DownloadState } from "./VoiceButton";

// 用户首次点击麦克风按钮时弹出。现在是纯展示组件 —— 下载状态和安装任务
// 由 VoiceButton 管理，这个组件根据传入的 download state 渲染不同 stage。

type Props = {
  download: DownloadState;
  onConfirmInstall: () => void;
  /** 收起到后台，保留下载任务 */
  onMinimize: () => void;
  /** 关闭对话框（未开始下载 / 出错时用） */
  onClose: () => void;
  /** 出错态点重试时 */
  onRetry: () => void;
};

export default function VoiceEnginePicker({
  download,
  onConfirmInstall,
  onMinimize,
  onClose,
  onRetry,
}: Props) {
  const { stage } = download;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: "color-mix(in srgb, var(--tb-bg) 70%, transparent)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        // 点空白处：下载中则收起到后台；其他情况关闭
        if (stage === "installing") onMinimize();
        else onClose();
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
          <span
            className="w-10 h-1 rounded-full mx-auto"
            style={{ background: "var(--tb-border)" }}
          />
        </div>

        {stage === "intro" && (
          <IntroView onCancel={onClose} onConfirm={onConfirmInstall} />
        )}

        {stage === "installing" && (
          <InstallingView download={download} onMinimize={onMinimize} />
        )}

        {stage === "error" && (
          <ErrorView
            message={download.errorMsg || "下载失败"}
            onRetry={onRetry}
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
            语音功能需要先在手机浏览器里下载一个 <strong className="text-[var(--tb-text)]">~35MB</strong> 的本地语音引擎。
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
            <span>音频不会离开你的手机，不上传到任何服务器。</span>
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
  download,
  onMinimize,
}: {
  download: DownloadState;
  onMinimize: () => void;
}) {
  const { percent, loaded, total, retryInfo } = download;
  const isRetrying = retryInfo !== null;
  const pctRound = Math.floor(percent);

  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-center mb-4 mt-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: isRetrying
              ? "color-mix(in srgb, var(--tb-muted) 14%, transparent)"
              : "color-mix(in srgb, var(--tb-accent) 14%, transparent)",
          }}
        >
          <Loader2
            size={22}
            strokeWidth={2}
            className={
              isRetrying
                ? "animate-spin text-[var(--tb-muted)]"
                : "animate-spin text-[var(--tb-accent)]"
            }
          />
        </div>
      </div>

      <p className="text-[16px] font-semibold text-center mb-1 text-[var(--tb-text)]">
        {isRetrying ? "网络不稳，正在自动重试" : "正在下载语音引擎"}
      </p>
      <p className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-5">
        {isRetrying
          ? `${retryInfo.delaySecs}s 后重试（第 ${retryInfo.attempt}/${retryInfo.maxAttempts} 次）· 已下完的会跳过`
          : "可以收起到后台，下载完成会自动启用"}
      </p>

      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex-1 h-2.5 rounded-full overflow-hidden"
          style={{
            background: "var(--tb-bg)",
            border: "1px solid var(--tb-border)",
          }}
        >
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${percent}%`,
              background: isRetrying ? "var(--tb-muted)" : "var(--tb-accent)",
              opacity: isRetrying ? 0.5 : 1,
            }}
          />
        </div>
        <span
          className="text-[13px] font-mono font-medium tabular-nums shrink-0"
          style={{
            color: isRetrying ? "var(--tb-muted)" : "var(--tb-text)",
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {pctRound}%
        </span>
      </div>

      <p className="text-[12px] text-[var(--tb-muted)] font-mono mb-5 text-center">
        {formatBytes(loaded)} / {formatBytes(total)}
      </p>

      {/* 主按钮：后台下载（显眼，鼓励用户继续聊天） */}
      <button
        type="button"
        onClick={onMinimize}
        className="w-full h-11 rounded-lg font-medium text-[14px] flex items-center justify-center gap-1.5 mb-2"
        style={{
          background: "color-mix(in srgb, var(--tb-accent) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--tb-accent) 25%, transparent)",
          color: "var(--tb-accent)",
        }}
      >
        <ChevronDown size={14} strokeWidth={2.2} />
        后台下载（你可以先发文字 / 图片）
      </button>
      <p className="text-[11px] text-[var(--tb-muted)] text-center">
        下载中麦克风按钮会显示环形进度，完成后自动启用
      </p>
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
      <p
        className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-5 break-all"
        title={message}
      >
        {message.length > 120 ? message.slice(0, 120) + "…" : message}
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
