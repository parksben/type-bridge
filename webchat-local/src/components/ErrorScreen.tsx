import { AlertCircle, QrCode, Wifi, ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { t } from "@/i18n";

type Reason =
  | "no-session"
  | "session-not-found"
  | "out-of-lan"
  | "already-bound"
  | "server-closed"
  | "user-disconnected"
  | "unknown";

type Props = {
  reason: Reason;
  detail?: string;
};

function titleOf(r: Reason): string {
  switch (r) {
    case "no-session": return t("error.titleNoSession");
    case "session-not-found": return t("error.titleSessionNotFound");
    case "out-of-lan": return t("error.titleOutOfLan");
    case "already-bound": return t("error.titleAlreadyBound");
    case "server-closed": return t("error.titleServerClosed");
    case "user-disconnected": return t("error.titleUserDisconnected");
    default: return t("error.titleUnknown");
  }
}

function bodyOf(r: Reason): string {
  switch (r) {
    case "no-session": return t("error.bodyNoSession");
    case "session-not-found": return t("error.bodySessionNotFound");
    case "out-of-lan": return t("error.bodyOutOfLan");
    case "already-bound": return t("error.bodyAlreadyBound");
    case "server-closed": return t("error.bodyServerClosed");
    case "user-disconnected": return t("error.bodyUserDisconnected");
    default: return t("error.bodyUnknown");
  }
}

export default function ErrorScreen({ reason, detail }: Props) {
  // 图标 + 配色：no-session/session-not-found 用 QR 提示重扫；out-of-lan 用 WiFi 警告；
  // already-bound 用 Shield；server-closed 用 RefreshCw；其他 fallback AlertCircle。
  const iconSlot = (() => {
    switch (reason) {
      case "no-session":
      case "session-not-found":
        return {
          Icon: QrCode,
          tone: "var(--tb-accent-soft)",
          color: "text-[var(--tb-accent)]",
        };
      case "out-of-lan":
        return {
          Icon: Wifi,
          tone: "color-mix(in srgb, var(--tb-accent) 12%, transparent)",
          color: "text-[var(--tb-accent)]",
        };
      case "already-bound":
        return {
          Icon: ShieldAlert,
          tone: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
          color: "text-[var(--tb-danger)]",
        };
      case "server-closed":
        return {
          Icon: RefreshCw,
          tone: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
          color: "text-[var(--tb-danger)]",
        };
      case "user-disconnected":
        return {
          Icon: LogOut,
          tone: "var(--tb-accent-soft)",
          color: "text-[var(--tb-accent)]",
        };
      default:
        return {
          Icon: AlertCircle,
          tone: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
          color: "text-[var(--tb-danger)]",
        };
    }
  })();
  const { Icon, tone, color } = iconSlot;

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5"
          style={{ background: tone }}
        >
          <Icon size={28} strokeWidth={1.8} className={color} />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight mb-2">
          {titleOf(reason)}
        </h1>
        <p className="text-[13.5px] text-[var(--tb-muted)] leading-relaxed">
          {bodyOf(reason)}
        </p>
        {detail && (
          <p className="text-[12px] text-[var(--tb-subtle)] mt-3 font-mono break-all">
            {detail}
          </p>
        )}
      </div>
    </main>
  );
}
