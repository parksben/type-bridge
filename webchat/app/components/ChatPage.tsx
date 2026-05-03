"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
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
        className="border-b safe-area-top px-4 py-3 flex items-center justify-between"
        style={{
          background: "var(--tb-surface)",
          borderColor: "var(--tb-border)",
        }}
      >
        <div>
          <p className="text-[15px] font-semibold text-[var(--tb-text)] leading-tight">
            TypeBridge
          </p>
          <p className="text-[11px] text-[var(--tb-muted)] mt-0.5">
            消息将注入到桌面当前聚焦的输入框
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: online ? "var(--tb-success)" : "var(--tb-muted)" }}
        >
          {online ? (
            <Wifi size={13} strokeWidth={2.2} />
          ) : (
            <WifiOff size={13} strokeWidth={2.2} />
          )}
          <span>{online ? "已连接" : "重连中"}</span>
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
