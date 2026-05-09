import { useEffect, useMemo, useRef, useState } from "react";
import ComposerBar from "./ComposerBar";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import TouchPad from "./TouchPad";
import { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import type { CompressResult } from "@/lib/image";
import { t } from "@/i18n";

type Props = {
  client: WebChatClient;
};

type WifiStatus = "connected" | "reconnecting" | "disconnected";
type PageMode = "chat" | "touchpad";

export default function ChatPage({ client }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wifi, setWifi] = useState<WifiStatus>("connected");
  const [imageError, setImageError] = useState<string | null>(null);
  const [mode, setMode] = useState<PageMode>("chat");
  const listEndRef = useRef<HTMLDivElement | null>(null);

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
          ? { ...m, status: ack.success ? "delivered" : "failed", reason: ack.success ? undefined : ack.reason }
          : m,
      ),
    );
  }

  async function sendTextAndEnter(text: string) {
    await sendTextMsg(text);
    await new Promise<void>((r) => setTimeout(r, 80));
    await client.sendKey(newClientMessageId(), "Enter");
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
  ];

  return (
    <main className="h-[100dvh] flex flex-col safe-area-top" style={{ background: "var(--tb-bg)" }}>
      {/* ── Header (tabs) ─────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center px-4 py-2 border-b"
        style={{ background: "var(--tb-surface)", borderColor: "var(--tb-border)" }}
      >
        {/* Connection dot */}
        <div className="w-7 flex items-center shrink-0">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: wifi === "connected" ? "var(--tb-success)" : "var(--tb-muted)",
              boxShadow:
                wifi === "connected"
                  ? "0 0 0 3px color-mix(in srgb, var(--tb-success) 20%, transparent)"
                  : "none",
              animation: wifi === "connected" ? "pulse-dot 2s ease-in-out infinite" : undefined,
            }}
          />
        </div>

        {/* Pill tab switcher */}
        <div className="flex-1 flex justify-center">
          <div
            className="flex rounded-full p-0.5"
            style={{ background: "color-mix(in srgb, var(--tb-border) 60%, transparent)" }}
          >
            {TABS.map(({ mode: m, label }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="px-5 py-1.5 rounded-full text-[14px] font-semibold transition-all"
                style={{
                  background: mode === m ? "var(--tb-surface)" : "transparent",
                  color: mode === m ? "var(--tb-text)" : "var(--tb-muted)",
                  boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
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
        <TouchPad client={client} disabled={wifi === "disconnected"} />
      )}
    </main>
  );
}
