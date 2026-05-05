import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Play,
  PowerOff,
  RotateCw,
  ScanLine,
  Timer,
  Wifi,
} from "lucide-react";
import { useAppStore } from "../../store";

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
      addLog({ kind: "connect", channel: "webchat", text: "WebChat 本机 server 已启动，等待手机扫码" });
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: `WebChat 启动失败：${e}` });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await invoke("stop_webchat");
      addLog({ kind: "connect", channel: "webchat", text: "WebChat server 已停止" });
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: `WebChat 停止失败：${e}` });
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
        addLog({ kind: "connect", channel: "webchat", text: "WebChat OTP 已重置（手动）" });
      }
      // 自动轮换路径不记日志，避免每 5 分钟刷屏
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: `WebChat OTP 轮换失败：${e}` });
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
        扫码之前确保手机与本机连接到同一 WiFi
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
        已连接 <span className="font-medium">{snap?.bound_devices ?? 0}</span> 台设备。
        QR / OTP 继续有效，其他手机扫同一码即可加入。
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
            onRotate={() => rotateOtp(true)}
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
          点「启动会话」后，App 会在本机起一个局域网 HTTP 服务，生成二维码 +
          6 位 OTP。同 WiFi 下手机扫码、输入 OTP 后即可发消息。
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
            启动中
          </>
        ) : (
          <>
            <Play size={14} strokeWidth={1.75} />
            启动会话
          </>
        )}
      </button>
    </>
  );
}

/// pending + bound 共用的"会话运行中"视图：QR + OTP 横向并排 + 进度条融入 OTP
/// 容器底部做装饰，信息密度高、视觉紧凑。phase 区分度由外层 wifiBanner /
/// boundBanner 完成。
function SessionLiveView({
  snap,
  qrDataUrl,
  remainingSecs,
  busy,
  onStop,
  onRotate,
}: {
  snap: WebChatSnapshot;
  qrDataUrl: string | null;
  remainingSecs: number;
  busy: boolean;
  onStop: () => void;
  onRotate: () => void;
}) {
  const serverUrl = snap.lan_ip && snap.port ? `http://${snap.lan_ip}:${snap.port}` : "";
  const isBound = snap.phase.kind === "bound";
  const otp = snap.otp || "";

  return (
    <>
      {/* QR + OTP 横向并排：QR 160px、OTP 列 flex-1 */}
      <div className="flex gap-4 items-stretch">
        {/* Left: QR */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div
            className="rounded-lg p-2.5 flex items-center justify-center"
            style={{
              background: "white",
              border: "1px solid var(--border)",
              width: 180,
              height: 180,
            }}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="WebChat QR" width={160} height={160} />
            ) : (
              <RotateCw size={18} strokeWidth={1.75} className="animate-spin text-muted" />
            )}
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-muted">
            <ScanLine size={10} strokeWidth={1.75} />
            <span>用手机相机扫码</span>
          </div>
          {serverUrl && (
            <div
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "var(--surface-2)",
                color: "var(--muted)",
              }}
              title={serverUrl}
            >
              {serverUrl}
            </div>
          )}
        </div>

        {/* Right: OTP column */}
        <div className="flex-1 flex flex-col gap-2 justify-center min-w-0">
          {/* label + 手动刷新 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
              <span className="text-accent">●</span>
              OTP 验证码
            </label>
            <button
              onClick={onRotate}
              disabled={busy}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--surface-2)]"
              title="刷新验证码（旧码立即失效）"
              aria-label="刷新验证码"
            >
              <RotateCw size={12} strokeWidth={2} className="text-muted" />
            </button>
          </div>

          {/* OTP pill 单容器 + 底部进度条装饰 */}
          <div
            className="relative rounded-xl overflow-hidden"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="flex items-center justify-center py-4 font-mono font-semibold tabular-nums text-text"
              style={{
                fontSize: "24px",
                letterSpacing: "0.38em",
                // 右移半格弥补 letter-spacing 导致的视觉左偏
                paddingLeft: "0.38em",
              }}
            >
              {otp || "------"}
            </div>
            <OtpProgressUnderline remainingSecs={remainingSecs} />
          </div>

          {/* 剩余时间（小字辅助，非主视觉） */}
          <div className="flex items-center gap-1 text-[10.5px] font-mono tabular-nums text-muted">
            <Timer size={10} strokeWidth={1.75} />
            <span>剩余 {formatRemaining(remainingSecs)}</span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        手机扫码后输入此 6 位 OTP 完成绑定。验证码每 60 秒自动轮换，已绑定的手机不受影响。
      </p>

      {/* 停止按钮 */}
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
        <PowerOff size={13} strokeWidth={1.75} />
        {isBound ? "停止会话" : "停止"}
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
  const title = locked ? "验证码已锁定" : "会话异常";
  const body = locked
    ? "连续 5 次 OTP 错误，当前验证码已锁定。点下方按钮生成新 OTP 解锁（已绑定设备不会受影响）。"
    : snap?.error || "会话启动异常，请重试。";

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
            处理中
          </>
        ) : locked ? (
          <>
            <RotateCw size={14} strokeWidth={1.75} />
            重置 OTP
          </>
        ) : (
          <>
            <Play size={14} strokeWidth={1.75} />
            重试
          </>
        )}
      </button>
    </>
  );
}

/// OTP 容器底部的装饰性倒计时进度条。高度 3px，吸底 + overflow-hidden 让它
/// 看起来是容器的一部分。宽度从 100% 平滑缩到 0%，归零时上层自动调
/// rotate_webchat_otp，expires_at 更新后跳回 100% 重新开始；最后 10s 变红。
function OtpProgressUnderline({ remainingSecs }: { remainingSecs: number }) {
  const percent = Math.max(0, Math.min(100, (remainingSecs / SESSION_TTL_SECS) * 100));
  const lowTime = remainingSecs <= 10;
  const fillColor = lowTime ? "var(--error)" : "var(--accent)";

  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-[3px] pointer-events-none"
      style={{ background: "var(--surface-2)" }}
    >
      <div
        className="h-full"
        style={{
          width: `${percent}%`,
          background: fillColor,
          transition: "width 1s linear, background 200ms",
        }}
      />
    </div>
  );
}

function ConnectionPill({ phase, bound }: { phase: Phase; bound: number }) {
  const dotClass =
    phase === "bound" ? "dot-connected" : phase === "pending" ? "dot-connecting" : "dot-idle";
  const text =
    phase === "bound"
      ? `已连接 ${bound} 台设备`
      : phase === "pending"
      ? "等待手机扫码"
      : phase === "idle"
      ? "未启动"
      : phase === "expired"
      ? "验证码已锁定"
      : "异常";
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`} />
      <span className="text-[12.5px] text-muted">{text}</span>
    </div>
  );
}

function formatRemaining(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
