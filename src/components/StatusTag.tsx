import { CheckCircle2, Clock, Loader, XCircle } from "lucide-react";
import type { MessageStatus } from "../store";
import { t } from "../i18n";

interface Props {
  status: MessageStatus;
}

const CONFIG: Record<
  MessageStatus,
  { labelKey: "status.queued" | "status.processing" | "status.sent" | "status.failed"; className: string; Icon: typeof Clock; spin?: boolean }
> = {
  queued: {
    labelKey: "status.queued",
    className: "text-muted",
    Icon: Clock,
  },
  processing: {
    labelKey: "status.processing",
    className: "text-accent",
    Icon: Loader,
    spin: true,
  },
  sent: {
    labelKey: "status.sent",
    className: "text-success",
    Icon: CheckCircle2,
  },
  failed: {
    labelKey: "status.failed",
    className: "text-error",
    Icon: XCircle,
  },
};

export default function StatusTag({ status }: Props) {
  const { labelKey, className, Icon, spin } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10.5px] uppercase tracking-[0.1em] ${className}`}
      style={{ background: "var(--surface-2)" }}
    >
      <Icon size={11} strokeWidth={1.75} className={spin ? "animate-spin" : ""} />
      {t(labelKey)}
    </span>
  );
}
