"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

type Reason = "expired" | "locked" | "already-bound" | "owner-lost" | "no-session";

const COPY: Record<Reason, { title: string; body: string; cta: string }> = {
  expired: {
    title: "会话已过期",
    body: "5 分钟未握手会话自动作废。请回到桌面端 TypeBridge 点「重启会话」生成新二维码。",
    cta: "重新扫码",
  },
  locked: {
    title: "验证码错误次数过多",
    body: "OTP 已尝试 5 次，本会话被锁定。请回到桌面端 TypeBridge 重启会话。",
    cta: "重新扫码",
  },
  "already-bound": {
    title: "会话已被另一台设备绑定",
    body: "同一个二维码同时只能一台手机连接。如果想换手机，请回到桌面端 TypeBridge 点「重启会话」。",
    cta: "重新扫码",
  },
  "owner-lost": {
    title: "桌面端已断开",
    body: "TypeBridge 桌面端已退出或失去网络。请确认桌面端在运行，并重新扫码。",
    cta: "重新扫码",
  },
  "no-session": {
    title: "找不到会话",
    body: "请用手机相机扫描桌面端 WebChat tab 上的二维码进入。",
    cta: "我知道了",
  },
};

type Props = {
  reason: Reason;
  onRetry?: () => void;
};

export default function ErrorScreen({ reason, onRetry }: Props) {
  const c = COPY[reason];
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center animate-fade-up">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
          style={{
            background: "color-mix(in srgb, var(--tb-danger) 14%, transparent)",
          }}
        >
          <AlertCircle size={28} className="text-[var(--tb-danger)]" strokeWidth={1.75} />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-3">{c.title}</h1>
        <p className="text-[var(--tb-muted)] text-[15px] leading-relaxed mb-8">{c.body}</p>

        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-medium text-white"
            style={{ background: "var(--tb-accent)" }}
          >
            <RotateCcw size={15} strokeWidth={2.2} />
            {c.cta}
          </button>
        )}
      </div>
    </main>
  );
}
