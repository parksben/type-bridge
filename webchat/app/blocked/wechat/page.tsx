import { ExternalLink, MessageCircle, MoreHorizontal } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "请在外部浏览器打开 — TypeBridge WebChat",
};

export default function BlockedWeChatPage() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center">
        <div className="relative inline-flex mb-6">
          <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--tb-accent)_12%,transparent)] flex items-center justify-center">
            <MessageCircle
              size={36}
              className="text-[var(--tb-muted)]"
              strokeWidth={1.5}
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[var(--tb-accent)] flex items-center justify-center shadow-lg">
            <ExternalLink size={18} className="text-white" strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="text-2xl font-semibold mb-3 tracking-tight">
          请在外部浏览器打开
        </h1>

        <p className="text-[var(--tb-muted)] text-[15px] leading-relaxed mb-6">
          IM 内置浏览器（微信 / 钉钉 / 飞书 / QQ）屏蔽了
          <strong className="text-[var(--tb-text)]"> Web Speech API</strong>
          ，无法使用语音输入功能，只能用打字 / 拍照。
          <br />
          为了完整体验，请改用外部浏览器打开。
        </p>

        <div
          className="rounded-xl p-5 text-left text-sm mb-4"
          style={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <p className="font-medium text-[var(--tb-text)]">操作步骤</p>
          </div>
          <ol className="list-decimal pl-5 space-y-2 text-[var(--tb-muted)]">
            <li className="flex items-start gap-2 list-none -ml-5 pl-0">
              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-[var(--tb-accent)] text-white text-xs font-semibold shrink-0 mt-0.5">
                1
              </span>
              <span>
                点击右上角的
                <span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-[var(--tb-bg)] border border-[var(--tb-border)] align-middle">
                  <MoreHorizontal size={12} strokeWidth={2.5} />
                </span>
                菜单
              </span>
            </li>
            <li className="flex items-start gap-2 list-none -ml-5 pl-0">
              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-[var(--tb-accent)] text-white text-xs font-semibold shrink-0 mt-0.5">
                2
              </span>
              <span>
                选择「在浏览器打开」（iOS Safari / Android Chrome）
              </span>
            </li>
            <li className="flex items-start gap-2 list-none -ml-5 pl-0">
              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-[var(--tb-accent)] text-white text-xs font-semibold shrink-0 mt-0.5">
                3
              </span>
              <span>在外部浏览器中重新打开此页面</span>
            </li>
          </ol>
        </div>

        <p className="text-xs text-[var(--tb-muted)] mt-6">
          只是想发文字 / 图片？将链接长按复制到浏览器也可以。
        </p>
      </div>
    </main>
  );
}
