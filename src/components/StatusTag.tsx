import { CheckCircle2, Clock, Loader, XCircle } from "lucide-react";
import type { MessageStatus } from "../store";

interface Props {
  status: MessageStatus;
}

const CONFIG: Record<
  MessageStatus,
  { label: string; className: string; Icon: typeof Clock; spin?: boolean }
> = {
  queued: {
    label: "已入队",
    className: "text-muted",
    Icon: Clock,
  },
  processing: {
    label: "处理中",
    className: "text-accent",
    Icon: Loader,
    spin: true,
  },
  sent: {
    label: "已发送",
    className: "text-success",
    Icon: CheckCircle2,
  },
  failed: {
    label: "失败",
    className: "text-error",
    Icon: XCircle,
  },
};

export default function StatusTag({ status }: Props) {
  const { label, className, Icon, spin } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10.5px] uppercase tracking-[0.1em] ${className}`}
      style={{ background: "var(--surface-2)" }}
    >
      <Icon size={11} strokeWidth={1.75} className={spin ? "animate-spin" : ""} />
      {label}
    </span>
  );
}
