import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  PackageOpen,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import logoUrl from "../../assets/icons/typebridge.png";
import { useI18n, t as ti18n } from "../../i18n";
import { localizeRuntime } from "../../i18n/runtime";
import LanguageSwitcher from "../LanguageSwitcher";
import ThemeSwitcher from "../ThemeSwitcher";

// 与 src-tauri/src/about.rs 的 UpdateCheckResult 对齐
interface UpdateCheckResult {
  is_dev: boolean;
  current: string;
  latest: string | null;
  has_update: boolean;
  download_url: string | null;
  notes: string | null;
}

type CheckStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date"; current: string; isDev: boolean }
  | { kind: "has-update"; current: string; latest: string; downloadUrl: string }
  | { kind: "error"; message: string };

type DownloadState =
  | { phase: "idle" }
  | { phase: "downloading"; version: string; downloaded: number; total: number | null; percent: number | null }
  | { phase: "opening"; version: string }
  | { phase: "failed"; version: string; reason: string }
  | { phase: "cancelled"; version: string };

interface UpdateDownloadStateEvent {
  phase: "starting" | "downloading" | "opening" | "failed" | "cancelled";
  version: string;
  downloaded?: number;
  total?: number | null;
  percent?: number | null;
  reason?: string;
}

import { useAppStore } from "../../store";

