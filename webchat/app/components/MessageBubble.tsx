"use client";

import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import type { LocalMessage } from "./ChatPage";

type Props = { msg: LocalMessage };

const STATUS_TEXT: Record<LocalMessage["status"], string> = {
  pending: "发送中",
  sent: "已收到",
  injected: "已输入",
  failed: "输入失败",
};

export default function MessageBubble({ msg }: Props) {
  const isImage = msg.kind === "image";
  return (
    <div className="flex justify-end mb-3 animate-fade-up">
      <div className="max-w-[78%] flex flex-col items-end">
        <div
          className="rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-sm"
          style={{
            background: "var(--tb-bubble-self)",
            color: "white",
            borderBottomRightRadius: "6px",
            wordBreak: "break-word",
          }}
          data-allow-select
        >
          {msg.kind === "text" ? (
            <span className="whitespace-pre-wrap">{msg.text}</span>
          ) : (
            <img
              src={`data:${msg.image!.mime};base64,${msg.image!.data}`}
              alt="发送的图片"
              className="rounded-lg max-w-full"
              style={{ maxHeight: 240 }}
            />
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 text-[11px]"
             style={{ color: msg.status === "failed" ? "var(--tb-danger)" : "var(--tb-muted)" }}>
          <StatusIcon status={msg.status} />
          <span>
            {STATUS_TEXT[msg.status]}
            {msg.status === "failed" && msg.failReason ? `：${msg.failReason}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: LocalMessage["status"] }) {
  const size = 11;
  switch (status) {
    case "pending":
      return <Clock size={size} strokeWidth={2.2} />;
    case "sent":
      return <Check size={size} strokeWidth={2.5} />;
    case "injected":
      return <CheckCheck size={size} strokeWidth={2.5} />;
    case "failed":
      return <AlertCircle size={size} strokeWidth={2.2} />;
  }
}
