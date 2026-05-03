"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import HandshakeForm from "./HandshakeForm";
import ChatPage from "./ChatPage";
import AuxCodeEntry from "./AuxCodeEntry";
import ErrorScreen from "./ErrorScreen";
import { pollAcks, pollHandshake, submitHandshake, RelayError } from "../lib/relay";

type State =
  | { kind: "loading" }
  | { kind: "no-session" }
  | { kind: "handshake"; sessionId: string }
  | { kind: "chat"; sessionId: string; userToken: string }
  | { kind: "expired" }
  | { kind: "locked" }
  | { kind: "already-bound" }
  | { kind: "owner-lost" };

const STORAGE_KEY = "typebridge_webchat_session";

type StoredSession = {
  sessionId: string;
  userToken: string;
  boundAt: number;
};

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.sessionId === "string" &&
      typeof parsed.userToken === "string" &&
      typeof parsed.boundAt === "number"
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredSession(s: StoredSession) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

function clearStoredSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function MobileApp() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [otpErrorNonce, setOtpErrorNonce] = useState(0);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | undefined>();
  const handshakePollAlive = useRef(false);

  // ── 启动：读 URL ?s=，优先尝试 localStorage 恢复；否则走握手流程
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlSid = params.get("s");
    if (!urlSid || !/^ses_[A-Z2-7]{24}$/.test(urlSid)) {
      setState({ kind: "no-session" });
      return;
    }

    const stored = readStoredSession();
    if (stored && stored.sessionId === urlSid) {
      // 有同 sessionId 的 token → 先做一次探测，确认 session 仍在
      (async () => {
        try {
          await pollAcks(urlSid, stored.userToken, Date.now());
          // 探测成功（200 有 ack 或 204 timeout）→ 直接进 chat
          setState({ kind: "chat", sessionId: urlSid, userToken: stored.userToken });
        } catch (err) {
          const e = err as RelayError;
          if (e.code === "BAD_TOKEN" || e.code === "NOT_FOUND" || e.code === "EXPIRED" || e.code === "OWNER_LOST") {
            clearStoredSession();
            setState({ kind: "handshake", sessionId: urlSid });
          } else {
            // 网络抖动：仍然尝试直接进 chat，让 ChatPage 的 loop 去续命 / 感知断连
            setState({ kind: "chat", sessionId: urlSid, userToken: stored.userToken });
          }
        }
      })();
      return;
    }

    // localStorage 里没有匹配的 session → 走正常握手
    if (stored) clearStoredSession();
    setState({ kind: "handshake", sessionId: urlSid });
  }, []);

  // ── 握手长轮询：在 handshake 阶段持续 long-poll 等桌面裁决
  useEffect(() => {
    if (state.kind !== "handshake") return;
    handshakePollAlive.current = true;
    const sessionId = state.sessionId;

    async function loop() {
      while (handshakePollAlive.current) {
        try {
          const r = await pollHandshake(sessionId);
          if (!handshakePollAlive.current) break;
          if (!r) continue;

          const hr = r.handshakeResult;
          if (hr.accepted && hr.userToken) {
            writeStoredSession({
              sessionId,
              userToken: hr.userToken,
              boundAt: Date.now(),
            });
            setState({ kind: "chat", sessionId, userToken: hr.userToken });
            return;
          }
          if (hr.reason === "OTP_LOCKED") {
            setState({ kind: "locked" });
            return;
          }
          setOtpErrorNonce((n) => n + 1);
          setOtpErrorMsg("验证码错误，请重试");
        } catch (err) {
          if (!handshakePollAlive.current) return;
          const e = err as RelayError;
          if (e.code === "EXPIRED" || e.code === "OWNER_LOST") {
            setState({ kind: "expired" });
            return;
          }
          if (e.code === "ALREADY_BOUND") {
            setState({ kind: "already-bound" });
            return;
          }
          if (e.code === "NOT_FOUND") {
            setState({ kind: "expired" });
            return;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    loop();
    return () => {
      handshakePollAlive.current = false;
    };
  }, [state]);

  async function handleOtp(otp: string) {
    if (state.kind !== "handshake") return;
    setOtpErrorMsg(undefined);
    try {
      await submitHandshake(state.sessionId, otp);
    } catch (err) {
      const e = err as RelayError;
      if (e.code === "OTP_LOCKED") setState({ kind: "locked" });
      else if (e.code === "ALREADY_BOUND") setState({ kind: "already-bound" });
      else if (e.code === "EXPIRED" || e.code === "OWNER_LOST" || e.code === "NOT_FOUND") {
        setState({ kind: "expired" });
      } else {
        setOtpErrorNonce((n) => n + 1);
        setOtpErrorMsg(e.message || "提交失败");
      }
    }
  }

  function reload() {
    clearStoredSession();
    // 清掉 URL ?s= 避免刷新后又用同一个已失效 sessionId 走握手
    // 再次看到「会话已过期」误导。没有 session 时 MobileApp 会引导到辅助码输入。
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.history.replaceState({}, "", url.toString());
    window.location.reload();
  }

  function handleSessionLost() {
    clearStoredSession();
    setState({ kind: "owner-lost" });
  }

  if (state.kind === "loading") {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 safe-area-top safe-area-bottom">
        <Loader2 size={28} className="animate-spin text-[var(--tb-muted)] mb-4" />
        <p className="text-[var(--tb-muted)] text-sm">正在加载 TypeBridge WebChat…</p>
      </main>
    );
  }

  if (state.kind === "no-session") {
    return (
      <AuxCodeEntry
        onResolve={(sessionId) => {
          const url = new URL(window.location.href);
          url.searchParams.set("s", sessionId);
          window.history.replaceState({}, "", url.toString());
          setState({ kind: "handshake", sessionId });
        }}
      />
    );
  }

  if (state.kind === "handshake") {
    return (
      <HandshakeForm
        sessionId={state.sessionId}
        onSubmit={handleOtp}
        errorNonce={otpErrorNonce}
        errorMessage={otpErrorMsg}
      />
    );
  }

  if (state.kind === "chat") {
    return (
      <ChatPage
        sessionId={state.sessionId}
        userToken={state.userToken}
        onSessionLost={handleSessionLost}
      />
    );
  }

  return <ErrorScreen reason={state.kind} onRetry={reload} />;
}
