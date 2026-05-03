"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ComposerBar from "./ComposerBar";
import {
  pollAcks,
  sendImage,
  sendText,
  RelayError,
} from "@/app/lib/relay";
import type { CompressResult } from "@/app/lib/image";

type Status = "pending" | "sent" | "injected" | "failed";

export type LocalMessage = {
  clientMessageId: string;
  /** 服务端分配，sent 之后才有 */
  messageId?: string;
  kind: "text" | "image";
  text?: string;
  image?: { data: string; mime: string };
  ts: number;
  status: Status;
  failReason?: string;
};

type Props = {
  sessionId: string;
  userToken: string;
  onSessionLost: () => void;
};

export default function ChatPage({ sessionId, userToken, onSessionLost }: Props) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [online, setOnline] = useState(true);
  const sinceRef = useRef<number>(0);
  const ackPollRef = useRef<boolean>(true);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  // 自动滚到底
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // ack 长轮询
  useEffect(() => {
    ackPollRef.current = true;
    let cancelled = false;

    async function loop() {
      while (ackPollRef.current && !cancelled) {
        try {
          const r = await pollAcks(sessionId, userToken, sinceRef.current);
          if (cancelled) break;
          setOnline(true);
          if (r && r.acks.length > 0) {
            const updates = new Map<string, { success: boolean; reason?: string; at: number }>();
            for (const a of r.acks) {
              if (a.at > sinceRef.current) sinceRef.current = a.at;
              updates.set(a.clientMessageId, {
                success: a.success,
                reason: a.reason,
                at: a.at,
              });
            }
            setMessages((prev) =>
              prev.map((m) => {
                const u = updates.get(m.clientMessageId);
                if (!u) return m;
                return {
                  ...m,
                  status: u.success ? "injected" : "failed",
                  failReason: u.reason,
                };
              }),
            );
          }
        } catch (err) {
          const e = err as RelayError;
          if (e.code === "EXPIRED" || e.code === "OWNER_LOST" || e.code === "NOT_FOUND") {
            onSessionLost();
            return;
          }
          if (e.code === "BAD_TOKEN") {
            onSessionLost();
            return;
          }
          setOnline(false);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    loop();
    return () => {
      cancelled = true;
      ackPollRef.current = false;
    };
  }, [sessionId, userToken, onSessionLost]);

  function appendLocal(m: LocalMessage) {
    setMessages((prev) => [...prev, m]);
  }

  function markSent(clientMessageId: string, messageId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === clientMessageId ? { ...m, messageId, status: "sent" as Status } : m,
      ),
    );
  }

  function markFailed(clientMessageId: string, reason: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === clientMessageId ? { ...m, status: "failed" as Status, failReason: reason } : m,
      ),
    );
  }

  async function sendTextMsg(text: string) {
    const cid = crypto.randomUUID();
    appendLocal({
      clientMessageId: cid,
      kind: "text",
      text,
      ts: Date.now(),
      status: "pending",
    });
    try {
      const r = await sendText(sessionId, userToken, cid, text);
      markSent(cid, r.messageId);
    } catch (err) {
      const e = err as RelayError;
      if (e.code === "EXPIRED" || e.code === "OWNER_LOST") {
        onSessionLost();
        return;
      }
      markFailed(cid, e.message);
    }
  }

  async function sendImageMsg(img: CompressResult) {
    const cid = crypto.randomUUID();
    appendLocal({
      clientMessageId: cid,
      kind: "image",
      image: { data: img.data, mime: img.mime },
      ts: Date.now(),
      status: "pending",
    });
    try {
      const r = await sendImage(sessionId, userToken, cid, {
        data: img.data,
        mime: img.mime,
      });
      markSent(cid, r.messageId);
    } catch (err) {
      const e = err as RelayError;
      if (e.code === "EXPIRED" || e.code === "OWNER_LOST") {
        onSessionLost();
        return;
      }
      markFailed(cid, e.message);
    }
  }

  return (
    <main
      className="flex flex-col"
      style={{
        height: "100dvh",
        background: "var(--tb-bg)",
      }}
    >
      {/* Header */}
      <header
        className="safe-area-top"
        style={{
          background: "var(--tb-surface)",
          borderBottom: "1px solid var(--tb-border)",
          boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
        }}
      >
        <div className="px-4 py-2.5 flex items-center gap-3">
          {/* Logo */}
          <div
            className="shrink-0 w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center"
            style={{
              background: "var(--tb-bg)",
              border: "1px solid var(--tb-border)",
            }}
          >
            <img
              src="/logo.png"
              alt="TypeBridge"
              width={30}
              height={30}
              className="object-contain"
            />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-semibold tracking-tight text-[var(--tb-text)] leading-tight">
                TypeBridge
              </span>
              <span
                className="text-[10px] font-medium px-1.5 py-[1px] rounded"
                style={{
                  background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)",
                  color: "var(--tb-accent)",
                }}
              >
                WebChat
              </span>
            </div>
            <p className="text-[11px] text-[var(--tb-muted)] mt-0.5 truncate">
              消息实时注入桌面当前聚焦的输入框
            </p>
          </div>

          {/* Status pill */}
          <div
            className="shrink-0 flex items-center gap-1 px-2 py-[5px] rounded-full text-[10.5px] font-medium"
            style={{
              background: online
                ? "color-mix(in srgb, var(--tb-success) 14%, transparent)"
                : "var(--tb-bg)",
              color: online ? "var(--tb-success)" : "var(--tb-muted)",
              border: online
                ? "1px solid color-mix(in srgb, var(--tb-success) 25%, transparent)"
                : "1px solid var(--tb-border)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: online ? "var(--tb-success)" : "var(--tb-muted)",
                animation: online ? "pulse-dot 2s ease-in-out infinite" : undefined,
              }}
            />
            {online ? "已连接" : "重连中"}
          </div>
        </div>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-none">
        {messages.length === 0 && (
          <div className="text-center text-[13px] text-[var(--tb-muted)] mt-12 leading-relaxed px-6">
            发出去的每一条消息会自动写入你 Mac 桌面
            <br />
            当前聚焦的输入框。
            <br />
            <br />
            可以试试发一条文本，或者用语音 / 图片。
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.clientMessageId} msg={m} />
        ))}
        <div ref={listEndRef} />
      </div>

      {/* Composer */}
      <ComposerBar onSendText={sendTextMsg} onSendImage={sendImageMsg} />
    </main>
  );
}
