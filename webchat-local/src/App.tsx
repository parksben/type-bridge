import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { detectDevice } from "@/lib/ua";
import { WebChatClient, type ClientStatus } from "@/lib/socket";
import { getOrCreateClientId, clearBinding, saveBinding } from "@/lib/storage";
import { t } from "@/i18n";
import PCBlockView from "@/components/PCBlockView";
import ChatPage from "@/components/ChatPage";
import ErrorScreen from "@/components/ErrorScreen";

// 会话 id 格式（与 Rust server 生成的一致）：ses_ + 15 个 base32 字符
const SESSION_ID_REGEX = /^ses_[A-Z2-7]{15,24}$/;

type State =
  | { kind: "loading" }
  | { kind: "pc-block" }
  | { kind: "no-session" }
  | { kind: "chat"; sessionId: string }
  | { kind: "error"; reason: ErrorReason; detail?: string };

type ErrorReason = "otp-locked" | "otp-expired" | "server-closed" | "unknown";

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  // WebChatClient 全生命周期单例
  const clientRef = useRef<WebChatClient | null>(null);
  const [socketStatus, setSocketStatus] = useState<ClientStatus>("connecting");

  // 从 URL 解析出的会话信息
  const sessionInfoRef = useRef<{ sessionId: string; otp: string } | null>(null);
  // 防止 auto-hello 被多次触发
  const helloAttemptedRef = useRef(false);

  // 启动：UA 分流 + URL 解析
  useEffect(() => {
    // PC 拦截
    const device = detectDevice(navigator.userAgent);
    if (device === "pc") {
      setState({ kind: "pc-block" });
      return;
    }

    // URL ?s=sessionId&otp=XXXXXX
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("s") ?? "";
    const otp = params.get("otp") ?? "";
    if (!sid || !SESSION_ID_REGEX.test(sid) || !otp) {
      setState({ kind: "no-session" });
      return;
    }

    sessionInfoRef.current = { sessionId: sid, otp };

    // dev 模式下，Rust server 会 302 把页面重定向到 Vite dev (5173) 并在 query 里
    // 加 apiPort=<rust_port>。这里读出来后让 socket.io-client 显式连那个端口
    // (跨源；CORS 已 permissive)。生产环境不存在这个参数，回落同源。
    const apiPort = params.get("apiPort");
    const apiUrl = apiPort
      ? `http://${window.location.hostname}:${apiPort}`
      : undefined;

    // 创建 client 并 connect；state 保持 loading 直到 hello 完成
    const client = new WebChatClient({
      url: apiUrl,
      onStatusChange: (s) => setSocketStatus(s),
    });
    clientRef.current = client;
    client.connect();

    // 页面关闭/跳转时主动断连，让桌面端立即感知（不等心跳超时）
    const handleUnload = () => client.disconnect();
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      client.disconnect();
    };
  }, []);

  // Socket 连接后自动发送 hello（OTP 来自 URL 参数，无需用户手动输入）
  useEffect(() => {
    if (state.kind !== "loading") return;
    if (socketStatus !== "connected") return;
    if (helloAttemptedRef.current) return;

    const client = clientRef.current;
    const info = sessionInfoRef.current;
    if (!client || !info) return;

    helloAttemptedRef.current = true;

    client.hello(info.otp, getOrCreateClientId()).then((ack) => {
      if (ack.ok) {
        saveBinding({
          sessionId: info.sessionId,
          userToken: ack.userToken,
          issuedAt: Date.now(),
        });
        setState({ kind: "chat", sessionId: info.sessionId });
        return;
      }

      // 失败：按 reason 分流
      const reason = ack.reason;
      if (reason === "OTP_LOCKED") {
        setState({ kind: "error", reason: "otp-locked" });
      } else if (reason === "SESSION_EXPIRED" || reason === "OTP_INVALID") {
        // OTP 已过期或不匹配（可能扫到刚轮换过的旧 QR）→ 提示重扫
        setState({ kind: "error", reason: "otp-expired" });
      } else {
        setState({ kind: "error", reason: "unknown", detail: reason });
      }
    });
  }, [state.kind, socketStatus]);

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

  if (state.kind === "chat") {
    // 保险起见 clientRef 必然存在
    if (!clientRef.current) {
      return <ErrorScreen reason="unknown" detail={t("app.socketNotReady")} />;
    }
    return <ChatPage client={clientRef.current} />;
  }

  return <ErrorScreen reason={state.reason} detail={state.detail} />;
}
