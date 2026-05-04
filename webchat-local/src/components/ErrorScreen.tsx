import { AlertCircle, QrCode } from "lucide-react";

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

const TITLE: Record<Reason, string> = {
  "no-session": "请用桌面 App 扫码",
  "otp-locked": "验证码已锁定",
  "session-expired": "会话已过期",
  "server-closed": "桌面已关闭 WebChat",
  unknown: "出错了",
};

const BODY: Record<Reason, string> = {
  "no-session":
    "当前链接没有会话信息。请在 Mac 打开 TypeBridge，进入「连接IM应用 → WebChat」，点「启动会话」后用这台手机扫描桌面上的二维码。",
  "otp-locked":
    "验证码错误次数过多，会话已锁定。请在桌面 TypeBridge 上点「重启会话」生成新的验证码。",
  "session-expired":
    "5 分钟内未完成握手，会话已过期。请在桌面 TypeBridge 上点「重启会话」生成新的二维码。",
  "server-closed":
    "桌面 TypeBridge 已关闭 WebChat 或应用已退出。请在桌面重新「启动会话」后再扫码。",
  unknown: "会话状态异常，请在桌面重新启动 WebChat 会话。",
};

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
          {TITLE[reason]}
        </h1>
        <p className="text-[13.5px] text-[var(--tb-muted)] leading-relaxed">
          {BODY[reason]}
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
