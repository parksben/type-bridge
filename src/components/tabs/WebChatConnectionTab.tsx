import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCw,
  ScanLine,
  Smartphone,
  WifiOff,
  Unlink,
} from "lucide-react";
import { useAppStore } from "../../store";
import { useI18n, t as ti18n } from "../../i18n";
import { localizeRuntime } from "../../i18n/runtime";

// ───────── Snapshot 协议（与 src-tauri/src/webchat.rs 对齐）─────────
// v3 协议：去 OTP，sessionId 持久化，单设备 bound_client 占座
// - phase: idle | pending | bound | error（删 expired）
// - 删 otp / expires_at；加 bound_client { clientId, ua, boundAt }
// - bound_devices = 实时 socket 计数（在线徽标用）
//   bound_client    = 持久占座设备（卡片主视觉用）

type Phase = "idle" | "pending" | "bound" | "error";

interface BoundClient {
  clientId: string;
  ua: string;
  boundAt: number;
}

interface WebChatSnapshot {
  phase: { kind: Phase };
  session_id: string | null;
  lan_ip: string | null;
  port: number | null;
  wifi_name: string | null;
  bound_devices: number;
  bound_client: BoundClient | null;
  error: string | null;
  qr_url: string | null;
}

export default function WebChatConnectionTab() {
  const [snap, setSnap] = useState<WebChatSnapshot | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const resettingRef = useRef(false);
  const retryingRef = useRef(false);
  const addLog = useAppStore((s) => s.addLog);
  const { t } = useI18n();

  // 订阅 session 更新 + 初始 snapshot
  //
  // 修复"server 重启后状态卡不刷新"的 bug：
  // 旧实现是「先 invoke 拉 snapshot，再注册 listener」，
  // 在 server 启动很快、事件先于 invoke 返回的窗口期里，
  // 第一波事件会被吞掉，UI 卡在旧状态。
  // v3 改成「先注册 listener，再 invoke 拉 snapshot 兜底」。
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    listen<WebChatSnapshot>("typebridge://webchat-session-update", (e) => {
      if (cancelled) return;
      setSnap(e.payload);
    }).then((f) => {
      if (cancelled) {
        f();
        return;
      }
      unsub = f;
      // listener 挂好后再拉一次 snapshot 兜底，避免错过早到的事件
      invoke<WebChatSnapshot>("webchat_snapshot")
        .then((s) => {
          if (!cancelled) setSnap(s);
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  // 渲染 QR
  useEffect(() => {
    if (!snap?.qr_url) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(snap.qr_url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 232,
      color: { dark: "#18181b", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [snap?.qr_url]);

  const phase: Phase = snap?.phase.kind ?? "idle";

  // 重置绑定（v3 替代旧的 rotate OTP）
  async function resetBinding() {
    if (resettingRef.current) return;
    resettingRef.current = true;
    try {
      const next = await invoke<WebChatSnapshot>("reset_webchat_binding");
      // 兜底同步本地状态，避免事件竞态
      setSnap(next);
      addLog({ kind: "connect", channel: "webchat", text: t("webchat.bindingReset") });
    } catch (e) {
      addLog({
        kind: "error",
        channel: "webchat",
        text: t("webchat.bindingResetFailed", { error: String(e) }),
      });
    } finally {
      window.setTimeout(() => {
        resettingRef.current = false;
      }, 500);
    }
  }

  // error 态重试启动
  async function retryStart() {
    if (retryingRef.current) return;
    retryingRef.current = true;
    try {
      const next = await invoke<WebChatSnapshot>("start_webchat");
      setSnap(next);
      addLog({ kind: "connect", channel: "webchat", text: t("webchat.serverStarted") });
    } catch (e) {
      addLog({
        kind: "error",
        channel: "webchat",
        text: t("webchat.serverStartFailed", { error: String(e) }),
      });
    } finally {
      retryingRef.current = false;
    }
  }

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8 flex items-center justify-center">
      <div className="w-full max-w-md flex flex-col gap-5">
        {/* snap 尚未加载 or 自动启动中（短暂 idle） */}
        {(snap === null || phase === "idle") && <LoadingView />}

        {phase === "pending" && <PendingView qrDataUrl={qrDataUrl} />}

        {phase === "bound" && snap?.bound_client && (
          <BoundView
            client={snap.bound_client}
            online={snap.bound_devices > 0}
            onReset={resetBinding}
          />
        )}

        {phase === "error" && <ErrorView snap={snap} onRetry={retryStart} />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 子状态视图
// ──────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <RotateCw size={22} strokeWidth={1.75} className="animate-spin text-muted" />
      <span className="text-[12px] text-muted">{ti18n("webchat.starting")}</span>
    </div>
  );
}

/// 未绑定态：大 QR 主视觉
function PendingView({ qrDataUrl }: { qrDataUrl: string | null }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-xl overflow-hidden p-3"
        style={{
          border: "1px solid var(--border)",
          background: "white",
        }}
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="WebChat QR" width={208} height={208} />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ width: 208, height: 208 }}
          >
            <RotateCw size={22} strokeWidth={1.75} className="animate-spin text-muted" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11.5px] text-muted mt-3">
        <ScanLine size={12} strokeWidth={1.75} />
        <span>{ti18n("webchat.scanHint")}</span>
      </div>
    </div>
  );
}

/// 已绑定态：设备卡片 + 重置按钮
function BoundView({
  client,
  online,
  onReset,
}: {
  client: BoundClient;
  online: boolean;
  onReset: () => void;
}) {
  const uaShort = shortenUa(client.ua);
  const boundAtLabel = formatBoundAt(client.boundAt);
  const idShort = client.clientId.length > 16 ? `${client.clientId.slice(0, 16)}…` : client.clientId;

  return (
    <>
      {/* 主视觉：设备卡片 */}
      <div
        className="rounded-xl p-5 flex flex-col gap-4"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface-1)",
        }}
      >
        {/* 标题 + 在线徽标 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 36,
                height: 36,
                background: "var(--accent-soft)",
              }}
            >
              <Smartphone size={18} strokeWidth={1.75} className="text-accent" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-text">
                {ti18n("webchat.boundTitle")}
              </span>
              <span className="text-[11px] text-muted mt-0.5">
                {ti18n("webchat.boundSubtitle")}
              </span>
            </div>
          </div>

          <LiveBadge online={online} />
        </div>

        {/* 元数据 */}
        <dl className="flex flex-col gap-2 text-[11.5px]">
          <MetaRow label={ti18n("webchat.boundUaLabel")} value={uaShort} title={client.ua} />
          <MetaRow label={ti18n("webchat.boundAtLabel")} value={boundAtLabel} />
          <MetaRow label={ti18n("webchat.boundClientIdLabel")} value={idShort} title={client.clientId} mono />
        </dl>
      </div>

      {/* 断开连接按钮 */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onReset}
          className="tb-btn-secondary flex items-center justify-center gap-1.5"
        >
          <Unlink size={14} strokeWidth={1.75} />
          {ti18n("webchat.resetBinding")}
        </button>
      </div>
    </>
  );
}

