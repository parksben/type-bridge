import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "企业微信接入指南 — TypeBridge",
  description:
    "手把手教你在企业微信管理后台创建自建应用，获取 Corp ID、Agent ID 和 Secret，配置回调消息接收，完成 TypeBridge 企业微信渠道接入。",
};

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Info,
} from "lucide-react";

export default function WeComGuidePage() {
  return (
    <div className="min-h-screen noise-bg pt-16">
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
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
          <span className="text-[var(--tb-text)] font-medium">
            企业微信接入指南
          </span>
        </div>

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50 mb-4">
            企业微信 · 自建应用
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            企业微信接入
            <span className="font-brand text-[var(--tb-accent)]">指南</span>
          </h1>
          <p className="text-[var(--tb-muted)] text-lg leading-relaxed">
            TypeBridge
            通过企业微信自建应用的长连接接收消息。按以下步骤操作，约 15
            分钟即可完成配置。
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
                <li>• 拥有一个企业微信企业/团队账号（管理员权限）</li>
                <li>• 已安装 TypeBridge macOS 客户端</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 1 */}
        <StepSection number={1} title="登录企业微信管理后台" duration="约 2 分钟">
          <StepDetail>
            <p>
              前往
              <a
                href="https://work.weixin.qq.com/wework_admin/loginpage_wx"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--tb-accent)] hover:underline mx-1"
              >
                企业微信管理后台
                <ExternalLink size={12} />
              </a>
              ，使用企业微信管理员账号扫码登录。
            </p>
            <ScreenshotPlaceholder description="企业微信管理后台登录页" />
          </StepDetail>
        </StepSection>

        {/* Step 2 */}
        <StepSection number={2} title="创建自建应用" duration="约 5 分钟">
          <StepDetail>
            <p>
              在管理后台中，进入「应用管理」→「自建应用」，参考
              <a
                href="https://developer.work.weixin.qq.com/document/path/90664"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[var(--tb-accent)] hover:underline mx-1"
              >
                企业微信自建应用开发文档
                <ExternalLink size={12} />
              </a>
              。
            </p>
          </StepDetail>

          <StepDetail title="点击「创建应用」">
            <p>填写应用名称（如 TypeBridge），上传应用 Logo，选择应用可见范围（建议选择全员可见或指定部门）。</p>
            <ScreenshotPlaceholder description="企业微信创建自建应用表单" />
          </StepDetail>

          <StepDetail title="记录应用凭据">
            <p>创建完成后，在应用详情页中找到并妥善保存以下凭据：</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)]">
              <li>
                <strong>Corp ID</strong>（企业 ID，在「我的企业」页面中查看）
              </li>
              <li>
                <strong>Agent ID</strong>（应用 AgentId，在应用详情页中查看）
              </li>
              <li>
                <strong>Secret</strong>（应用 Secret，点击查看后复制）
              </li>
            </ul>
            <ScreenshotPlaceholder description="企业微信应用详情页，圈出 Corp ID、Agent ID 和 Secret" />
            <InfoBox>
              这些凭据需要在 TypeBridge 配置窗口中填写。不要泄露给任何人。
            </InfoBox>
          </StepDetail>
        </StepSection>

        {/* Step 3 */}
        <StepSection number={3} title="配置消息回调接收" duration="约 5 分钟">
          <StepDetail>
            <p>在应用详情页中找到「接收消息」区块。</p>
          </StepDetail>

          <StepDetail title="设置回调 URL">
            <p>
              TypeBridge 使用企业微信的长连接模式接收消息。在回调配置中选择适合长连接的方式，
              或按照 TypeBridge 配置窗口中的引导完成相应设置。
            </p>
            <ScreenshotPlaceholder description="企业微信回调 URL 配置页面" />
          </StepDetail>

          <StepDetail title="完成验证">
            <p>
              按照企微后台的提示完成 Token 和 EncodingAESKey
              的配置验证。验证通过后，消息回调通道建立。
            </p>
          </StepDetail>
        </StepSection>

        {/* Step 4 */}
        <StepSection number={4} title="授权所需权限" duration="约 2 分钟">
          <StepDetail>
            <p>在应用详情页中找到权限设置，确保应用拥有以下权限：</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)]">
              <li>接收消息（消息推送）</li>
              <li>发送应用消息</li>
              <li>读取文件/图片资源（用于图片消息下载）</li>
            </ul>
          </StepDetail>
        </StepSection>

        {/* Step 5 */}
        <StepSection number={5} title="填入 TypeBridge 并启动" duration="约 2 分钟">
          <StepDetail>
            <p>
              打开 TypeBridge，进入「服务配置 → 连接企微 Bot」Tab：
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2 text-[var(--tb-muted)]">
              <li>输入 <strong>Corp ID</strong></li>
              <li>输入 <strong>Agent ID</strong></li>
              <li>输入 <strong>Secret</strong></li>
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
            href="/docs/dingtalk"
            className="inline-flex items-center gap-2 text-sm text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
          >
            <ArrowLeft size={15} />
            钉钉接入指南
          </a>
          <a
            href="/docs"
            className="inline-flex items-center gap-2 text-sm text-[var(--tb-accent)] hover:underline transition-colors font-medium"
          >
            返回文档中心
            <ArrowRight size={15} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────

function StepSection({
  number,
  title,
  duration,
  children,
}: {
  number: number;
  title: string;
  duration?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-9 h-9 rounded-xl bg-[var(--tb-accent)] text-white flex items-center justify-center text-sm font-bold shrink-0">
          {number}
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {duration && (
            <span className="text-xs text-[var(--tb-muted)]">{duration}</span>
          )}
        </div>
      </div>
      <div className="pl-[52px] space-y-6">{children}</div>
    </section>
  );
}

function StepDetail({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
      )}
      <div className="text-[var(--tb-muted)] text-[15px] leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}

function ScreenshotPlaceholder({ description }: { description: string }) {
  return (
    <div className="my-4 rounded-lg border-2 border-dashed border-[var(--tb-border)] bg-[var(--tb-surface)] p-6 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <Info size={18} className="text-[var(--tb-muted)]" />
      </div>
      <p className="text-xs text-[var(--tb-muted)] leading-relaxed">
        📷 截图占位 — {description}
      </p>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/30">
      <Info size={15} className="text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
      <p className="text-sm text-blue-700 dark:text-blue-400/80">{children}</p>
    </div>
  );
}

function DoneBox() {
  return (
    <div className="p-6 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/30 mb-10">
      <div className="flex items-start gap-3">
        <CheckCircle2
          size={20}
          className="text-green-600 dark:text-green-400 mt-0.5 shrink-0"
        />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-300 mb-1">
            配置完成！
          </p>
          <p className="text-sm text-green-700 dark:text-green-400/80 leading-relaxed">
            长连接建立后，向你的企业微信应用发送任意文本消息，TypeBridge
            会实时接收并注入到当前聚焦的输入框。你可以在 TypeBridge
            的「系统日志」tab 中查看每条消息的接收和处理状态。
          </p>
        </div>
      </div>
    </div>
  );
}
