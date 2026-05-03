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
  ShieldCheck,
  Smartphone,
  Timer,
} from "lucide-react";
import { useAppStore } from "../../store";

// ───────── Snapshot 协议（与 src-tauri/src/webchat.rs 对齐）─────────

type Phase =
  | "idle"
  | "pending"
  | "bound"
  | "expired"
  | "locked"
  | "already_bound"
  | "error";

interface WebChatSnapshot {
  phase: { kind: Phase };
  session_id: string | null;
  otp: string | null;
  aux_code: string | null;
  expires_at: number | null;
  bound_device_ua: string | null;
  bound_at: number | null;
  error: string | null;
  relay_url: string;
  qr_url: string | null;
}

const ERROR_PHASES = new Set<Phase>(["expired", "locked", "already_bound", "error"]);

const ERROR_TITLE: Record<Phase, string> = {
  idle: "",
  pending: "",
  bound: "",
  expired: "会话已过期",
  locked: "OTP 已锁定",
  already_bound: "已被另一设备绑定",
  error: "会话异常",
};

const ERROR_BODY: Record<Phase, string> = {
  idle: "",
  pending: "",
  bound: "",
  expired: "5 分钟内未握手，会话已自动作废。点「重启会话」生成新二维码。",
  locked: "OTP 错误次数过多（5 次），本会话被锁定。点「重启会话」开始一次新会话。",
  already_bound: "另一台手机已经扫码绑定了这个二维码。点「重启会话」换一个新二维码。",
  error: "会话出现异常，请「重启会话」重试。",
};

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

  // 倒计时（仅 pending）
  useEffect(() => {
    const phase = snap?.phase.kind;
    if (phase !== "pending") {
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
    if (!snap?.qr_url || snap.phase.kind !== "pending") {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(snap.qr_url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 192,
      color: { dark: "#18181b", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [snap?.qr_url, snap?.phase.kind]);

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
      addLog({ kind: "connect", channel: "webchat", text: "WebChat 会话已启动，等待手机扫码" });
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
      addLog({ kind: "connect", channel: "webchat", text: "WebChat 会话已断开" });
    } catch (e) {
      addLog({ kind: "error", channel: "webchat", text: `WebChat 停止失败：${e}` });
    } finally {
      setBusy(false);
    }
  }

  // 顶部介绍 banner — 各 phase 共用
  const introBanner = (
    <div
      className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <Info size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
      <div className="flex-1 text-text">
        TypeBridge 官方网页扫码渠道。点「启动会话」生成二维码，手机扫码后输入 6 位验证码即可发消息，无需任何 IM 配置。
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {introBanner}

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
          <ErrorView
            title={ERROR_TITLE[phase]}
            body={ERROR_BODY[phase]}
            busy={busy}
            onRestart={start}
          />
        )}

        {/* 连接状态 — 与其他渠道 tab 一致的小指示 */}
        <ConnectionPill phase={phase} />
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
          启动会话后会生成一个一次性二维码（5 分钟有效）和 6 位 OTP。
          手机用任意浏览器扫码、输入 OTP，即可绑定本机进入聊天。
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

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
          <ShieldCheck size={12} strokeWidth={1.75} />
          免责声明
        </label>
        <ul
          className="rounded-lg px-3.5 py-2.5 text-[12px] leading-relaxed flex flex-col gap-1"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--muted)",
          }}
        >
          <li className="flex gap-2">
            <span className="shrink-0 text-accent">·</span>
            <span>中继仅转发消息，不留存任何用户数据。</span>
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-accent">·</span>
            <span>语音识别在手机本地完成，音频不上传到任何服务器。</span>
          </li>
        </ul>
      </div>
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
  const auxFormatted = formatAuxCode(snap.aux_code);
  const lowTime = remainingSecs <= 60;

  return (
    <>
      {/* QR 码 + 倒计时 */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="rounded-lg p-3 flex items-center justify-center"
          style={{
            background: "white",
            border: "1px solid var(--border)",
            width: 208,
            height: 208,
          }}
        >
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="WebChat QR" width={184} height={184} />
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
          手机端扫码后会要求输入此 6 位 OTP 完成绑定。
        </p>
      </div>

      {/* 辅助会话码 */}
      {snap.aux_code && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            辅助会话码
          </label>
          <div
            className="rounded-lg px-3.5 py-2.5 flex items-center justify-between"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <span className="font-mono text-[14px] tracking-[0.2em] text-text">
              {auxFormatted}
            </span>
            <span className="text-[10.5px] text-muted">手机相机不可用时手动输入</span>
          </div>
        </div>
      )}

      {/* 两按钮：重启 / 断开 — 与飞书 tab 「启动 / 测试」 一致的双按钮布局 */}
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
          断开
        </button>
      </div>
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
  const deviceLabel = simplifyUa(snap.bound_device_ua);
  const elapsed = useElapsed(snap.bound_at);

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
          会话已绑定。手机端发的消息会自动注入到当前焦点输入框，状态徽标会在手机上实时显示
          「已收到 / 已注入 / 失败：原因」。
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
          <Smartphone size={12} strokeWidth={1.75} />
          已绑定设备
        </label>
        <div
          className="rounded-lg px-3.5 py-3 flex items-center justify-between"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <span className="text-[13px] text-text">{deviceLabel}</span>
          <span className="text-[11.5px] text-muted font-mono">{elapsed} 已连接</span>
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onStop}
          disabled={busy}
          className="tb-btn-primary flex-1 flex items-center justify-center gap-1.5"
        >
          <PowerOff size={14} strokeWidth={1.75} />
          断开会话
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
    </>
  );
}

function ErrorView({
  title,
  body,
  busy,
  onRestart,
}: {
  title: string;
  body: string;
  busy: boolean;
  onRestart: () => void;
}) {
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

function ConnectionPill({ phase }: { phase: Phase }) {
  const dotClass =
    phase === "bound" ? "dot-connected" : phase === "pending" ? "dot-connecting" : "dot-idle";
  const text =
    phase === "bound"
      ? "已连接"
      : phase === "pending"
      ? "等待手机扫码"
      : phase === "idle"
      ? "未连接"
      : phase === "expired"
      ? "已过期"
      : phase === "locked"
      ? "已锁定"
      : phase === "already_bound"
      ? "已被其他设备占用"
      : "异常";
  return (
    <div className="flex items-center gap-2.5 px-0.5 py-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`} />
      <span className="text-[12.5px] text-muted">{text}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 工具
// ──────────────────────────────────────────────────────────────

function formatRemaining(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatAuxCode(code: string | null): string {
  if (!code) return "";
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
}

function simplifyUa(ua: string | null): string {
  if (!ua) return "未知设备";
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  const safari = /Version\/[\d.]+ Safari/.test(ua);
  const chrome = /Chrome\//.test(ua);
  const platform = iOS ? "iPhone" : android ? "Android" : "手机";
  const browser = chrome && !safari ? "Chrome" : safari ? "Safari" : "浏览器";
  return `${platform} (${browser})`;
}

function useElapsed(boundAtMs: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!boundAtMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [boundAtMs]);
  if (!boundAtMs) return "刚刚";
  const secs = Math.max(0, Math.floor((now - boundAtMs) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
