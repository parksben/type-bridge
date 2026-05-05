import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import logoUrl from "../../assets/icons/typebridge.png";

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

export default function AboutTab() {
  const [version, setVersion] = useState<string>("…");
  const [status, setStatus] = useState<CheckStatus>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    invoke<string>("get_app_version")
      .then(setVersion)
      .catch(() => setVersion("未知"));
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
    setInstalling(true);
    try {
      await invoke("apply_update", { downloadUrl: status.downloadUrl });
      // app 会在 apply_update 末尾 exit(0)，这里不太可能跑到
    } catch (e) {
      setInstalling(false);
      setConfirmOpen(false);
      setStatus({ kind: "error", message: String(e) });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-12">
      <div className="max-w-md mx-auto flex flex-col items-center text-center gap-5">
        <img
          src={logoUrl}
          alt="TypeBridge"
          width={96}
          height={96}
          className="rounded-2xl"
          style={{
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
          }}
        />

        <div>
          <h1 className="text-[20px] font-semibold text-text">TypeBridge</h1>
          <p className="text-[13px] text-muted mt-1 font-mono">{version}</p>
        </div>

        <button
          onClick={handleCheck}
          disabled={status.kind === "checking" || installing}
          className="tb-btn-primary flex items-center justify-center gap-1.5 min-w-[140px]"
        >
          {status.kind === "checking" ? (
            <>
              <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
              检查中…
            </>
          ) : (
            <>
              <RefreshCw size={14} strokeWidth={1.75} />
              检查更新
            </>
          )}
        </button>

        <CheckResultLine status={status} onShowConfirm={openConfirm} />
      </div>

      {confirmOpen && status.kind === "has-update" && (
        <ConfirmInstallDialog
          current={status.current}
          latest={status.latest}
          installing={installing}
          onCancel={() => !installing && setConfirmOpen(false)}
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
        当前版本已是最新版
      </div>
    );
  }

  if (status.kind === "has-update") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-[13px] text-text">
          发现新版本 <span className="font-mono font-semibold">v{status.latest}</span>
        </p>
        <button
          onClick={onShowConfirm}
          className="text-[12px] underline text-accent hover:opacity-80"
        >
          立即下载安装
        </button>
      </div>
    );
  }

  return (
    <div className="text-[12px] text-error max-w-xs break-words">{status.message}</div>
  );
}

function ConfirmInstallDialog({
  current,
  latest,
  installing,
  onCancel,
  onConfirm,
}: {
  current: string;
  latest: string;
  installing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !installing) onCancel();
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
        <h2 className="text-[15px] font-semibold text-text mb-2">确认安装新版本？</h2>
        <p className="text-[13px] text-muted leading-relaxed mb-4">
          检测到新版 <span className="font-mono text-text">v{latest}</span>（当前
          <span className="font-mono text-text"> v{current}</span>）。
          <br />
          点击「确认」后：
          <br />
          1. 应用将<span className="text-text font-medium">退出</span>
          <br />
          2. 自动下载新版 .dmg 到「下载」文件夹
          <br />
          3. 在 Finder 中打开 .dmg
          <br />
          请按 macOS 标准方式将新版拖入「应用程序」文件夹覆盖旧版，再手动重新启动 TypeBridge。
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={installing}
            className="px-4 py-1.5 text-[13px] rounded-md border disabled:cursor-not-allowed"
            style={{
              borderColor: "var(--border-strong)",
              color: "var(--text)",
              background: "var(--surface-2)",
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={installing}
            className="tb-btn-primary px-4 py-1.5 flex items-center gap-1.5"
          >
            {installing ? (
              <>
                <RefreshCw size={13} strokeWidth={1.75} className="animate-spin" />
                下载中…
              </>
            ) : (
              "确认更新"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