function MetaRow({
  label,
  value,
  title,
  mono,
}: {
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right text-text ${mono ? "font-mono" : ""}`}
        title={title ?? value}
      >
        {value}
      </dd>
    </div>
  );
}

function LiveBadge({ online }: { online: boolean }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0"
      style={{
        background: online ? "var(--accent-soft)" : "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
      title={online ? ti18n("webchat.liveOnline") : ti18n("webchat.liveOffline")}
    >
      {online ? (
        <>
          <CheckCircle2 size={11} strokeWidth={1.75} className="text-accent" />
          <span className="text-[10.5px] text-accent font-medium">
            {ti18n("webchat.liveOnline")}
          </span>
        </>
      ) : (
        <>
          <WifiOff size={11} strokeWidth={1.75} className="text-muted" />
          <span className="text-[10.5px] text-muted">
            {ti18n("webchat.liveOffline")}
          </span>
        </>
      )}
    </div>
  );
}

function ErrorView({
  snap,
  onRetry,
}: {
  snap: WebChatSnapshot | null;
  onRetry: () => void;
}) {
  const body = localizeRuntime(snap?.error) || ti18n("webchat.sessionErrorFallback");

  return (
    <>
      <div
        className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        <AlertCircle size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-error" />
        <div className="flex-1">
          <p className="font-medium mb-0.5">{ti18n("webchat.sessionErrorTitle")}</p>
          <p className="text-muted">{body}</p>
        </div>
      </div>

      <button
        onClick={onRetry}
        className="tb-btn-primary flex items-center justify-center gap-1.5"
      >
        <Play size={14} strokeWidth={1.75} />
        {ti18n("webchat.retry")}
      </button>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// 工具：UA 缩写 + 绑定时间格式化
// ──────────────────────────────────────────────────────────────

/// 从 UA 字符串中提取一个对用户友好的设备摘要。
/// 优先匹配 iPhone / iPad / Android / Mac / Windows / Linux；都没命中则截断原 UA。
function shortenUa(ua: string): string {
  if (!ua) return "—";
  // iOS
  const ios = ua.match(/\((iPhone|iPad);[^)]*OS ([\d_]+)/);
  if (ios) {
    const ver = ios[2].replace(/_/g, ".");
    return `${ios[1]} · iOS ${ver}`;
  }
  // Android
  const android = ua.match(/Android ([\d.]+)[^;)]*;\s*([^);]+)/);
  if (android) {
    const model = android[2].trim().replace(/\s+Build.*$/, "");
    return `${model} · Android ${android[1]}`;
  }
  // macOS
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) {
    return `Mac · macOS ${mac[1].replace(/_/g, ".")}`;
  }
  // Windows
  if (/Windows NT/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
}

/// boundAt 是毫秒时间戳，格式化为本地化日期 + 时间
function formatBoundAt(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  const lang = useAppStore.getState().language || "zh";
  try {
    return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}
