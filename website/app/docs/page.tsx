import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使用文档 — TypeBridge",
  description:
    "TypeBridge 使用文档中心。包含飞书、钉钉、企业微信三大渠道的接入教程，手把手教你完成机器人配置。",
};

import {
  BookOpen,
  ArrowRight,
  MessageSquareText,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

export default function DocsPage() {
  return (
    <div className="min-h-screen noise-bg pt-16">
      <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--tb-muted)] mb-8">
          <a href="/" className="hover:text-[var(--tb-text)] transition-colors">
            首页
          </a>
          <span>/</span>
          <span className="text-[var(--tb-text)] font-medium">使用文档</span>
        </div>

        {/* Header */}
        <div className="mb-14">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            使用
            <span className="font-brand text-[var(--tb-accent)]">文档</span>
          </h1>
          <p className="text-[var(--tb-muted)] text-lg leading-relaxed max-w-2xl">
            TypeBridge 支持飞书、钉钉、企业微信三大主流 IM
            平台。选择你使用的渠道，按照教程完成机器人配置，即可让消息直达桌面输入框。
          </p>
        </div>

        {/* Channel cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Feishu */}
          <a
            href="/docs/feishu"
            className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 feature-card-glow"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <MessageSquareText
                size={20}
                className="text-blue-600 dark:text-blue-400"
              />
            </div>
            <h2 className="font-semibold text-[17px] mb-2 group-hover:text-[var(--tb-accent)] transition-colors">
              飞书接入指南
            </h2>
            <p className="text-sm text-[var(--tb-muted)] leading-relaxed mb-4">
              创建飞书自建应用，获取 App ID 和 App
              Secret，开启长连接接收消息事件，填入 TypeBridge 完成接入。
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--tb-accent)]">
              开始教程 <ArrowRight size={13} />
            </div>
          </a>

          {/* DingTalk */}
          <a
            href="/docs/dingtalk"
            className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 feature-card-glow"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <MessageSquareText
                size={20}
                className="text-sky-600 dark:text-sky-400"
              />
            </div>
            <h2 className="font-semibold text-[17px] mb-2 group-hover:text-[var(--tb-accent)] transition-colors">
              钉钉接入指南
            </h2>
            <p className="text-sm text-[var(--tb-muted)] leading-relaxed mb-4">
              在钉钉开放平台创建企业内部应用，获取 AppKey 和
              AppSecret，配置机器人消息接收后填入 TypeBridge。
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--tb-accent)]">
              开始教程 <ArrowRight size={13} />
            </div>
          </a>

          {/* WeCom */}
          <a
            href="/docs/wecom"
            className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 feature-card-glow"
          >
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <MessageSquareText
                size={20}
                className="text-green-600 dark:text-green-400"
              />
            </div>
            <h2 className="font-semibold text-[17px] mb-2 group-hover:text-[var(--tb-accent)] transition-colors">
              企业微信接入指南
            </h2>
            <p className="text-sm text-[var(--tb-muted)] leading-relaxed mb-4">
              在企业微信管理后台创建自建应用，获取 Corp ID、Agent ID 和
              Secret，配置回调消息接收后填入 TypeBridge。
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--tb-accent)]">
              开始教程 <ArrowRight size={13} />
            </div>
          </a>
        </div>

        {/* Back to home */}
        <div className="mt-12 pt-8 border-t border-[var(--tb-border)]">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
          >
            <ArrowLeft size={15} />
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}
