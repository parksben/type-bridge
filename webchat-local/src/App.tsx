import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { detectDevice } from "@/lib/ua";
import { WebChatClient, type ClientStatus } from "@/lib/socket";
import { getOrCreateClientId, clearBinding, saveBinding } from "@/lib/storage";
import { t } from "@/i18n";
import PCBlockView from "@/components/PCBlockView";
import ChatPage from "@/components/ChatPage";
import type { ChatMessage } from "@/components/MessageBubble";
import ErrorScreen from "@/components/ErrorScreen";

// 会话 id 格式（与 Rust server 生成的一致）：ses_ + 15+ 个 base32/base62 字符
const SESSION_ID_REGEX = /^ses_[A-Za-z0-9]{15,32}$/;

type State =
  | { kind: "loading" }
  | { kind: "pc-block" }
  | { kind: "no-session" }
  | { kind: "chat"; sessionId: string }
  | { kind: "error"; reason: ErrorReason; detail?: string };

type ErrorReason =
  | "session-not-found"
  | "out-of-lan"
  | "already-bound"
  | "server-closed"
  | "user-disconnected"
  | "unknown";

export default function App() {
  const demo = new URLSearchParams(window.location.search).get("demo");
  if (demo) {
    return <DemoApp demo={demo} />;
  }
  return <NormalApp />;
}

