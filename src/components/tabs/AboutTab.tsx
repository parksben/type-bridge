import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, PackageOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import logoUrl from "../../assets/icons/typebridge.png";
import { useI18n, t as ti18n } from "../../i18n";
import { localizeRuntime } from "../../i18n/runtime";
import LanguageSwitcher from "../LanguageSwitcher";

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
  | { phase: "downloading"; downloaded: number; total: number | null; percent: number | null }
  | { phase: "opening" };

interface DownloadProgressEvent {
  downloaded: number;
  total: number | null;
  percent: number | null;
}

export default function AboutTab() {
  const [version, setVersion] = useState<string>("…");
  const [status, setStatus] = useState<CheckStatus>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>({ phase: "idle" });
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    invoke<string>("get_app_version")
      .then(setVersion)
      .catch(() => setVersion(t("about.versionUnknown")));

    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function handleCheck() {
    setStatus({ kind: "checking" });
    try {
      const result = await invoke<UpdateCheckResult>("check_update");
      if (!result.has_update || !result.download_url || !result.latest) {
        setStatus({
          kind: "up-to-date",
          current: result.current,
          isDev: result.is_dev,
        });
      } else {
        setStatus({
          kind: "has-update",
          current: result.current,
          latest: result.latest,
          downloadUrl: result.download_url,
        });
      }
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }

  function openConfirm() {
    setConfirmOpen(true);
  }

  async function handleConfirmInstall() {
    if (status.kind !== "has-update") return;

    // 订阅进度事件
    const unlisten = await listen<DownloadProgressEvent>(
      "typebridge://download-progress",
      (event) => {
        const { downloaded, total, percent } = event.payload;
        if (percent !== null && percent >= 100) {
          setDownloadState({ phase: "opening" });
        } else {
          setDownloadState({ phase: "downloading", downloaded, total, percent });
        }
      },
    );
    unlistenRef.current = unlisten;

    setDownloadState({ phase: "downloading", downloaded: 0, total: null, percent: null });

    try {
      await invoke("apply_update", { downloadUrl: status.downloadUrl });
      // apply_update 末尾 app.exit(0)，正常不会执行到此
    } catch (e) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setDownloadState({ phase: "idle" });
      setConfirmOpen(false);
      setStatus({ kind: "error", message: String(e) });
    }
  }

  return (
    <div className="relative h-full overflow-y-auto flex items-center justify-center px-8 py-8">
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
          disabled={status.kind === "checking" || downloadState.phase !== "idle"}
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

        <CheckResultLine status={status} onShowConfirm={openConfirm} />
      </div>

      {/* 语言切换 — 页面右下角 */}
      <div className="absolute bottom-4 right-4 w-30">
        <LanguageSwitcher />
      </div>

      {confirmOpen && status.kind === "has-update" && (
        <ConfirmInstallDialog
          current={status.current}
          latest={status.latest}
          downloadState={downloadState}
          onCancel={() => {
            if (downloadState.phase !== "idle") return;
            setConfirmOpen(false);
          }}
          onConfirm={handleConfirmInstall}
        />
      )}
    </div>
  );
}

function CheckResultLine({
  status,
  onShowConfirm,
}: {
  status: CheckStatus;
  onShowConfirm: () => void;
}) {
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
      <div className="flex flex-col items-center gap-2">
        <p className="text-[13px] text-text">
          {ti18n("about.foundNewPrefix")}<span className="font-mono font-semibold">v{status.latest}</span>
        </p>
        <button
          onClick={onShowConfirm}
          className="text-[12px] underline text-accent hover:opacity-80"
        >
          {ti18n("about.installNow")}
        </button>
      </div>
    );
  }

  return (
    <div className="text-[12px] text-error max-w-xs break-words">{localizeRuntime(status.message)}</div>
  );
}

function ConfirmInstallDialog({
  current,
  latest,
  downloadState,
  onCancel,
  onConfirm,
}: {
  current: string;
  latest: string;
  downloadState: DownloadState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDownloading = downloadState.phase === "downloading";
  const isOpening = downloadState.phase === "opening";
  const isBusy = isDownloading || isOpening;

  const [showSlowHint, setShowSlowHint] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 下载开始时启动 5 秒计时器
  useEffect(() => {
    if (!isDownloading) {
      setShowSlowHint(false);
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      return;
    }
    slowTimerRef.current = setTimeout(() => setShowSlowHint(true), 5000);
    return () => {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
    };
  }, [isDownloading]);

  // 有字节传输后取消计时器
  useEffect(() => {
    if (
      downloadState.phase === "downloading" &&
      downloadState.downloaded > 0 &&
      slowTimerRef.current
    ) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, [downloadState]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel();
      }}
    >
      <div
        className="w-[420px] rounded-lg p-5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
        }}
      >
        {/* ── 正在打开安装包 ── */}
        {isOpening ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <PackageOpen size={28} strokeWidth={1.5} className="text-accent" />
            <p className="text-[13px] text-muted">{ti18n("about.downloadOpening")}</p>
          </div>
        ) : isDownloading ? (
          /* ── 下载进度 ── */
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-text mb-0.5">
                  {ti18n("about.downloading")}
                </h2>
                <p className="text-[12px] text-subtle font-mono">
                  TypeBridge v{latest}
                </p>
              </div>
              {showSlowHint && (
                <p className="text-[11px] text-muted text-right shrink-0 leading-relaxed pt-0.5">
                  {ti18n("about.downloadSlowHintPre")}
                  <button
                    type="button"
                    onClick={async () => {
                      const { openUrl } = await import("@tauri-apps/plugin-opener");
                      await openUrl("https://typebridge.parksben.xyz/#download");
                    }}
                    className="text-accent underline hover:opacity-80 cursor-pointer"
                  >
                    {ti18n("about.downloadSlowHintLink")}
                  </button>
                  {ti18n("about.downloadSlowHintPost")}
                </p>
              )}
            </div>

            <DownloadProgressBar
              downloaded={downloadState.downloaded}
              total={downloadState.total}
              percent={downloadState.percent}
            />
          </div>
        ) : (
          /* ── 确认对话框 ── */
          <>
            <h2 className="text-[15px] font-semibold text-text mb-2">{ti18n("about.confirmTitle")}</h2>
            <p className="text-[13px] text-muted leading-relaxed mb-4">
              {ti18n("about.confirmDetectedPrefix")}<span className="font-mono text-text">v{latest}</span>{ti18n("about.confirmCurrentPrefix")}
              <span className="font-mono text-text">v{current}</span>{ti18n("about.confirmCurrentSuffix")}
              <br />
              {ti18n("about.confirmStepsHead")}
              <br />
              1. {ti18n("about.confirmStep1")}<span className="text-text font-medium">{ti18n("about.confirmStep1Bold")}</span>
              <br />
              2. {ti18n("about.confirmStep2")}
              <br />
              3. {ti18n("about.confirmStep3")}
              <br />
              {ti18n("about.confirmFooter")}
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-1.5 text-[13px] rounded-md border text-center"
                style={{
                  borderColor: "var(--border-strong)",
                  color: "var(--text)",
                  background: "var(--surface-2)",
                }}
              >
                {ti18n("about.cancel")}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 tb-btn-primary px-4 py-1.5 flex items-center justify-center gap-1.5"
              >
                {ti18n("about.confirm")}
              </button>
            </div>
          </>
        )}
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
