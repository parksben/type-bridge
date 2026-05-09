import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCw,
  ScanLine,
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
  const [now, setNow] = useState<number>(Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const rotatingRef = useRef(false);
  const retryingRef = useRef(false);
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

  // OTP 过期自动轮换
  async function rotateOtp(manual: boolean) {
    if (rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      await invoke<WebChatSnapshot>("rotate_webchat_otp");
      if (manual) {
        addLog({ kind: "connect", channel: "webchat", text: t("webchat.otpRotated") });
      }
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: t("webchat.otpRotateFailed", { error: String(e) }) });
    } finally {
      window.setTimeout(() => { rotatingRef.current = false; }, 500);
    }
  }

  // error 态重试启动
  async function retryStart() {
    if (retryingRef.current) return;
    retryingRef.current = true;
    try {
      await invoke("start_webchat");
      addLog({ kind: "connect", channel: "webchat", text: t("webchat.serverStarted") });
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: t("webchat.serverStartFailed", { error: String(e) }) });
    } finally {
      retryingRef.current = false;
    }
  }

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

        {/* snap 尚未加载 or 自动启动中（短暂 idle） */}
        {(snap === null || phase === "idle") && <LoadingView />}

        {(phase === "pending" || phase === "bound") && (
          <SessionLiveView
            qrDataUrl={qrDataUrl}
            remainingSecs={remaining}
          />
        )}
        {(phase === "expired" || phase === "error") && (
          <ErrorView
            phase={phase}
            snap={snap}
            onRotate={() => rotateOtp(true)}
            onRetry={retryStart}
          />
        )}

        {/* 连接状态 pill */}
        {snap !== null && <ConnectionPill phase={phase} bound={snap?.bound_devices ?? 0} />}
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

/// pending + bound 共用的"会话运行中"视图
function SessionLiveView({
  qrDataUrl,
  remainingSecs,
}: {
  qrDataUrl: string | null;
  remainingSecs: number;
}) {
  const percent = Math.max(0, Math.min(100, (remainingSecs / SESSION_TTL_SECS) * 100));
  const lowTime = remainingSecs <= 10;

  // OTP 轮换瞬间 remainingSecs 从 ~0 跳到 SESSION_TTL_SECS，这一帧禁掉 transition
  // 让进度条瞬间跳满，下一帧再恢复正常动画
  const prevRef = useRef(remainingSecs);
  const isJumpUp = remainingSecs > prevRef.current;
  useEffect(() => {
    prevRef.current = remainingSecs;
  });

  return (
    <>
      {/* 二维码卡片（居中） */}
      <div className="flex flex-col items-center">
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: "1px solid var(--border)",
            background: "white",
          }}
        >
          {/* 二维码图像区域 */}
          <div className="flex items-center justify-center p-3">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="WebChat QR" width={168} height={168} />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ width: 168, height: 168 }}
              >
                <RotateCw size={20} strokeWidth={1.75} className="animate-spin text-muted" />
              </div>
            )}
          </div>

          {/* 横向进度条：紧贴二维码底部，无圆角上边 */}
          <div
            className="relative"
            style={{ height: 3, background: "var(--border)" }}
            aria-hidden="true"
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${percent}%`,
                background: lowTime ? "var(--error)" : "var(--accent)",
                transition: isJumpUp ? "none" : "width 1s linear, background 200ms",
              }}
            />
          </div>
        </div>

        {/* 扫码提示 */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted mt-3">
          <ScanLine size={11} strokeWidth={1.75} />
          <span>{ti18n("webchat.scanHint")}</span>
        </div>
      </div>
    </>
  );
}

function ErrorView({
  phase,
  snap,
  onRotate,
  onRetry,
}: {
  phase: Phase;
  snap: WebChatSnapshot | null;
  onRotate: () => void;
  onRetry: () => void;
}) {
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
        onClick={locked ? onRotate : onRetry}
        className="tb-btn-primary flex items-center justify-center gap-1.5"
      >
        {locked ? (
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