function NormalApp() {
  const [state, setState] = useState<State>({ kind: "loading" });

  // WebChatClient 全生命周期单例
  const clientRef = useRef<WebChatClient | null>(null);
  const [socketStatus, setSocketStatus] = useState<ClientStatus>("connecting");

  // 从 URL 解析出的会话信息（v3：只有 sessionId）
  const sessionInfoRef = useRef<{ sessionId: string } | null>(null);
  // 防止 auto-hello 被多次触发（每次重连完成后会被重置）
  const helloAttemptedRef = useRef(false);

  // 启动：UA 分流 + URL 解析
  useEffect(() => {
    // PC 拦截
    const device = detectDevice(navigator.userAgent);
    if (device === "pc") {
      setState({ kind: "pc-block" });
      return;
    }

    // v3 URL：?s=sessionId（不再有 otp，sessionId 是手机绑定的唯一凭证）
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("s") ?? "";
    if (!sid || !SESSION_ID_REGEX.test(sid)) {
      setState({ kind: "no-session" });
      return;
    }

    sessionInfoRef.current = { sessionId: sid };

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
      onStatusChange: (s) => {
        setSocketStatus(s);
        // 重新连上后允许再握手一次（visibilitychange 重连流程）
        if (s === "connected") {
          helloAttemptedRef.current = false;
        }
      },
      onKicked: () => {
        // v4：桌面端主动停止 / 重置绑定 → server 广播 `kicked`。
        // 走跟用户主动断完全相同的清理：清本地 binding + 清 URL ?s=
        // （刷新页面不会用旧 sessionId 自动重连）+ 跳 server-closed 错误页。
        clearBinding();
        window.history.replaceState(null, "", window.location.pathname);
        setState({ kind: "error", reason: "server-closed" });
      },
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
    };
  }, []);

  // Socket 连接后自动发送 hello（v3：sessionId 来自 URL，无需用户手动输入 OTP）
  useEffect(() => {
    if (socketStatus !== "connected") return;
    if (helloAttemptedRef.current) return;
    // 已经在 chat 态时（visibilitychange 重连）也要重做 hello 刷 userToken
    if (state.kind !== "loading" && state.kind !== "chat") return;

    const client = clientRef.current;
    const info = sessionInfoRef.current;
    if (!client || !info) return;

    helloAttemptedRef.current = true;

    client.hello(info.sessionId, getOrCreateClientId()).then((ack) => {
      if (ack.ok) {
        saveBinding({
          sessionId: info.sessionId,
          userToken: ack.userToken,
          issuedAt: Date.now(),
        });
        // 维持 chat 态（如果已经在 chat 态就不重渲染）
        setState((cur) =>
          cur.kind === "chat" && cur.sessionId === info.sessionId
            ? cur
            : { kind: "chat", sessionId: info.sessionId },
        );
        return;
      }

      // v3 reason 分流
      const reason = ack.reason;
      if (reason === "SESSION_NOT_FOUND") {
        // 桌面端重置过绑定 / 换了 server 实例 → 让用户重扫
        clearBinding();
        setState({ kind: "error", reason: "session-not-found" });
      } else if (reason === "OUT_OF_LAN") {
        // 手机切到了其他 WiFi → 提示回到同一 WiFi
        setState({ kind: "error", reason: "out-of-lan" });
      } else if (reason === "ALREADY_BOUND") {
        // 另一台手机已占座
        setState({ kind: "error", reason: "already-bound" });
      } else {
        setState({ kind: "error", reason: "unknown", detail: reason });
      }
    });
  }, [state.kind, socketStatus]);

  // socket 状态变 "disconnected" 且已在 chat 态 → 判定桌面关闭
  // 给 8s 让 io-client 自动重连（手机 5G/WiFi 切换 + iOS 唤醒）
  useEffect(() => {
    if (state.kind !== "chat") return;
    if (socketStatus === "disconnected") {
      const id = window.setTimeout(() => {
        if (clientRef.current && socketStatus === "disconnected") {
          clearBinding();
          setState({ kind: "error", reason: "server-closed" });
        }
      }, 8000);
      return () => window.clearTimeout(id);
    }
  }, [state.kind, socketStatus]);

  // visibilitychange / pageshow / online 重连
  // ─────────────────────────────────────────
  // 手机切前台时主动唤醒 socket，避免 iOS Safari 把 WebSocket 冻僵：
  //   - visibilitychange visible → 已断 → connect()
  //   - pageshow (bfcache 唤醒)   → 已断 → connect()
  //   - online (网络恢复)         → 已断 → connect()
  // io-client 自带指数退避重连，但 iOS 后台冻结后通常 reconnect_attempt 不会自动触发，
  // 因此我们在用户操作回到前台的时刻显式 connect() 兜底。
  useEffect(() => {
    if (state.kind !== "chat") return;

    const wake = () => {
      const client = clientRef.current;
      if (!client) return;
      if (document.visibilityState !== "visible") return;
      // 允许重连完成后重做 hello（覆盖跨网段切换 / userToken 过期场景）
      helloAttemptedRef.current = false;
      // 如果已经连着就 no-op
      client.connect();
    };

    const onVisibility = () => wake();
    const onPageShow = (e: PageTransitionEvent) => {
      // bfcache 恢复时 e.persisted=true，最值得 wake 的场景
      if (e.persisted) wake();
      else wake();
    };
    const onOnline = () => wake();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, [state.kind]);

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
    return (
      <ChatPage
        client={clientRef.current}
        onUserDisconnect={() => {
          // v3：用户在 ChatPage 主动断连后，本地清 binding 并切到 user-disconnected 错误页
          clearBinding();
          // v4：同时把 URL 里的 ?s=<sid> 清掉，避免刷新页面后又用旧 sessionId 自动重连
          window.history.replaceState(null, "", window.location.pathname);
          setState({ kind: "error", reason: "user-disconnected" });
        }}
      />
    );
  }

  return <ErrorScreen reason={state.reason} detail={state.detail} />;
}

function DemoApp({ demo }: { demo: string }) {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get("lang") === "en" ? "en" : "zh";

  const isEnglish = lang === "en";
  const imageA = makeDemoArtDataUrl("#ff7a18", "#ffb347", "#ffffff");
  const imageB = makeDemoArtDataUrl("#7c3aed", "#22d3ee", "#f97316");

  const initialMessages = buildDemoMessages(demo, isEnglish, imageA, imageB);
  const initialMode: "chat" | "touchpad" | "keyboard" = demo.startsWith("touchpad")
    ? "touchpad"
    : demo.startsWith("keyboard")
      ? "keyboard"
      : "chat";

  const demoKeyboardTab: "dpad" | "edit" | "clipboard" | "nav" | "screenshot" =
    demo === "keyboard-edit"
      ? "edit"
      : demo === "keyboard-clipboard"
        ? "clipboard"
        : demo === "keyboard-nav"
          ? "nav"
          : demo === "keyboard-screenshot"
            ? "screenshot"
            : "dpad";

  const demoTouchpadSettings = demo === "touchpad-settings";

  return (
    <ChatPage
      client={DEMO_CLIENT}
      initialMessages={initialMessages}
      initialMode={initialMode}
      demoKeyboardTab={demoKeyboardTab}
      demoTouchpadSettings={demoTouchpadSettings}
    />
  );
}

