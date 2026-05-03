"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import HandshakeForm from "./components/HandshakeForm";
import ChatPage from "./components/ChatPage";
import AuxCodeEntry from "./components/AuxCodeEntry";
import ErrorScreen from "./components/ErrorScreen";
import { pollHandshake, submitHandshake, RelayError } from "./lib/relay";

type State =
  | { kind: "loading" }
  | { kind: "no-session" }
  | { kind: "handshake"; sessionId: string }
  | { kind: "chat"; sessionId: string; userToken: string }
  | { kind: "expired" }
  | { kind: "locked" }
  | { kind: "already-bound" }
  | { kind: "owner-lost" };

export default function HomePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // 错误抖动 nonce + 文案
  const [otpErrorNonce, setOtpErrorNonce] = useState(0);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | undefined>();
  // 长轮询取消
  const handshakePollAlive = useRef(false);

  // ── 启动：解析 URL 中的 ?s=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("s");
    if (s && /^ses_[A-Z2-7]{24}$/.test(s)) {
      setState({ kind: "handshake", sessionId: s });
    } else {
      setState({ kind: "no-session" });
    }
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
          if (!r) continue; // 204 timeout，立即重 poll

          const hr = r.handshakeResult;
          if (hr.accepted && hr.userToken) {
            setState({ kind: "chat", sessionId, userToken: hr.userToken });
            return;
          }
          // 不通过：根据 reason 决定
          if (hr.reason === "OTP_LOCKED") {
            setState({ kind: "locked" });
            return;
          }
          // INVALID_OTP：抖动 + 让用户重输
          setOtpErrorNonce((n) => n + 1);
          setOtpErrorMsg("验证码错误，请重试");
          // 继续 poll，等用户重新提交
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
          // 网络抖动：1.5s 后重试
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
      // 等 handshake long-poll 拿裁决；不在这里直接切状态
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
    window.location.reload();
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
          // 替换 URL 不刷新，直接切到握手页
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
        onSessionLost={() => setState({ kind: "owner-lost" })}
      />
    );
  }

  return <ErrorScreen reason={state.kind} onRetry={reload} />;
}
