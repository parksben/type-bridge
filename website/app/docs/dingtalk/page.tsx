import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "钉钉接入指南 — TypeBridge",
  description:
    "手把手教你在钉钉开放平台创建企业内部应用，获取 AppKey 和 AppSecret，配置机器人消息接收，完成 TypeBridge 钉钉渠道接入。",
};

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import {
  StepSection,
  StepDetail,
  ScreenshotPlaceholder,
  InfoBox,
  DoneBox,
} from "../steps";

export default function DingTalkGuidePage() {
  return (
    <div className="min-h-screen noise-bg">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--tb-muted)] mb-8">
        <a href="/" className="hover:text-[var(--tb-text)] transition-colors">
          首页
        </a>
        <span>/</span>
        <a
          href="/docs"
          className="hover:text-[var(--tb-text)] transition-colors"
        >
          使用文档
        </a>
        <span>/</span>
        <span className="text-[var(--tb-text)] font-medium">钉钉接入指南</span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900/50 mb-4">
          钉钉 · 企业内部应用
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          钉钉接入
          <span className="text-[var(--tb-accent)] font-bold">指南</span>
        </h1>
        <p className="text-[var(--tb-muted)] text-lg leading-relaxed">
          TypeBridge 通过钉钉企业内部应用的长连接（Stream
          Mode）接收消息。按以下步骤操作，约 15 分钟即可完成配置。
        </p>
      </div>

      {/* Prerequisites */}
      <div className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 mb-10">
        <div className="flex items-start gap-3">
          <AlertCircle
            size={18}
            className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
              前置条件
            </p>
            <ul className="text-sm text-amber-700 dark:text-amber-400/80 space-y-1">
              <li>拥有一个钉钉企业/团队账号（管理员权限）</li>
              <li>已安装 TypeBridge macOS 客户端</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step 1 */}
      <StepSection number={1} title="登录钉钉开放平台" duration="约 2 分钟" anchorId="step-login">
        <StepDetail>
          <p>
            前往
            <a
              href="https://open.dingtalk.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--tb-accent)] hover:underline mx-1"
            >
              钉钉开放平台
              <ExternalLink size={12} />
            </a>
            ，使用钉钉企业管理员账号登录。
          </p>
          <ScreenshotPlaceholder description="钉钉开放平台首页，登录入口" />
        </StepDetail>
      </StepSection>

      {/* Step 2 */}
      <StepSection number={2} title="创建企业内部应用" duration="约 5 分钟" anchorId="step-create-app">
        <StepDetail>
          <p>
            登录后进入「应用开发」→「企业内部应用」，参考
            <a
              href="https://open.dingtalk.com/document/orgapp/overview-of-organizational-applications"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--tb-accent)] hover:underline mx-1"
            >
              钉钉企业内部应用开发指南
              <ExternalLink size={12} />
            </a>
            。
          </p>
        </StepDetail>

        <StepDetail title="点击「创建应用」">
          <p>填写应用名称（如 TypeBridge）、应用描述、上传应用图标，选择开发模式为「企业内部应用」，点击确定创建。</p>
          <ScreenshotPlaceholder description="钉钉创建企业内部应用表单" />
        </StepDetail>

        <StepDetail title="记录应用凭据">
          <p>创建完成后，在应用详情页中找到并保存以下凭据：</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)]">
            <li>
              <strong>AppKey</strong>（Client ID）
            </li>
            <li>
              <strong>AppSecret</strong>（Client Secret，需点击查看后复制）
            </li>
          </ul>
          <ScreenshotPlaceholder description="钉钉应用详情页，圈出 AppKey 和 AppSecret" />
          <InfoBox>
            这两个凭据需要在 TypeBridge 配置窗口中填写。不要泄露给任何人。
          </InfoBox>
        </StepDetail>
      </StepSection>

      {/* Step 3 */}
      <StepSection number={3} title="配置机器人消息接收" duration="约 5 分钟" anchorId="step-configure-bot">
        <StepDetail>
          <p>在应用详情页左侧导航中，找到「机器人」模块。</p>
        </StepDetail>

        <StepDetail title="开启机器人能力">
          <p>如果尚未开启，点击「开启」按钮激活机器人功能。设置机器人名称、头像等基本信息。</p>
          <ScreenshotPlaceholder description="钉钉机器人开启配置页面" />
        </StepDetail>

        <StepDetail title="配置消息接收模式">
          <p>
            TypeBridge 使用钉钉的 Stream Mode（长连接）接收消息，无需你配置公网回调地址。
            在消息接收模式中选择适合长连接的方式（具体选项名称以钉钉平台最新 UI 为准）。
          </p>
          <ScreenshotPlaceholder description="钉钉消息接收模式配置页面" />
        </StepDetail>
      </StepSection>

      {/* Step 4 */}
      <StepSection number={4} title="授权所需权限" duration="约 2 分钟" anchorId="step-permissions">
        <StepDetail>
          <p>在应用详情页中找到权限管理，确保应用拥有以下权限范围：</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)]">
            <li>接收机器人消息</li>
            <li>发送机器人消息</li>
            <li>读取文件/图片资源（用于图片消息下载）</li>
          </ul>
        </StepDetail>
      </StepSection>

      {/* Step 5 */}
      <StepSection number={5} title="填入 TypeBridge 并启动" duration="约 2 分钟" anchorId="step-fill-credentials">
        <StepDetail>
          <p>
            打开 TypeBridge，进入「服务配置 → 连接钉钉 Bot」Tab：
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2 text-[var(--tb-muted)]">
            <li>输入 <strong>AppKey</strong></li>
            <li>输入 <strong>AppSecret</strong></li>
            <li>点击「启动长连接」按钮</li>
            <li>等待状态显示「已连接」</li>
          </ol>
        </StepDetail>
      </StepSection>

      {/* Done */}
      <DoneBox />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-8 border-t border-[var(--tb-border)]">
        <a
          href="/docs/feishu"
          className="inline-flex items-center gap-2 text-sm text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
        >
          <ArrowLeft size={15} />
          飞书接入指南
        </a>
        <a
          href="/docs/wecom"
          className="inline-flex items-center gap-2 text-sm text-[var(--tb-accent)] hover:underline transition-colors font-medium"
        >
          企业微信接入指南
          <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
