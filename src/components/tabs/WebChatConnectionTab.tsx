import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Play,
  RotateCw,
  ScanLine,
  Square,
  Unplug,
  Wifi,
} from "lucide-react";
import { useAppStore } from "../../store";
import { useI18n, t as ti18n } from "../../i18n";
import { localizeRuntime } from "../../i18n/runtime";

// ───────── Snapshot 协议（与 src-tauri/src/webchat.rs 对齐）─────────
// v2 本地局域网版：
// - 无 relay_url（无云端）
// - 新增 lan_ip / port / wifi_name / bound_devices
// - phase 改为 flat 枚举 tag="kind"

type Phase = "idle" | "pending" | "bound" | "expired" | "error";

interface WebChatSnapshot {
  phase: { kind: Phase };
  session_id: string | null;
  otp: string | null;
  expires_at: number | null;
  lan_ip: string | null;
  port: number | null;
  wifi_name: string | null;
  bound_devices: number;
  error: string | null;
  qr_url: string | null;
}

// 与 Rust 侧 SESSION_TTL_SECS 对齐（src-tauri/src/webchat_server.rs）
const SESSION_TTL_SECS = 60;

export default function WebChatConnectionTab() {
  const [snap, setSnap] = useState<WebChatSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  // 防止 remainingSecs=0 那一刻被多次 effect 连续触发
  const rotatingRef = useRef(false);
  const addLog = useAppStore((s) => s.addLog);
  const { t } = useI18n();

  // 初始化 snapshot
  useEffect(() => {
    invoke<WebChatSnapshot>("webchat_snapshot").then(setSnap).catch(() => {});
  }, []);

  // 订阅 session 更新
  useEffect(() => {
    const un = listen<WebChatSnapshot>(
      "typebridge://webchat-session-update",
      (e) => setSnap(e.payload),
    );
    return () => {
      un.then((f) => f());
    };
  }, []);

  // 倒计时（仅 pending / bound — 这两个态 OTP 都在倒计时）
  useEffect(() => {
    const phase = snap?.phase.kind;
    const needTick = phase === "pending" || phase === "bound";
    if (!needTick) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    if (tickRef.current === null) {
      tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [snap?.phase.kind]);

  // 渲染 QR
  useEffect(() => {
    if (!snap?.qr_url) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(snap.qr_url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 208,
      color: { dark: "#18181b", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [snap?.qr_url]);

  const remaining = useMemo(() => {
    const exp = snap?.expires_at ?? 0;
    if (!exp) return 0;
    return Math.max(0, Math.floor((exp - now) / 1000));
  }, [snap?.expires_at, now]);

  const phase: Phase = snap?.phase.kind ?? "idle";

  async function start() {
    setBusy(true);
    try {
      await invoke("start_webchat");
      addLog({ kind: "connect", channel: "webchat", text: t("webchat.serverStarted") });
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: t("webchat.serverStartFailed", { error: String(e) }) });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await invoke("stop_webchat");
      addLog({ kind: "connect", channel: "webchat", text: t("webchat.serverStopped") });
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: t("webchat.serverStopFailed", { error: String(e) }) });
    } finally {
      setBusy(false);
    }
  }

  async function rotateOtp(manual: boolean) {
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      await invoke<WebChatSnapshot>("rotate_webchat_otp");
      if (manual) {
        addLog({ kind: "connect", channel: "webchat", text: t("webchat.otpRotated") });
      }
      // 自动轮换路径不记日志，避免每 5 分钟刷屏
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: t("webchat.otpRotateFailed", { error: String(e) }) });
    } finally {
      // 稍延迟解锁，等 snapshot 更新到来刷新 expires_at 再允许下一次
      window.setTimeout(() => {
        rotatingRef.current = false;
      }, 500);
    }
  }

  // OTP 自动轮换：pending / bound 态下 remaining 归零时桌面端无感刷新 OTP。
  // 锁定态（expired）故意 NOT 自动轮换 — 要求用户手动「重置 OTP」，保留
  // brute-force 防护语义
  useEffect(() => {
    if (phase !== "pending" && phase !== "bound") return;
    if (!snap?.expires_at) return;
    if (remaining > 0) return;
    rotateOtp(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining, snap?.expires_at]);

  // 顶部 WiFi 提醒 banner（仅 pending 阶段展示 — 用户扫码前才需要确认同 WiFi；
  // bound 态另展示"已连接 N 台设备"的成功横条，过期/异常态有 ErrorView）
  const wifiBanner = phase === "pending" && (
    <div
      className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <Wifi size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
      <div className="flex-1 text-text">
        {t("webchat.wifiHint")}
        {snap?.wifi_name && (
          <>
            ：<span className="font-medium">{snap.wifi_name}</span>
          </>
        )}
      </div>
    </div>
  );

  // 已绑定成功横条（仅 bound 阶段）— 告诉用户 QR + OTP 仍有效、其他手机可继续加入
  const boundBanner = phase === "bound" && (
    <div
      className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
      style={{
        background: "var(--accent-soft)",
        border: "1px solid var(--border)",
        color: "var(--text)",
      }}
    >
      <CheckCircle2 size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
      <div className="flex-1">
        {t("webchat.boundDevicesPrefix")}
        <span className="font-medium">{snap?.bound_devices ?? 0}</span>
        {t("webchat.boundDevicesSuffix")}
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {wifiBanner}
        {boundBanner}

        {phase === "idle" && <IdleView busy={busy} onStart={start} />}
        {(phase === "pending" || phase === "bound") && (
          <SessionLiveView
            snap={snap!}
            qrDataUrl={qrDataUrl}
            remainingSecs={remaining}
            busy={busy}
            onStop={stop}
          />
        )}
        {(phase === "expired" || phase === "error") && (
          <ErrorView
            phase={phase}
            snap={snap}
            busy={busy}
            onRotate={() => rotateOtp(true)}
            onStart={start}
          />
        )}

        {/* 连接状态 pill */}
        <ConnectionPill phase={phase} bound={snap?.bound_devices ?? 0} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 子状态视图
// ──────────────────────────────────────────────────────────────

function IdleView({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  return (
    <>
      <div
        className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Info size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
        <div className="flex-1 text-text">
          {ti18n("webchat.idleHint")}
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={busy}
        className="tb-btn-primary flex items-center justify-center gap-1.5"
      >
        {busy ? (
          <>
            <RotateCw size={14} strokeWidth={1.75} className="animate-spin" />
            {ti18n("webchat.starting")}
          </>
        ) : (
          <>
            <Play size={14} strokeWidth={1.75} />
            {ti18n("webchat.startSession")}
          </>
        )}
      </button>
    </>
  );
}

/// pending + bound 共用的"会话运行中"视图：二维码居中，外圈进度环显示 OTP
/// 剩余有效时间（无数字倒计时）。底部一行"用手机扫码即可连接"提示 + 停止按钮。
/// phase 区分度由外层 wifiBanner / boundBanner 完成。
function SessionLiveView({
  snap,
  qrDataUrl,
  remainingSecs,
  busy,
  onStop,
}: {
  snap: WebChatSnapshot;
  qrDataUrl: string | null;
  remainingSecs: number;
  busy: boolean;
  onStop: () => void;
}) {
  const isBound = snap.phase.kind === "bound";

  // 进度环参数
  const r = 96;
  const circumference = 2 * Math.PI * r;
  const percent = Math.max(0, Math.min(100, (remainingSecs / SESSION_TTL_SECS) * 100));
  const offset = circumference * (1 - percent / 100);
  const lowTime = remainingSecs <= 10;

  // OTP 轮换瞬间 remainingSecs 从 ~0 跳到 SESSION_TTL_SECS，这一帧禁掉 transition
  // 让进度环瞬间跳满，下一帧再恢复正常动画
  const prevRef = useRef(remainingSecs);
  const isJumpUp = remainingSecs > prevRef.current;
  useEffect(() => {
    prevRef.current = remainingSecs;
  });

  return (
    <>
      {/* 二维码 + 进度环（居中） */}
      <div className="flex flex-col items-center gap-3">
        <div style={{ position: "relative", width: 200, height: 200 }}>
          {/* 进度环 SVG */}
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden="true"
          >
            {/* 底色轨道 */}
            <circle
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth="3"
            />
            {/* 进度弧线，从 12 点方向顺时针收缩 */}
            <circle
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke={lowTime ? "var(--error)" : "var(--accent)"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${offset}`}
              transform="rotate(-90 100 100)"
              style={{
                transition: isJumpUp
                  ? "none"
                  : "stroke-dashoffset 1s linear, stroke 200ms",
              }}
            />
          </svg>
          {/* 二维码容器，内缩 8px 留出进度环位置 */}
          <div
            className="absolute rounded-lg flex items-center justify-center"
            style={{
              inset: "8px",
              background: "white",
              border: "1px solid var(--border)",
            }}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="WebChat QR" width={152} height={152} />
            ) : (
              <RotateCw size={18} strokeWidth={1.75} className="animate-spin text-muted" />
            )}
          </div>
        </div>

        {/* 扫码提示 */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <ScanLine size={11} strokeWidth={1.75} />
          <span>{ti18n("webchat.scanHint")}</span>
        </div>
      </div>

      {/* 停止 / 断开会话按钮 */}
      <button
        onClick={onStop}
        disabled={busy}
        className="flex items-center justify-center gap-1.5 text-[13px] rounded-lg py-[10px] mt-1 transition-colors disabled:cursor-not-allowed"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-strong)",
          color: busy ? "var(--subtle)" : "var(--text)",
        }}
      >
        {isBound ? (
          <>
            <Unplug size={13} strokeWidth={1.75} />
            {ti18n("webchat.disconnect")}
          </>
        ) : (
          <>
            <Square size={13} strokeWidth={1.75} />
            {ti18n("webchat.stop")}
          </>
        )}
      </button>
    </>
  );
}

function ErrorView({
  phase,
  snap,
  busy,
  onRotate,
  onStart,
}: {
  phase: Phase;
  snap: WebChatSnapshot | null;
  busy: boolean;
  onRotate: () => void;
  onStart: () => void;
}) {
  // expired 态语义是 "OTP 被锁定（5 次输错）"，这时 server 还在跑、bindings 还在，
  // 手动轮换 OTP 即可恢复。error 态是 server 启动失败，需要重新 start。
  const locked = phase === "expired";
  const title = locked ? ti18n("webchat.lockedTitle") : ti18n("webchat.sessionErrorTitle");
  const body = locked
    ? ti18n("webchat.lockedBody")
    : localizeRuntime(snap?.error) || ti18n("webchat.sessionErrorFallback");

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
          <p className="font-medium mb-0.5">{title}</p>
          <p className="text-muted">{body}</p>
        </div>
      </div>

      <button
        onClick={locked ? onRotate : onStart}
        disabled={busy}
        className="tb-btn-primary flex items-center justify-center gap-1.5"
      >
        {busy ? (
          <>
            <RotateCw size={14} strokeWidth={1.75} className="animate-spin" />
            {ti18n("webchat.processing")}
          </>
        ) : locked ? (
          <>
            <RotateCw size={14} strokeWidth={1.75} />
            {ti18n("webchat.resetOtp")}
          </>
        ) : (
          <>
            <Play size={14} strokeWidth={1.75} />
            {ti18n("webchat.retry")}
          </>
        )}
      </button>
    </>
  );
}

function ConnectionPill({ phase, bound }: { phase: Phase; bound: number }) {
  const dotClass =
    phase === "bound" ? "dot-connected" : phase === "pending" ? "dot-connecting" : "dot-idle";
  const text =
    phase === "bound"
      ? ti18n("webchat.pillBound", { count: bound })
      : phase === "pending"
      ? ti18n("webchat.pillPending")
      : phase === "idle"
      ? ti18n("webchat.pillIdle")
      : phase === "expired"
      ? ti18n("webchat.pillExpired")
      : ti18n("webchat.pillError");
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`} />
      <span className="text-[12.5px] text-muted">{text}</span>
    </div>
  );
}
