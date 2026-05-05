import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { detectDevice } from "@/lib/ua";
import { WebChatClient, type ClientStatus } from "@/lib/socket";
import { getOrCreateClientId, clearBinding, saveBinding } from "@/lib/storage";
import { t } from "@/i18n";
import PCBlockView from "@/components/PCBlockView";
import HandshakeForm from "@/components/HandshakeForm";
import ChatPage from "@/components/ChatPage";
import ErrorScreen from "@/components/ErrorScreen";

// 会话 id 格式（与 Rust server 生成的一致）：ses_ + 15 个 base32 字符
const SESSION_ID_REGEX = /^ses_[A-Z2-7]{15,24}$/;

type State =
  | { kind: "loading" }
  | { kind: "pc-block" }
  | { kind: "no-session" }
  | { kind: "handshake"; sessionId: string }
  | { kind: "chat"; sessionId: string }
  | { kind: "error"; reason: ErrorReason; detail?: string };

type ErrorReason = "otp-locked" | "session-expired" | "server-closed" | "unknown";

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [otpErrorNonce, setOtpErrorNonce] = useState(0);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | undefined>();

  // WebChatClient 全生命周期单例
  const clientRef = useRef<WebChatClient | null>(null);
  const [socketStatus, setSocketStatus] = useState<ClientStatus>("connecting");

  // 启动：UA 分流 + URL 解析
  useEffect(() => {
    // PC 拦截
    const device = detectDevice(navigator.userAgent);
    if (device === "pc") {
      setState({ kind: "pc-block" });
      return;
    }

    // URL ?s=sessionId
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("s") ?? "";
    if (!sid || !SESSION_ID_REGEX.test(sid)) {
      setState({ kind: "no-session" });
      return;
    }

    // 进握手
    setState({ kind: "handshake", sessionId: sid });

    // dev 模式下，Rust server 会 302 把页面重定向到 Vite dev (5173) 并在 query 里
    // 加 apiPort=<rust_port>。这里读出来后让 socket.io-client 显式连那个端口
    // (跨源；CORS 已 permissive)。生产环境不存在这个参数，回落同源。
    const apiPort = params.get("apiPort");
    const apiUrl = apiPort
      ? `http://${window.location.hostname}:${apiPort}`
      : undefined;

    // 创建 client 并 connect
    const client = new WebChatClient({
      url: apiUrl,
      onStatusChange: (s) => setSocketStatus(s),
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
    };
  }, []);

  async function handleOtp(otp: string) {
    const client = clientRef.current;
    if (!client || state.kind !== "handshake") return;
    setOtpErrorMsg(undefined);

    const ack = await client.hello(otp, getOrCreateClientId());
    if (ack.ok) {
      // 持久化绑定（刷新恢复用；v2 P3 阶段只存不用，P5 阶段再做 token 探测复用）
      saveBinding({
        sessionId: state.sessionId,
        userToken: ack.userToken,
        issuedAt: Date.now(),
      });
      setState({ kind: "chat", sessionId: state.sessionId });
      return;
    }

    // 失败：按 reason 分流
    const reason = ack.reason;
    if (reason === "OTP_LOCKED") {
      setState({ kind: "error", reason: "otp-locked" });
      return;
    }
    if (reason === "SESSION_EXPIRED") {
      setState({ kind: "error", reason: "session-expired" });
      return;
    }
    // OTP_INVALID 或其他 → 抖动提示，允许再试
    setOtpErrorNonce((n) => n + 1);
    setOtpErrorMsg(humanizeReason(reason));
  }

  // socket 状态变 "disconnected" 且已在 chat 态 → 判定桌面关闭
  useEffect(() => {
    if (state.kind !== "chat") return;
    if (socketStatus === "disconnected") {
      // 等 5s 看是否 auto-reconnect，如果没恢复就判定桌面关闭
      const id = window.setTimeout(() => {
        if (clientRef.current && socketStatus === "disconnected") {
          clearBinding();
          setState({ kind: "error", reason: "server-closed" });
        }
      }, 5000);
      return () => window.clearTimeout(id);
    }
  }, [state.kind, socketStatus]);

  // ─────────────── render ───────────────

  if (state.kind === "loading") {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[var(--tb-muted)]" />
      </main>
    );
  }

  if (state.kind === "pc-block") {
    return <PCBlockView />;
  }

  if (state.kind === "no-session") {
    return <ErrorScreen reason="no-session" />;
  }

  if (state.kind === "handshake") {
    return (
      <HandshakeForm
        onSubmit={handleOtp}
        errorNonce={otpErrorNonce}
        errorMessage={otpErrorMsg}
      />
    );
  }

  if (state.kind === "chat") {
    // 保险起见 clientRef 必然存在
    if (!clientRef.current) {
      return <ErrorScreen reason="unknown" detail="client not initialized" />;
    }
    return <ChatPage client={clientRef.current} />;
  }

  return <ErrorScreen reason={state.reason} detail={state.detail} />;
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "OTP_INVALID":
      return t("app.otpInvalid");
    case "OTP_LOCKED":
      return t("app.otpLocked");
    case "SESSION_EXPIRED":
      return t("app.sessionExpired");
    default:
      return reason || t("app.handshakeFailed");
  }
}