const DEMO_CLIENT = {
  connect() {},
  disconnect() {},
  async hello() {
    return { ok: true, userToken: "demo-user-token", sessionId: "demo-session" };
  },
  async sendText() {
    return { success: true };
  },
  async sendImage() {
    return { success: true };
  },
  async sendKey() {
    return { success: true };
  },
  async sendKeyCombo() {
    return { success: true };
  },
  sendMouseMove() {},
  sendMouseScroll() {},
  sendMouseClick() {},
  sendMouseZoom() {},
  async sendScreenshot() {
    return { success: true };
  },
  setUserToken() {},
  getUserToken() {
    return "demo-user-token";
  },
} as unknown as WebChatClient;

function buildDemoMessages(
  demo: string,
  english: boolean,
  imageA: string,
  imageB: string,
): ChatMessage[] {
  const textOnly = english
    ? "This is the new mobile companion style."
    : "这是新版手机端的样式。";
  const followUp = english
    ? "It stays readable, compact, and easy to scan."
    : "气泡、留白和底栏都更紧凑，截图也更清楚。";
  const richCaption = english
    ? "A more vivid image plus text looks much closer to real usage."
    : "图片 + 文本的组合更接近日常聊天场景。";

  if (demo === "chat-image") {
    return [
      {
        clientMessageId: "demo-image",
        kind: "image",
        imagePreviewUrl: imageA,
        status: "delivered",
      },
    ];
  }

  if (demo === "chat-rich") {
    return [
      {
        clientMessageId: "demo-rich-image",
        kind: "image",
        imagePreviewUrl: imageB,
        status: "delivered",
      },
      {
        clientMessageId: "demo-rich-text",
        kind: "text",
        text: richCaption,
        status: "delivered",
      },
    ];
  }

  if (demo === "chat-main") {
    return [
      {
        clientMessageId: "demo-main-text-a",
        kind: "text",
        text: textOnly,
        status: "delivered",
      },
      {
        clientMessageId: "demo-main-text-b",
        kind: "text",
        text: followUp,
        status: "delivered",
      },
    ];
  }

  return [
    {
      clientMessageId: "demo-text-a",
      kind: "text",
      text: textOnly,
      status: "delivered",
    },
  ];
}

function makeDemoArtDataUrl(accentA: string, accentB: string, accentC: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="55%" stop-color="#111827" />
          <stop offset="100%" stop-color="#1f2937" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="${accentA}" stop-opacity="0.9" />
          <stop offset="45%" stop-color="${accentB}" stop-opacity="0.55" />
          <stop offset="100%" stop-color="${accentC}" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
        </linearGradient>
      </defs>
      <rect width="900" height="700" rx="48" fill="url(#bg)" />
      <circle cx="690" cy="145" r="125" fill="url(#glow)" />
      <rect x="110" y="145" width="420" height="282" rx="34" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.12" />
      <rect x="144" y="180" width="146" height="22" rx="11" fill="#ffffff" fill-opacity="0.28" />
      <rect x="144" y="224" width="248" height="16" rx="8" fill="#ffffff" fill-opacity="0.16" />
      <rect x="144" y="254" width="214" height="16" rx="8" fill="#ffffff" fill-opacity="0.12" />
      <rect x="144" y="304" width="304" height="48" rx="18" fill="${accentA}" fill-opacity="0.92" />
      <rect x="168" y="318" width="168" height="18" rx="9" fill="#ffffff" fill-opacity="0.9" />
      <circle cx="628" cy="420" r="120" fill="${accentB}" fill-opacity="0.22" />
      <path d="M514 510c24-78 79-116 158-116 77 0 130 35 160 107" stroke="#ffffff" stroke-opacity="0.16" stroke-width="18" stroke-linecap="round" />
      <rect x="438" y="336" width="252" height="174" rx="28" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.14" />
      <rect x="470" y="366" width="120" height="18" rx="9" fill="#ffffff" fill-opacity="0.35" />
      <rect x="470" y="398" width="174" height="14" rx="7" fill="#ffffff" fill-opacity="0.18" />
      <rect x="470" y="426" width="150" height="14" rx="7" fill="#ffffff" fill-opacity="0.12" />
      <rect x="470" y="460" width="82" height="30" rx="15" fill="${accentB}" fill-opacity="0.85" />
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
