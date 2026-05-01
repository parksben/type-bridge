import { Image as ImageIcon, RotateCw, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { HistoryMessage } from "../store";
import StatusTag from "./StatusTag";

interface Props {
  message: HistoryMessage;
  imagesBaseDir: string;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

function formatRelative(ts: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (delta < 10) return "刚刚";
  if (delta < 60) return `${delta} 秒前`;
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} 小时前`;
  const d = new Date(ts * 1000);
  const today = new Date();
  const isSameYear = d.getFullYear() === today.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return isSameYear ? `${m}-${day} ${hh}:${mm}` : `${d.getFullYear()}-${m}-${day}`;
}

export default function HistoryCard({ message, imagesBaseDir, onDelete, onRetry }: Props) {
  const canRetry = message.status === "sent" || message.status === "failed";
  const hasLeftRail = message.status === "failed";
  const imageUrl = message.image_path ? convertFileSrc(`${imagesBaseDir}/${message.image_path}`) : null;

  return (
    <div
      className="relative rounded-[10px] px-4 py-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {hasLeftRail && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-sm bg-error"
          aria-hidden
        />
      )}

      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted font-mono">
          <span className="text-text font-medium">@{message.sender || "unknown"}</span>
          <span>·</span>
          <span>{formatRelative(message.received_at)}</span>
        </div>
        <StatusTag status={message.status} />
      </div>

      {message.text && (
        <div className="text-[13px] text-text leading-relaxed break-all whitespace-pre-wrap mb-2">
          {message.text}
        </div>
      )}

      {imageUrl && (
        <div className="mb-2 flex items-center gap-2">
          <img
            src={imageUrl}
            alt="attachment"
            className="max-w-[160px] max-h-[120px] rounded-md border border-border object-contain"
            style={{ background: "var(--surface)" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="flex items-center gap-1 text-[11px] text-subtle font-mono">
            <ImageIcon size={11} strokeWidth={1.75} />
            image
          </span>
        </div>
      )}

      {message.status === "failed" && message.failure_reason && (
        <div className="text-[11.5px] text-error font-mono mb-2">
          原因：{message.failure_reason}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {canRetry && (
          <button
            onClick={() => onRetry(message.id)}
            className="tb-btn-ghost flex items-center gap-1"
          >
            <RotateCw size={11} strokeWidth={1.75} />
            重发
          </button>
        )}
        <button
          onClick={() => onDelete(message.id)}
          className="tb-btn-ghost flex items-center gap-1"
        >
          <Trash2 size={11} strokeWidth={1.75} />
          删除
        </button>
      </div>
    </div>
  );
}
