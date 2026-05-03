import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Info,
  Loader2,
  Play,
  PowerOff,
  RotateCcw,
  Smartphone,
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

const ERROR_PHASES: Phase[] = ["expired", "locked", "already_bound", "error"];

const PHASE_LABEL: Record<Phase, string> = {
  idle: "未启动",
  pending: "等待手机扫码",
  bound: "已连接",
  expired: "会话已过期",
  locked: "OTP 已锁定",
  already_bound: "已被另一设备绑定",
  error: "异常",
};

const ERROR_BODY: Record<Phase, string> = {
  idle: "",
  pending: "",
  bound: "",
  expired: "5 分钟内未握手，会话已自动作废。点「重启会话」生成新二维码。",
  locked: "OTP 错误次数过多（5 次），本会话被锁定。点「重启会话」开始一次新会话。",
  already_bound: "另一台手机已经扫码绑定了这个二维码。点「重启会话」换一个新二维码。",
  error: "会话出现异常。点「重启会话」重试。",
};

export default function WebChatConnectionTab() {
  const [snap, setSnap] = useState<WebChatSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(Date.now());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const addLog = useAppStore((s) => s.addLog);

  // 初始化：拉一次 snapshot
  useEffect(() => {
    invoke<WebChatSnapshot>("webchat_snapshot")
      .then(setSnap)
      .catch(() => {});
  }, []);

  // 监听 session-update
  useEffect(() => {
    const un = listen<WebChatSnapshot>("typebridge://webchat-session-update", (e) => {
      setSnap(e.payload);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // 倒计时 ticker — 仅 pending 时跑
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

  // 渲染 QR 码（pending 阶段）
  useEffect(() => {
    if (!snap?.qr_url || snap.phase.kind !== "pending") {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(snap.qr_url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
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

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {/* Intro banner */}
      <div
        className="flex items-start gap-2.5 px-4 py-3 rounded-lg mb-5 text-[12.5px]"
        style={{
          background: "color-mix(in srgb, #7c3aed 8%, transparent)",
          color: "var(--text)",
          border: "1px solid color-mix(in srgb, #7c3aed 25%, transparent)",
        }}
      >
        <Globe size={14} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: "#7c3aed" }} />
        <div className="leading-relaxed">
          <p className="font-medium mb-0.5">TypeBridge 官方网页扫码渠道</p>
          <p style={{ color: "var(--muted)" }}>
            零 IM 配置：点「启动会话」生成二维码 + 6 位 OTP，手机扫码进
            {" "}
            <span className="font-mono" style={{ color: "var(--text)" }}>
              {snap?.relay_url || "webchat-typebridge.parksben.xyz"}
            </span>
            {" "}
            输入 OTP 即可发消息。
          </p>
        </div>
      </div>

      {phase === "idle" && <IdleState busy={busy} onStart={start} />}
      {phase === "pending" && (
        <PendingState
          snap={snap!}
          qrDataUrl={qrDataUrl}
          remainingSecs={remaining}
          busy={busy}
          onRestart={start}
          onStop={stop}
        />
      )}
      {phase === "bound" && <BoundState snap={snap!} busy={busy} onStop={stop} onRestart={start} />}
      {ERROR_PHASES.includes(phase) && (
        <ErrorState phase={phase} body={ERROR_BODY[phase]} busy={busy} onRestart={start} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 子状态视图
// ──────────────────────────────────────────────────────────────

function IdleState({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  return (
    <div className="max-w-md">
      <div
        className="rounded-xl px-5 py-6"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, #7c3aed 14%, transparent)" }}
          >
            <Smartphone size={18} className="text-[#7c3aed]" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[14px] font-medium mb-1">用手机扫码即可开始</p>
            <p className="text-[12.5px] text-muted leading-relaxed">
              启动会话后会生成一个一次性二维码（5 分钟有效）和 6 位 OTP。
              手机用任意浏览器扫码、输入 OTP，即可绑定本机进入聊天。
            </p>
          </div>
        </div>

        <button
          onClick={onStart}
          disabled={busy}
          className="w-full h-10 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "#7c3aed" }}
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Play size={15} strokeWidth={2.4} />
          )}
          {busy ? "启动中…" : "启动会话"}
        </button>

        <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg text-[11.5px] text-muted leading-relaxed"
             style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <Info size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            消息只走 TypeBridge 官方中继转发，不持久化（pull 后立即删除，硬性 TTL ≤ 5 分钟）。
            语音转文本完全在手机浏览器内完成，音频不离开手机。
          </span>
        </div>
      </div>
    </div>
  );
}

function PendingState({
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

  return (
    <div className="max-w-2xl">
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex flex-col md:flex-row gap-5">
          {/* QR code 区 */}
          <div className="shrink-0 flex flex-col items-center md:items-start">
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
                <Loader2 size={20} className="animate-spin text-muted" />
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">用手机相机或浏览器扫码</p>
          </div>

          {/* 信息区 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 text-[12.5px]">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                style={{
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  color: "var(--accent)",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--accent)" }}
                />
                等待手机扫码
              </span>
              <span className="text-muted font-mono">
                剩余 {formatRemaining(remainingSecs)}
              </span>
            </div>

            <p className="text-[12.5px] text-muted leading-relaxed mb-3">
              在手机端输入下方 6 位 OTP 验证码完成握手：
            </p>

            <div className="flex items-center gap-2 mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-10 h-12 rounded-lg flex items-center justify-center font-mono text-[22px] font-semibold tabular-nums"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  {otpDigits[i] ?? ""}
                </div>
              ))}
            </div>

            {/* 辅助会话码 */}
            {snap.aux_code && (
              <div
                className="rounded-lg px-3 py-2 mb-4 text-[11.5px]"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <p className="font-medium mb-0.5">辅助会话码</p>
                <p className="font-mono text-[14px] tracking-wider mb-1" style={{ color: "var(--text)" }}>
                  {auxFormatted}
                </p>
                <p className="text-muted leading-relaxed">
                  手机相机不可用？打开 {snap.relay_url} 手动输入此码。
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={onRestart}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-all disabled:opacity-60"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                <RotateCcw size={13} strokeWidth={2.2} />
                重启会话
              </button>
              <button
                onClick={onStop}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-all disabled:opacity-60"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                <PowerOff size={13} strokeWidth={2.2} />
                断开
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoundState({
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
    <div className="max-w-md">
      <div
        className="rounded-xl px-5 py-5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, var(--success) 14%, transparent)" }}
          >
            <CheckCircle2 size={20} className="text-success" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[14px] font-medium">会话已绑定</p>
            <p className="text-[12px] text-muted mt-0.5">
              设备：{deviceLabel} · {elapsed} 已连接
            </p>
          </div>
        </div>

        <div className="text-[12px] text-muted leading-relaxed mb-4 px-3 py-2.5 rounded-lg"
             style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          手机端发的消息会自动注入到当前焦点的输入框。把焦点切到目标 App 即可。
          消息状态会在手机上实时显示「已收到 / 已注入 / 失败：原因」。
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onStop}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-all disabled:opacity-60"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <PowerOff size={13} strokeWidth={2.2} />
            断开会话
          </button>
          <button
            onClick={onRestart}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-medium transition-all disabled:opacity-60"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            <RotateCcw size={13} strokeWidth={2.2} />
            重启会话
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorState({
  phase,
  body,
  busy,
  onRestart,
}: {
  phase: Phase;
  body: string;
  busy: boolean;
  onRestart: () => void;
}) {
  return (
    <div className="max-w-md">
      <div
        className="rounded-xl px-5 py-5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, var(--error) 14%, transparent)" }}
          >
            <AlertCircle size={20} className="text-error" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[14px] font-medium">{PHASE_LABEL[phase]}</p>
            <p className="text-[12px] text-muted mt-1 leading-relaxed">{body}</p>
          </div>
        </div>

        <button
          onClick={onRestart}
          disabled={busy}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg font-medium text-white transition-all disabled:opacity-60"
          style={{ background: "#7c3aed" }}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RotateCcw size={14} strokeWidth={2.2} />
          )}
          重启会话
        </button>
      </div>
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
  // 8 字符切成 4-4 显示，例：A2K9-FH3Z
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
}

function simplifyUa(ua: string | null): string {
  if (!ua) return "未知设备";
  // 简单提取 iPhone / Android + Safari / Chrome
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
