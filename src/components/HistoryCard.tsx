import {
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  RotateCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
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
        <div className="flex items-start gap-1.5 text-[11.5px] font-mono mb-2" style={{ color: "var(--accent)" }}>
          <AlertCircle size={12} strokeWidth={1.75} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-sans">本地注入失败：</span>
            {message.failure_reason}
          </span>
        </div>
      )}

      {message.feedback_error && <FeedbackBanner err={message.feedback_error} />}

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

/// 机器人向飞书发表情 / thread 回复被拒时的提示，独立于注入状态。
function FeedbackBanner({ err }: { err: NonNullable<HistoryMessage["feedback_error"]> }) {
  const title =
    err.kind === "reply" ? "机器人回复被拒" : err.kind === "reaction" ? "机器人表情被拒" : "机器人回调被拒";

  async function openHelp() {
    if (!err.help_url) return;
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(err.help_url).catch(() => {});
  }

  return (
    <div
      className="flex items-start gap-2 rounded-md px-2.5 py-2 text-[11.5px] leading-relaxed mb-2"
      style={{
        background: "rgba(220, 38, 38, 0.08)",
        border: "1px solid rgba(220, 38, 38, 0.25)",
      }}
    >
      <ShieldAlert size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-error" />
      <div className="flex-1 min-w-0">
        <div className="text-error font-medium mb-0.5">
          {title}
          <span className="ml-1.5 text-subtle font-mono text-[10.5px]">code={err.code}</span>
        </div>
        <div className="text-muted font-mono break-all">{err.msg}</div>
        {err.help_url && (
          <button
            onClick={openHelp}
            className="mt-1 inline-flex items-center gap-1 text-accent hover:underline text-[11.5px]"
          >
            去飞书后台开通权限
            <ExternalLink size={10} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
