import { useEffect, useMemo, useRef, useState } from "react";
import ComposerBar from "./ComposerBar";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type Props = {
  client: WebChatClient;
};

type WifiStatus = "connected" | "reconnecting" | "disconnected";

export default function ChatPage({ client }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wifi, setWifi] = useState<WifiStatus>("connected");
  const [imageError, setImageError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  // 状态订阅：WebChatClient 构造时已注册 onStatusChange，但我们这里再挂一次
  // 通过 useRef 缓存的 client，无法重新订阅；改用 effect 读取 client.getUserToken()
  // 来判断健康 —— 实际上 socket 状态由外层 App.tsx 已经订阅了。这里只展示，不做业务决策。

  // 自动滚到底
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 图片错误 3s 自动清掉
  useEffect(() => {
    if (!imageError) return;
    const id = window.setTimeout(() => setImageError(null), 3000);
    return () => window.clearTimeout(id);
  }, [imageError]);

  // 由外层 App 传入 status 更好；当前简化：定时 ping 检查连接
  useEffect(() => {
    // 复用 WebChatClient 的 socket.io 心跳即可；此处仅做 UI 占位
    setWifi("connected");
  }, []);

  async function sendTextMsg(text: string) {
    const cmId = newClientMessageId();
    const msg: ChatMessage = {
      clientMessageId: cmId,
      kind: "text",
      text,
      status: "sending",
    };
    setMessages((prev) => [...prev, msg]);
    const ack = await client.sendText(cmId, text);
    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === cmId
          ? {
              ...m,
              status: ack.success ? "delivered" : "failed",
              reason: ack.success ? undefined : ack.reason,
            }
          : m,
      ),
    );
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
          ? {
              ...m,
              status: ack.success ? "delivered" : "failed",
              reason: ack.success ? undefined : ack.reason,
            }
          : m,
      ),
    );
  }

  async function sendKeyPress(code: string) {
    const cmId = newClientMessageId();
    const ack = await client.sendKey(cmId, code);
    if (!ack.success) {
      setImageError(ack.reason ?? t("composer.shortcutSendFailed"));
    }
  }

  const empty = useMemo(() => messages.length === 0, [messages]);

  return (
    <main className="h-[100dvh] flex flex-col safe-area-top" style={{ background: "var(--tb-bg)" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          background: "var(--tb-surface)",
          borderColor: "var(--tb-border)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            srcSet="/logo@2x.png 2x"
            alt=""
            width={32}
            height={32}
            className="rounded-lg"
          />
          <div>
            <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-none">
              TypeBridge
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  background: "var(--tb-accent-soft)",
                  color: "var(--tb-accent)",
                }}
              >
                WebChat
              </span>
            </p>
            <p className="text-[11px] text-[var(--tb-muted)] mt-1">
              {t("chat.headerHint")}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
          style={{
            background:
              wifi === "connected"
                ? "color-mix(in srgb, var(--tb-success) 12%, transparent)"
                : "color-mix(in srgb, var(--tb-muted) 12%, transparent)",
            color: wifi === "connected" ? "var(--tb-success)" : "var(--tb-muted)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: wifi === "connected" ? "var(--tb-success)" : "var(--tb-muted)",
              animation: wifi === "connected" ? "pulse-dot 2s ease-in-out infinite" : undefined,
            }}
          />
          <span>{wifi === "connected" ? t("chat.statusConnected") : t("chat.statusReconnecting")}</span>
        </div>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-3">
        {empty && (
          <div className="text-center text-[13px] text-[var(--tb-muted)] mt-12 leading-relaxed px-6 whitespace-pre-line">
            {t("chat.emptyHint")}
            <br />
            <br />
            {t("chat.emptyHintTry")}
            <br />
            {t("chat.emptyHintVoice")}
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
        onSendImage={sendImageMsg}
        onSendKey={sendKeyPress}
        onImageError={setImageError}
        disabled={wifi === "disconnected"}
      />
    </main>
  );
}
