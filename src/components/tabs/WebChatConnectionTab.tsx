import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  Play,
  PowerOff,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
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

const ERROR_PHASES = new Set<Phase>(["expired", "error"]);

export default function WebChatConnectionTab() {
  const [snap, setSnap] = useState<WebChatSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
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

  // 倒计时（仅 pending / bound）
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
  const isError = ERROR_PHASES.has(phase);

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

  // 顶部 WiFi 提醒 banner（idle/pending 时展示，让用户确认同 WiFi）
  const wifiBanner = (phase === "idle" || phase === "pending") && (
    <div
      className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <Wifi size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
      <div className="flex-1 text-text">
        手机需与本机同一 WiFi
        {snap?.wifi_name && (
          <>
            ：<span className="font-medium">{snap.wifi_name}</span>
          </>
        )}
        。若不方便切换 WiFi，可改用飞书 / 钉钉 / 企微渠道。
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {wifiBanner}

        {phase === "idle" && <IdleView busy={busy} onStart={start} />}
        {phase === "pending" && (
          <PendingView
            snap={snap!}
            qrDataUrl={qrDataUrl}
            remainingSecs={remaining}
            busy={busy}
            onRestart={start}
            onStop={stop}
          />
        )}
        {phase === "bound" && (
          <BoundView snap={snap!} busy={busy} onStop={stop} onRestart={start} />
        )}
        {isError && (
          <ErrorView phase={phase} snap={snap} busy={busy} onRestart={start} />
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
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
          <Smartphone size={12} strokeWidth={1.75} />
          会话状态
        </label>
        <div
          className="rounded-lg px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--muted)",
          }}
        >
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

      <DisclaimerCard />
    </>
  );
}

function PendingView({
  snap,
  qrDataUrl,
  remainingSecs,
  busy,
  onRestart,
  onStop,
}: {
  snap: WebChatSnapshot;
  qrDataUrl: string | null;
  remainingSecs: number;
  busy: boolean;
  onRestart: () => void;
  onStop: () => void;
}) {
  const otpDigits = (snap.otp || "").split("");
  const lowTime = remainingSecs <= 60;
  const serverUrl = snap.lan_ip && snap.port ? `http://${snap.lan_ip}:${snap.port}` : "";

  return (
    <>
      {/* QR */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="rounded-lg p-3 flex items-center justify-center"
          style={{
            background: "white",
            border: "1px solid var(--border)",
            width: 232,
            height: 232,
          }}
        >
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="WebChat QR" width={208} height={208} />
          ) : (
            <RotateCw size={18} strokeWidth={1.75} className="animate-spin text-muted" />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px]">
          <ScanLine size={12} strokeWidth={1.75} className="text-muted" />
          <span className="text-muted">用手机相机或浏览器扫码</span>
          <span className="text-subtle mx-1">·</span>
          <Timer
            size={12}
            strokeWidth={1.75}
            className={lowTime ? "text-error" : "text-muted"}
          />
          <span className={lowTime ? "text-error font-mono" : "text-muted font-mono"}>
            剩余 {formatRemaining(remainingSecs)}
          </span>
        </div>
        {serverUrl && (
          <div
            className="text-[10.5px] font-mono px-2 py-0.5 rounded"
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

      {/* OTP 6 位 */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
          <span className="text-accent">●</span>
          OTP 验证码
        </label>
        <div className="flex items-center justify-between gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 aspect-[3/4] flex items-center justify-center font-mono font-semibold tabular-nums rounded-lg"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: "22px",
                maxWidth: "52px",
              }}
            >
              {otpDigits[i] ?? ""}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
          手机扫码后会要求输入此 6 位 OTP 完成绑定。
        </p>
      </div>

      {/* 双按钮 */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={onRestart}
          disabled={busy}
          className="tb-btn-primary flex-1 flex items-center justify-center gap-1.5"
        >
          {busy ? (
            <>
              <RotateCw size={14} strokeWidth={1.75} className="animate-spin" />
              处理中
            </>
          ) : (
            <>
              <RotateCw size={14} strokeWidth={1.75} />
              重启会话
            </>
          )}
        </button>
        <button
          onClick={onStop}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 text-[13px] rounded-lg py-[10px] transition-colors disabled:cursor-not-allowed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            color: busy ? "var(--subtle)" : "var(--text)",
          }}
        >
          <PowerOff size={13} strokeWidth={1.75} />
          停止
        </button>
      </div>

      <DisclaimerCard />
    </>
  );
}

function BoundView({
  snap,
  busy,
  onStop,
  onRestart,
}: {
  snap: WebChatSnapshot;
  busy: boolean;
  onStop: () => void;
  onRestart: () => void;
}) {
  const n = snap.bound_devices;

  return (
    <>
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
          会话已绑定。手机端发的消息会自动注入到当前焦点输入框；手机上会看到「已送达」反馈。
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
          <Smartphone size={12} strokeWidth={1.75} />
          已连接设备
        </label>
        <div
          className="rounded-lg px-3.5 py-3 flex items-center justify-between"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <span className="text-[13px] text-text">{n} 台设备</span>
          {snap.wifi_name && (
            <span className="text-[11.5px] text-muted font-mono">{snap.wifi_name}</span>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onStop}
          disabled={busy}
          className="tb-btn-primary flex-1 flex items-center justify-center gap-1.5"
        >
          <PowerOff size={14} strokeWidth={1.75} />
          停止会话
        </button>
        <button
          onClick={onRestart}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 text-[13px] rounded-lg py-[10px] transition-colors disabled:cursor-not-allowed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            color: busy ? "var(--subtle)" : "var(--text)",
          }}
        >
          <RotateCw size={13} strokeWidth={1.75} />
          重启会话
        </button>
      </div>

      <DisclaimerCard />
    </>
  );
}

function ErrorView({
  phase,
  snap,
  busy,
  onRestart,
}: {
  phase: Phase;
  snap: WebChatSnapshot | null;
  busy: boolean;
  onRestart: () => void;
}) {
  const title = phase === "expired" ? "会话已过期" : "会话异常";
  const body =
    phase === "expired"
      ? "5 分钟内未完成握手，会话已自动作废。点「重启会话」生成新二维码。"
      : snap?.error || "会话出现异常，请「重启会话」重试。";

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
        onClick={onRestart}
        disabled={busy}
        className="tb-btn-primary flex items-center justify-center gap-1.5"
      >
        {busy ? (
          <>
            <RotateCw size={14} strokeWidth={1.75} className="animate-spin" />
            处理中
          </>
        ) : (
          <>
            <RotateCw size={14} strokeWidth={1.75} />
            重启会话
          </>
        )}
      </button>
    </>
  );
}

function DisclaimerCard() {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
        <ShieldCheck size={12} strokeWidth={1.75} />
        免责声明
      </label>
      <div
        className="rounded-lg px-3.5 py-3 text-[12px] leading-relaxed flex flex-col gap-1.5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <div className="flex items-start gap-2">
          <span className="text-accent font-medium">·</span>
          <span>
            WebChat 服务运行在你的电脑本地，
            <span className="text-text">数据不经过任何线上服务</span>
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-accent font-medium">·</span>
          <span>语音识别由手机自带输入法完成，音频不离开你的手机</span>
        </div>
      </div>
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
      ? "已过期"
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

// 留做 future 用（simplifyUa 等）
function _unused(ua: string | null): string {
  if (!ua) return "未知设备";
  return ua;
}
void _unused;
