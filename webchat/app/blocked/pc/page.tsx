import { Smartphone, Monitor } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "请用手机访问 — TypeBridge WebChat",
};

export default function BlockedPCPage() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center">
        <div className="relative inline-flex mb-6">
          <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--tb-accent)_12%,transparent)] flex items-center justify-center">
            <Monitor
              size={36}
              className="text-[var(--tb-muted)]"
              strokeWidth={1.5}
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[var(--tb-accent)] flex items-center justify-center shadow-lg">
            <Smartphone size={20} className="text-white" strokeWidth={2} />
          </div>
        </div>

        <h1 className="text-2xl font-semibold mb-3 tracking-tight">
          请用手机访问
        </h1>

        <p className="text-[var(--tb-muted)] text-[15px] leading-relaxed mb-8">
          TypeBridge WebChat 是一个 <strong className="text-[var(--tb-text)]">手机端</strong>
          输入桥 —— 你的桌面 App 已经在等待手机扫码连接，PC 自己给自己发消息没有意义。
        </p>

        <div
          className="rounded-xl p-5 text-left text-sm"
          style={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
          }}
        >
          <p className="font-medium mb-2 text-[var(--tb-text)]">使用方式</p>
          <ol className="list-decimal pl-5 space-y-1.5 text-[var(--tb-muted)]">
            <li>在 Mac 上启动 TypeBridge App</li>
            <li>切到 WebChat tab，点「启动会话」</li>
            <li>用手机扫桌面屏幕上的二维码</li>
            <li>输入 6 位 OTP，开始聊天</li>
          </ol>
        </div>

        <p className="mt-8 text-xs text-[var(--tb-muted)]">
          还没装 TypeBridge？前往
          <a
            href="https://typebridge.parksben.xyz"
            className="text-[var(--tb-accent)] underline ml-1"
          >
            官网下载
          </a>
        </p>
      </div>
    </main>
  );
}
