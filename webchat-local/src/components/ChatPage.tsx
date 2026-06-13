import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import ComposerBar from "./ComposerBar";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import TouchPad from "./TouchPad";
import QuickCommands from "./QuickCommands";
import { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type Props = {
  client: WebChatClient;
  initialMessages?: ChatMessage[];
  initialMode?: PageMode;
  demoTouchpadSettings?: boolean;
  demoKeyboardTab?: "dpad" | "edit" | "clipboard" | "nav" | "screenshot";
  /** v3：手机用户主动点断连按钮成功后回调，App 切到 user-disconnected 状态 */
  onUserDisconnect?: () => void;
};

type WifiStatus = "connected" | "reconnecting" | "disconnected";
type PageMode = "chat" | "touchpad" | "keyboard";

export default function ChatPage({
  client,
  initialMessages,
  initialMode,
  demoTouchpadSettings = false,
  demoKeyboardTab = "dpad",
  onUserDisconnect,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages ?? []);
  const [wifi, setWifi] = useState<WifiStatus>("connected");
  const [imageError, setImageError] = useState<string | null>(null);
  const [mode, setMode] = useState<PageMode>(initialMode ?? "chat");
  const [disconnecting, setDisconnecting] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  async function handleDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      // 不管 ack 成功失败都通知上层切到 user-disconnected：
      //   - 成功：server 已清绑定 + 关 socket，桌面也即时刷新
      //   - 失败（超时 / 未握手）：本地切断连状态，让用户重新扫码即可
      await client.bye();
    } finally {
      client.disconnect();
      onUserDisconnect?.();
    }
  }

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!imageError) return;
    const id = window.setTimeout(() => setImageError(null), 3000);
    return () => window.clearTimeout(id);
  }, [imageError]);

  useEffect(() => {
    setWifi("connected");
  }, []);

  // 订阅服务端下行消息（如 /help 帮助文本），渲染为左对齐 bot 气泡
  useEffect(() => {
    const off = client.onServerMessage(({ text, ts }) => {
      setMessages((prev) => [
        ...prev,
        {
          clientMessageId: `srv-${ts}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "text",
          text,
          status: "delivered",
          incoming: true,
        },
      ]);
    });
    return off;
  }, [client]);

  async function sendTextMsg(text: string, submit = false) {
    const cmId = newClientMessageId();
    const msg: ChatMessage = {
      clientMessageId: cmId,
      kind: "text",
      text,
      status: "sending",
    };
    setMessages((prev) => [...prev, msg]);
    const ack = await client.sendText(cmId, text, submit);
    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === cmId
          ? { ...m, status: ack.success ? "delivered" : "failed", reason: ack.success ? undefined : ack.reason }
          : m,
      ),
    );
  }

  async function sendTextAndEnter(text: string) {
    // submit=true → 后端注入文本后直接按 submit_config 配置的组合键提交
    // 不再硬编码 sendKey("Enter")，避免与桌面端配置的「提交键」不一致
    await sendTextMsg(text, true);
  }

  async function sendImageMsg(compressed: CompressResult, previewUrl: string) {
    const cmId = newClientMessageId();
    const msg: ChatMessage = {
      clientMessageId: cmId,
      kind: "image",
      imagePreviewUrl: previewUrl,
      status: "sending",
    };
    setMessages((prev) => [...prev, msg]);
    const ack = await client.sendImage(cmId, compressed.base64, compressed.mime);
    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === cmId
          ? { ...m, status: ack.success ? "delivered" : "failed", reason: ack.success ? undefined : ack.reason }
          : m,
      ),
    );
  }

  const empty = useMemo(() => messages.length === 0, [messages]);

  const TABS: { mode: PageMode; label: string }[] = [
    { mode: "chat",     label: t("monitor.modeChat") },
    { mode: "touchpad", label: t("monitor.modeTouchpad") },
    { mode: "keyboard", label: t("monitor.modeKeyboard") },
  ];

  return (
    <main className="h-[100dvh] flex flex-col safe-area-top" style={{ background: "var(--tb-bg)" }}>
      {/* ── Header (tabs) ─────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center px-4 py-2 border-b"
        style={{
          background: "var(--tb-surface)",
          borderColor: "var(--tb-border)",
          boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
        }}
      >
        {/* Connection indicator (dot + disconnect button)
            v4：去掉外层胶囊，绿点 + 红色断连按钮直接并排，不再套娃。
            未连接态只显示灰点。 */}
        <div className="shrink-0 flex items-center">
          {wifi === "connected" ? (
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: "var(--tb-success)",
                  boxShadow:
                    "0 0 0 3px rgba(34, 197, 94, 0.2), 0 0 8px rgba(34, 197, 94, 0.3)",
                  animation: "pulse-dot 2s ease-in-out infinite",
                }}
              />
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                aria-label={t("chat.disconnectAriaLabel")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium select-none transition-opacity"
                style={{
                  background: "rgba(239, 68, 68, 0.10)",
                  color: "var(--tb-danger)",
                  opacity: disconnecting ? 0.5 : 1,
                  border: "none",
                }}
              >
                <LogOut size={11} strokeWidth={2.5} />
                <span>{t("chat.disconnect")}</span>
              </button>
            </div>
          ) : (
            <div className="w-7 flex items-center">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: "var(--tb-muted)" }}
              />
            </div>
          )}
        </div>

        {/* Pill tab switcher */}
        <div className="flex-1 flex justify-center">
          <div
            className="flex rounded-full p-0.5"
            style={{ background: "var(--tb-bg)" }}
          >
            {TABS.map(({ mode: m, label }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="px-5 py-1.5 rounded-full text-[14px] font-semibold select-none"
                style={{
                  background: mode === m ? "#ffffff" : "transparent",
                  color: mode === m ? "var(--tb-accent)" : "var(--tb-muted)",
                  boxShadow: mode === m
                    ? "0 1px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(249,115,22,0.2)"
                    : "none",
                  transition: "background 150ms ease, color 150ms ease, box-shadow 150ms ease",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Right spacer */}
        <div className="w-7 shrink-0" />
      </header>

      {/* ── Chat mode ─────────────────────────────────────── */}
      {mode === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-3">
            {empty && (
              <div className="h-full flex flex-col items-center justify-center pb-20 gap-2">
                <img
                  src="/logo.png"
                  srcSet="/logo@2x.png 2x"
                  alt=""
                  width={52}
                  height={52}
                  className="rounded-xl"
                  style={{ opacity: 0.88 }}
                />
                <p className="text-[16px] font-semibold mt-1" style={{ color: "var(--tb-text)" }}>
                  TypeBridge WebChat
                </p>
                <p
                  className="text-[12px] text-center leading-relaxed px-10"
                  style={{ color: "var(--tb-muted)" }}
                >
                  {t("chat.emptyHint")}
                </p>
                <p
                  className="text-[11px] text-center leading-relaxed px-10 mt-1"
                  style={{ color: "var(--tb-muted)", opacity: 0.75 }}
                >
                  {t("chat.emptyHintQuick")}
                </p>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.clientMessageId} msg={m} />
            ))}
            <div ref={listEndRef} />
          </div>

          {imageError && (
            <div
              className="mx-3 mb-2 px-3 py-2 rounded-lg text-[12px]"
              style={{
                background: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
                color: "var(--tb-danger)",
              }}
            >
              {imageError}
            </div>
          )}

          <ComposerBar
            onSendText={sendTextMsg}
            onSendTextAndEnter={sendTextAndEnter}
            onSendImage={sendImageMsg}
            onImageError={setImageError}
            disabled={wifi === "disconnected"}
          />
        </>
      )}

      {/* ── Touchpad mode ─────────────────────────────────── */}
      {mode === "touchpad" && (
        <TouchPad
          client={client}
          disabled={wifi === "disconnected"}
          initialShowSettings={demoTouchpadSettings}
        />
      )}

      {/* ── Keyboard (QuickCommands) mode ─────────────────── */}
      {mode === "keyboard" && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <QuickCommands
            client={client}
            disabled={wifi === "disconnected"}
            initialTab={demoKeyboardTab}
          />
        </div>
      )}
    </main>
  );
}
