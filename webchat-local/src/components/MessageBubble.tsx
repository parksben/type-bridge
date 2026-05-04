import { AlertCircle, Check, CheckCheck, Loader2 } from "lucide-react";

export type MessageStatus = "sending" | "delivered" | "failed";

export interface ChatMessage {
  clientMessageId: string;
  kind: "text" | "image";
  text?: string;
  imagePreviewUrl?: string; // 本地预览 blob url
  status: MessageStatus;
  reason?: string;
}

type Props = {
  msg: ChatMessage;
};

export default function MessageBubble({ msg }: Props) {
  return (
    <div className="flex flex-col items-end mb-3">
      {msg.kind === "image" && msg.imagePreviewUrl && (
        <div
          className="mb-1 rounded-2xl overflow-hidden"
          style={{
            maxWidth: "70%",
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
          }}
        >
          <img
            src={msg.imagePreviewUrl}
            alt=""
            className="block max-w-full max-h-80 object-contain"
          />
        </div>
      )}

      {msg.kind === "text" && msg.text && (
        <div
          className="px-3.5 py-2 rounded-2xl text-[15px] leading-[1.4] whitespace-pre-wrap break-words"
          style={{
            maxWidth: "75%",
            background: "var(--tb-accent)",
            color: "white",
            borderTopRightRadius: 6,
          }}
          data-allow-select
        >
          {msg.text}
        </div>
      )}

      <span
        className="flex items-center gap-1 mt-1 text-[11px]"
        style={{
          color:
            msg.status === "failed"
              ? "var(--tb-danger)"
              : "var(--tb-muted)",
        }}
      >
        {msg.status === "sending" && (
          <>
            <Loader2 size={10} className="animate-spin" />
            发送中
          </>
        )}
        {msg.status === "delivered" && (
          <>
            <CheckCheck size={11} strokeWidth={2.4} />
            已送达
          </>
        )}
        {msg.status === "failed" && (
          <>
            <AlertCircle size={11} strokeWidth={2.4} />
            {msg.reason ?? "发送失败"}
          </>
        )}
      </span>
    </div>
  );
}

// lint: Check icon 留做备用（未来加"已注入"状态）
export { Check };
