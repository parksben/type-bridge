import { AlertCircle, QrCode } from "lucide-react";
import { t } from "@/i18n";

type Reason =
  | "no-session"
  | "otp-locked"
  | "session-expired"
  | "server-closed"
  | "unknown";

type Props = {
  reason: Reason;
  detail?: string;
};

function titleOf(r: Reason): string {
  switch (r) {
    case "no-session": return t("error.titleNoSession");
    case "otp-locked": return t("error.titleOtpLocked");
    case "session-expired": return t("error.titleSessionExpired");
    case "server-closed": return t("error.titleServerClosed");
    default: return t("error.titleUnknown");
  }
}

function bodyOf(r: Reason): string {
  switch (r) {
    case "no-session": return t("error.bodyNoSession");
    case "otp-locked": return t("error.bodyOtpLocked");
    case "session-expired": return t("error.bodySessionExpired");
    case "server-closed": return t("error.bodyServerClosed");
    default: return t("error.bodyUnknown");
  }
}

export default function ErrorScreen({ reason, detail }: Props) {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5"
          style={{
            background:
              reason === "no-session"
                ? "var(--tb-accent-soft)"
                : "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
          }}
        >
          {reason === "no-session" ? (
            <QrCode size={28} strokeWidth={1.8} className="text-[var(--tb-accent)]" />
          ) : (
            <AlertCircle size={28} strokeWidth={1.8} className="text-[var(--tb-danger)]" />
          )}
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
