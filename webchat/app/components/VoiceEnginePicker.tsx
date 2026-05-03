"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Cpu,
  Download,
  Keyboard,
  Loader2,
  Mic,
  Shield,
  X,
} from "lucide-react";
import {
  installEngine,
  markEngineInstalled,
  type InstallProgress,
} from "@/app/lib/wasm-speech";

type Props = {
  /** Web Speech 识别失败的具体文案（来自 VoiceButton 的 error handler） */
  reason?: string;
  /** 用户选了"使用输入法麦克风"；上层应展示一次性引导 */
  onUseIme: () => void;
  /** WASM 引擎已安装完成，可以开始录音 */
  onInstalled: () => void;
  /** 关闭面板（未选 / 取消） */
  onClose: () => void;
};

type Stage = "picker" | "confirm" | "installing" | "error";

/** 一个底部弹出面板，三阶段串联：选项 → 下载确认 → 进度。 */
export default function VoiceEnginePicker({ reason, onUseIme, onInstalled, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("picker");
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

  // —— 进度文案拼装 ——
  let progressText = "准备中…";
  let percent = 0;
  if (progress) {
    if (progress.kind === "progress") {
      percent = Math.max(0, Math.min(100, progress.percent));
      progressText = `${progress.file || "模型文件"} · ${percent.toFixed(0)}%`;
    } else if (progress.kind === "download") {
      progressText = `开始下载 ${progress.file || "模型文件"}…`;
    } else if (progress.kind === "done") {
      progressText = `${progress.file || "文件"} 完成，继续…`;
    } else if (progress.kind === "initiate") {
      progressText = `初始化 ${progress.file || "运行时"}…`;
    } else if (progress.kind === "ready") {
      progressText = "加载完成，准备开始…";
      percent = 100;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--tb-bg) 70%, transparent)", backdropFilter: "blur(4px)" }}
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
        {/* Close handle */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--tb-border)" }} />
        </div>

        {stage === "picker" && (
          <PickerView
            reason={reason}
            onPickIme={() => {
              onUseIme();
            }}
            onPickWasm={() => setStage("confirm")}
            onClose={onClose}
          />
        )}
        {stage === "confirm" && (
          <ConfirmView onCancel={() => setStage("picker")} onConfirm={startInstall} />
        )}
        {stage === "installing" && (
          <InstallingView
            progressText={progressText}
            percent={percent}
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

function PickerView({
  reason,
  onPickIme,
  onPickWasm,
  onClose,
}: {
  reason?: string;
  onPickIme: () => void;
  onPickWasm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-start gap-2 mb-4">
        <AlertCircle
          size={16}
          strokeWidth={2}
          className="shrink-0 mt-0.5"
          style={{ color: "var(--tb-accent)" }}
        />
        <div className="flex-1">
          <p className="text-[15px] font-semibold mb-1 text-[var(--tb-text)]">
            浏览器语音识别不可用
          </p>
          <p className="text-[13px] text-[var(--tb-muted)] leading-relaxed">
            {reason || "你的系统可能缺少中文语音引擎。选一种替代方案："}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="shrink-0 -m-1 p-1 text-[var(--tb-muted)]"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <button
        type="button"
        onClick={onPickIme}
        className="w-full text-left rounded-xl p-4 mb-2.5 flex items-start gap-3 transition-colors active:opacity-80"
        style={{
          background: "var(--tb-surface)",
          border: "1px solid var(--tb-border)",
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "var(--tb-bg)" }}
        >
          <Keyboard size={20} strokeWidth={1.8} className="text-[var(--tb-muted)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[var(--tb-text)]">
            使用输入法麦克风
          </p>
          <p className="text-[12px] text-[var(--tb-muted)] leading-relaxed mt-0.5">
            搜狗 / 百度 / 讯飞 / 系统键盘都自带麦克风按钮，点键盘上的麦克风即可。
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onPickWasm}
        className="w-full text-left rounded-xl p-4 flex items-start gap-3 transition-colors active:opacity-80"
        style={{
          background: "color-mix(in srgb, var(--tb-accent) 8%, var(--tb-surface))",
          border: "1px solid color-mix(in srgb, var(--tb-accent) 25%, var(--tb-border))",
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "color-mix(in srgb, var(--tb-accent) 16%, transparent)" }}
        >
          <Cpu size={20} strokeWidth={1.8} className="text-[var(--tb-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[14px] font-medium text-[var(--tb-text)]">
              安装 TypeBridge 本地引擎
            </p>
            <span
              className="text-[10px] font-medium px-1.5 py-[1px] rounded"
              style={{
                background: "color-mix(in srgb, var(--tb-accent) 18%, transparent)",
                color: "var(--tb-accent)",
              }}
            >
              推荐
            </span>
          </div>
          <p className="text-[12px] text-[var(--tb-muted)] leading-relaxed mt-0.5">
            一次下载 ~40MB 到浏览器，离线识别，<span className="text-[var(--tb-text)]">下次打开直接用</span>。
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1.5 mt-4 text-[11px] text-[var(--tb-muted)]">
        <Shield size={11} strokeWidth={2} />
        <span>两种方式都不会把音频上传到任何服务器</span>
      </div>
    </div>
  );
}

function ConfirmView({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-center mb-4 mt-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)" }}
        >
          <Download size={24} strokeWidth={2} className="text-[var(--tb-accent)]" />
        </div>
      </div>

      <p className="text-[16px] font-semibold text-center mb-1 text-[var(--tb-text)]">
        下载 TypeBridge 本地语音引擎
      </p>
      <p className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-5">
        首次下载大约
        <span className="font-semibold text-[var(--tb-text)] mx-1">40 MB</span>
        模型文件。
        <br />
        下载完后保存在浏览器里，下次打开直接用，不再下载。
      </p>

      <div
        className="rounded-lg p-3 mb-5 text-[12px] leading-relaxed"
        style={{
          background: "var(--tb-bg)",
          border: "1px solid var(--tb-border)",
          color: "var(--tb-muted)",
        }}
      >
        <div className="flex items-start gap-2">
          <Mic size={12} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: "var(--tb-accent)" }} />
          <span>基于 Whisper tiny 模型，支持中文。识别在手机本地完成，音频不离开你的手机。</span>
        </div>
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
  percent,
  onCancel,
}: {
  progressText: string;
  percent: number;
  onCancel: () => void;
}) {
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-center mb-4 mt-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)" }}
        >
          <Loader2
            size={22}
            strokeWidth={2}
            className="animate-spin text-[var(--tb-accent)]"
          />
        </div>
      </div>

      <p className="text-[16px] font-semibold text-center mb-1 text-[var(--tb-text)]">
        正在下载 WebAssembly 引擎
      </p>
      <p className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-5">
        首次下载会慢一点，下次打开直接从浏览器缓存读取。
      </p>

      {/* 进度条 */}
      <div
        className="h-2 rounded-full overflow-hidden mb-2"
        style={{ background: "var(--tb-bg)", border: "1px solid var(--tb-border)" }}
      >
        <div
          className="h-full transition-all duration-200"
          style={{
            width: `${percent}%`,
            background: "var(--tb-accent)",
          }}
        />
      </div>
      <p className="text-[11px] text-[var(--tb-muted)] font-mono truncate mb-5" title={progressText}>
        {progressText}
      </p>

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