export default function AboutTab() {
  const [version, setVersion] = useState<string>("…");
  const [status, setStatus] = useState<CheckStatus>({ kind: "idle" });
  const [downloadState, setDownloadState] = useState<DownloadState>({ phase: "idle" });
  const [downloadStalled, setDownloadStalled] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useI18n();
  const { latestVersionInfo, setLatestVersionInfo } = useAppStore();
  // 用 ref 捕获挂载时刻的值，避免 useEffect 依赖数组问题
  const initialVersionInfoRef = useRef(latestVersionInfo);

  useEffect(() => {
    invoke<string>("get_app_version")
      .then(setVersion)
      .catch(() => setVersion(t("about.versionUnknown")));
  }, []);

  // 挂载时：若后台已检测到新版本且本地尚未展示，自动预填 has-update 状态
  useEffect(() => {
    const info = initialVersionInfoRef.current;
    if (!info) return;
    invoke<string>("get_app_version").then((ver) => {
      setStatus({
        kind: "has-update",
        current: ver,
        latest: info.latest,
        downloadUrl: info.downloadUrl,
      });
    }).catch(() => {
      setStatus({
        kind: "has-update",
        current: "unknown",
        latest: info.latest,
        downloadUrl: info.downloadUrl,
      });
    });
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<UpdateDownloadStateEvent>("typebridge://update-download-state", (event) => {
      const payload = event.payload;
      switch (payload.phase) {
        case "starting":
          setDownloadState({
            phase: "downloading",
            version: payload.version,
            downloaded: 0,
            total: null,
            percent: null,
          });
          return;
        case "downloading":
          setDownloadState({
            phase: "downloading",
            version: payload.version,
            downloaded: payload.downloaded ?? 0,
            total: payload.total ?? null,
            percent: payload.percent ?? null,
          });
          return;
        case "opening":
          setDownloadState({ phase: "opening", version: payload.version });
          return;
        case "failed":
          setDownloadState({
            phase: "failed",
            version: payload.version,
            reason: payload.reason ?? "unknown",
          });
          return;
        case "cancelled":
          setDownloadState({ phase: "cancelled", version: payload.version });
          return;
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (downloadState.phase !== "downloading") {
      setDownloadStalled(false);
      if (stalledTimerRef.current) {
        clearTimeout(stalledTimerRef.current);
        stalledTimerRef.current = null;
      }
      return;
    }

    if (downloadState.downloaded > 0) {
      setDownloadStalled(false);
      if (stalledTimerRef.current) {
        clearTimeout(stalledTimerRef.current);
        stalledTimerRef.current = null;
      }
      return;
    }

    if (!stalledTimerRef.current) {
      stalledTimerRef.current = setTimeout(() => {
        setDownloadStalled(true);
      }, 60000);
    }

    return () => {
      if (stalledTimerRef.current) {
        clearTimeout(stalledTimerRef.current);
        stalledTimerRef.current = null;
      }
    };
  }, [downloadState]);

  async function handleDismissError() {
    setDownloadStalled(false);
    if (stalledTimerRef.current) {
      clearTimeout(stalledTimerRef.current);
      stalledTimerRef.current = null;
    }
    try {
      await invoke("cancel_update_download");
    } catch (_) {
      // 任务可能已结束，忽略错误
    }
    setDownloadState({ phase: "idle" });
    setBannerDismissed(true);
  }

  async function handleCheck() {
    setStatus({ kind: "checking" });
    setBannerDismissed(false);
    try {
      const result = await invoke<UpdateCheckResult>("check_update");
      if (!result.has_update || !result.download_url || !result.latest) {
        setStatus({
          kind: "up-to-date",
          current: result.current,
          isDev: result.is_dev,
        });
        // 当前已是最新，清除后台缓存的"有更新"状态
        setLatestVersionInfo(null);
      } else {
        setStatus({
          kind: "has-update",
          current: result.current,
          latest: result.latest,
          downloadUrl: result.download_url,
        });
        // 同步更新 store，保持一致
        setLatestVersionInfo({ latest: result.latest, downloadUrl: result.download_url });
      }
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }

  async function handleStartDownload() {
    if (status.kind !== "has-update") return;
    setBannerDismissed(false);
    setDownloadStalled(false);
    setDownloadState({
      phase: "downloading",
      version: status.latest,
      downloaded: 0,
      total: null,
      percent: null,
    });

    try {
      await invoke("start_update_download", {
        downloadUrl: status.downloadUrl,
        version: status.latest,
      });
    } catch (e) {
      setDownloadState({
        phase: "failed",
        version: status.latest,
        reason: String(e),
      });
    }
  }

  async function handleCancelDownload() {
    if (downloadState.phase !== "downloading") return;
    try {
      await invoke("cancel_update_download");
    } catch (e) {
      setDownloadState({
        phase: "failed",
        version: downloadState.version,
        reason: String(e),
      });
    }
  }

  return (
    <div className="relative h-full flex flex-col">
      {!bannerDismissed && (
        <UpdateStatusBanner
          status={status}
          downloadState={downloadState}
          downloadStalled={downloadStalled}
          onStart={handleStartDownload}
          onCancel={handleCancelDownload}
          onDismiss={handleDismissError}
        />
      )}
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-8 py-8">
        <div className="w-full max-w-md flex flex-col items-center text-center gap-5">
          <img
            src={logoUrl}
            alt="TypeBridge"
            width={88}
            height={88}
            className="rounded-2xl"
            style={{
              boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            }}
          />

          <div>
            <h1 className="text-[18px] font-semibold text-text">TypeBridge</h1>
            <p className="text-[12px] text-muted mt-1 font-mono">{version}</p>
          </div>

          <button
            onClick={handleCheck}
            disabled={status.kind === "checking" || downloadState.phase === "opening"}
            className="flex items-center justify-center gap-1.5 text-[12px] rounded-md px-3.5 py-1.5 transition-colors disabled:cursor-not-allowed"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
            }}
          >
            {status.kind === "checking" ? (
              <>
                <RefreshCw size={12} strokeWidth={1.75} className="animate-spin" />
                {t("about.checking")}
              </>
            ) : (
              <>
                <RefreshCw size={12} strokeWidth={1.75} />
                {t("about.check")}
              </>
            )}
          </button>

          <CheckResultLine status={status} />
        </div>
      </div>

      {/* 语言切换 + 主题切换 — 页面右下角并排 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5">
        <div>
          <LanguageSwitcher />
        </div>
        <div>
          <ThemeSwitcher />
        </div>
      </div>

    </div>
  );
}

function CheckResultLine({ status }: { status: CheckStatus }) {
  if (status.kind === "idle" || status.kind === "checking") return null;

  if (status.kind === "up-to-date") {
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        <CheckCircle2 size={14} strokeWidth={1.75} className="text-success" />
        {ti18n("about.upToDate")}
      </div>
    );
  }

  if (status.kind === "has-update") {
    return (
      <p className="text-[13px] text-text">
        {ti18n("about.foundNewPrefix")}<span className="font-mono font-semibold">v{status.latest}</span>
      </p>
    );
  }

  return (
    <div className="text-[12px] text-error max-w-xs break-words">{localizeRuntime(status.message)}</div>
  );
}

function UpdateStatusBanner({
  status,
  downloadState,
  downloadStalled,
  onStart,
  onCancel,
  onDismiss,
}: {
  status: CheckStatus;
  downloadState: DownloadState;
  downloadStalled: boolean;
  onStart: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  if (downloadState.phase === "failed" || (downloadState.phase === "downloading" && downloadStalled)) {
    const reason = downloadState.phase === "failed" ? downloadState.reason : undefined;
    return <ManualDownloadHintBanner reason={reason} onDismiss={onDismiss} />;
  }

  if (downloadState.phase === "downloading") {
    return (
      <div
        className="flex flex-col gap-3 px-6 py-2.5 text-[12px]"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 leading-relaxed">
            <Download size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
            <div className="text-text">
              <span className="font-medium">{ti18n("about.downloading")}</span>
              <span className="font-mono"> v{downloadState.version}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[11.5px] underline text-muted hover:text-text"
          >
            {ti18n("about.cancelDownload")}
          </button>
        </div>

        <DownloadProgressBar
          downloaded={downloadState.downloaded}
          total={downloadState.total}
          percent={downloadState.percent}
        />
      </div>
    );
  }

  if (downloadState.phase === "opening") {
    return (
      <div
        className="flex items-start gap-2 px-6 py-2.5 text-[12px] leading-relaxed"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <PackageOpen size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
        <div className="flex-1 text-text">
          {ti18n("about.downloadOpening")}
          <span className="font-mono"> v{downloadState.version}</span>
        </div>
      </div>
    );
  }

  if (downloadState.phase === "cancelled") {
    return (
      <div
        className="flex items-start justify-between gap-3 px-6 py-2.5 text-[12px] leading-relaxed"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-start gap-2 text-text">
          <XCircle size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-muted" />
          {ti18n("about.downloadCancelled")}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onStart}
            className="text-[11.5px] underline text-accent hover:opacity-80"
          >
            {ti18n("about.retryDownload")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted hover:text-text transition-colors"
            title="关闭"
          >
            <X size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
  }

  if (status.kind !== "has-update") return null;

  return (
    <div
      className="flex items-start justify-between gap-3 px-6 py-2.5 text-[12px] leading-relaxed"
      style={{
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-start gap-2 text-text">
        <Download size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
        <div>
          {ti18n("about.foundNewPrefix")}
          <span className="font-mono font-medium">v{status.latest}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="text-[11.5px] underline text-accent hover:opacity-80 shrink-0"
      >
        {ti18n("about.installNow")}
      </button>
    </div>
  );
}

function ManualDownloadHintBanner({
  reason,
  onDismiss,
}: {
  reason?: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-6 py-2.5 text-[12px]"
      style={{
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0 text-text">
        <AlertCircle size={13} strokeWidth={1.75} className="shrink-0 text-error" />
        <span
          className="truncate whitespace-nowrap"
          title={reason}
        >
          {ti18n("about.manualDownloadHint")}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={async () => {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            await openUrl("https://typebridge.parksben.xyz/#download");
          }}
          className="text-[11.5px] underline text-accent hover:opacity-80 whitespace-nowrap"
        >
          {ti18n("about.openWebsiteDownload")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted hover:text-text transition-colors"
          title="关闭"
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function DownloadProgressBar({
  downloaded,
  total,
  percent,
}: {
  downloaded: number;
  total: number | null;
  percent: number | null;
}) {
  const pct = percent !== null ? Math.min(100, Math.round(percent)) : null;

  return (
    <div className="flex flex-col gap-2">
      {/* 进度条轨道 */}
      <div
        className="w-full h-[6px] rounded-full overflow-hidden"
        style={{ background: "var(--border-strong)" }}
      >
        {pct !== null ? (
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff 30%))",
            }}
          />
        ) : (
          /* 不确定态：滑动光条 */
          <div
            className="h-full rounded-full"
            style={{
              width: "35%",
              background: "var(--accent)",
              animation: "progress-slide 1.4s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {/* 百分比 + 文件大小 */}
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span style={{ color: "var(--muted)" }}>
          {formatBytes(downloaded)}
          {total !== null ? ` / ${formatBytes(total)}` : ""}
        </span>
        <span style={{ color: "var(--text)" }}>
          {pct !== null ? `${pct}%` : "—"}
        </span>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
