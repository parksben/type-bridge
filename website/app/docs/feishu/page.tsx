import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "飞书接入指南 — TypeBridge",
  description:
    "手把手教你创建飞书自建应用，获取 App ID 和 App Secret，开启长连接接收消息事件，完成 TypeBridge 飞书渠道接入。",
};

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
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

export default function FeishuGuidePage() {
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
        <span className="text-[var(--tb-text)] font-medium">飞书接入指南</span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 mb-4">
          飞书 · 自建应用
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          飞书接入
          <span className="font-brand text-[var(--tb-accent)]">指南</span>
        </h1>
        <p className="text-[var(--tb-muted)] text-lg leading-relaxed">
          TypeBridge 通过飞书自建应用的 WebSocket 长连接接收消息。按以下步骤操作，
          约 15 分钟即可完成配置。
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
              <li>拥有一个飞书企业/团队账号（管理员权限）</li>
              <li>已安装 TypeBridge macOS 客户端</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step 1 */}
      <StepSection number={1} title="创建飞书自建应用" duration="约 5 分钟" anchorId="step-create-app">
        <StepDetail>
          <p>
            前往
            <a
              href="https://open.feishu.cn/app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--tb-accent)] hover:underline mx-1"
            >
              飞书开放平台控制台
              <ExternalLink size={12} />
            </a>
            ，登录你的飞书企业账号。
          </p>
        </StepDetail>

        <StepDetail title="点击「创建企业自建应用」">
          <p>在控制台首页，选择「企业自建应用」类型，输入应用名称（如 TypeBridge），点击创建。</p>
          <ScreenshotPlaceholder description="飞书开放平台控制台 → 创建企业自建应用 → 填写名称的表单截图" />
        </StepDetail>

        <StepDetail title="记录应用凭据">
          <p>
            创建完成后，进入应用详情页，在「凭证与基础信息」区域找到以下内容并妥善保存：
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)]">
            <li>
              <strong>App ID</strong>（以 <code className="px-1 py-0.5 text-xs bg-[var(--tb-bg)] rounded border border-[var(--tb-border)] font-mono">cli_</code> 开头）
            </li>
            <li>
              <strong>App Secret</strong>（点击「查看」后复制）
            </li>
          </ul>
          <ScreenshotPlaceholder description="飞书应用详情页 → 凭证与基础信息区域，圈出 App ID 和 App Secret" />
          <InfoBox>
            这两个凭据需要在 TypeBridge 配置窗口中填写。不要泄露给任何人。
          </InfoBox>
        </StepDetail>
      </StepSection>

      {/* Step 2 */}
      <StepSection number={2} title="开启应用长连接能力" duration="约 2 分钟" anchorId="step-enable-bot">
        <StepDetail>
          <p>在应用详情页左侧导航栏中，点击「添加应用能力」。</p>
        </StepDetail>

        <StepDetail title="开启「机器人」能力">
          <p>
            在能力列表中找到「机器人」，点击「添加」。飞书机器人是 TypeBridge
            接收消息的载体——用户向该机器人发送的私聊 / 群聊消息都会通过长连接推送。
          </p>
          <ScreenshotPlaceholder description="添加应用能力页面，圈出「机器人」能力" />
        </StepDetail>

        <StepDetail title="补充机器人基本信息">
          <p>按需填写机器人名称、描述、头像，完成后点击保存。</p>
        </StepDetail>
      </StepSection>

      {/* Step 3 */}
      <StepSection number={3} title="配置事件订阅（长连接）" duration="约 5 分钟" anchorId="step-event-subscription">
        <StepDetail>
          <p>
            在应用详情页左侧点击「事件订阅」，这是 TypeBridge 能实时接收消息的关键步骤。
          </p>
        </StepDetail>

        <StepDetail title="选择「使用长连接接收事件」">
          <p>事件订阅页面中，选择「使用长连接接收事件」方式。TypeBridge 通过 WebSocket 长连接直接接收飞书推送，无需你配置公网回调 URL。</p>
          <ScreenshotPlaceholder description="事件订阅页面，圈出「使用长连接接收事件」选项" />
        </StepDetail>

        <StepDetail title="添加消息接收事件">
          <p>点击「添加事件」，搜索并勾选以下事件：</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)] mb-3">
            <li>
              <strong>接收消息</strong>（<code className="px-1 py-0.5 text-xs bg-[var(--tb-bg)] rounded border border-[var(--tb-border)] font-mono">im.message.receive_v1</code>）
            </li>
          </ul>
          <p>勾选后点击「确认添加」，最后点击页面底部的「保存」。</p>
          <ScreenshotPlaceholder description="添加事件弹窗，搜索 im.message.receive_v1 并勾选" />
        </StepDetail>

        <StepDetail title="完成长连接验证">
          <p>
            保存事件订阅后，回到 TypeBridge，在飞书配置 tab 中填写 App ID 和 App
            Secret，点击「启动长连接」。连接成功后，TypeBridge
            会提示你去飞书后台完成验证——点击页面上的验证按钮即可。
          </p>
          <InfoBox>
            验证完成后，飞书机器人状态变为「已启用」，长连接通道正式建立。
          </InfoBox>
        </StepDetail>
      </StepSection>

      {/* Step 4 */}
      <StepSection number={4} title="授权所需权限范围" duration="约 2 分钟" anchorId="step-permissions">
        <StepDetail>
          <p>在应用详情页左侧点击「权限管理」，搜索并开通以下权限：</p>
          <table className="w-full text-sm mt-3 border border-[var(--tb-border)] rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-[var(--tb-surface)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--tb-muted)]">
                  权限名称
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--tb-muted)]">
                  用途
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tb-border)]">
              {[
                ["im:message:readonly", "下载消息中的图片资源"],
                ["im:message.reactions:write_only", "对消息表情回复（反馈注入状态）"],
                ["im:message:send_as_bot", "回复消息文字说明（注入失败时）"],
              ].map(([scope, purpose]) => (
                <tr key={scope} className="hover:bg-[var(--tb-bg)] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs">{scope}</td>
                  <td className="px-4 py-2.5 text-[var(--tb-muted)]">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--tb-muted)]">
            提示：飞书可能推荐更细粒度的 scope，但以上三项是 TypeBridge 所需的最小集合。
            在 TypeBridge 配置窗口中点击「测试连接」可自动校验权限完整性。
          </p>
        </StepDetail>
      </StepSection>

      {/* Step 5 */}
      <StepSection number={5} title="填入 TypeBridge 并启动" duration="约 2 分钟" anchorId="step-fill-credentials">
        <StepDetail>
          <p>
            打开 TypeBridge，进入「服务配置 → 连接飞书 Bot」Tab：
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-2 text-[var(--tb-muted)]">
            <li>输入 <strong>App ID</strong>（以 cli_ 开头）</li>
            <li>输入 <strong>App Secret</strong></li>
            <li>点击「启动长连接」按钮</li>
            <li>等待状态显示「已连接」</li>
            <li>（推荐）点击「测试连接」校验权限范围</li>
          </ol>
        </StepDetail>
      </StepSection>

      {/* Done */}
      <DoneBox />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-8 border-t border-[var(--tb-border)]">
        <a
          href="/docs"
          className="inline-flex items-center gap-2 text-sm text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
        >
          <ArrowLeft size={15} />
          返回文档中心
        </a>
        <a
          href="/docs/dingtalk"
          className="inline-flex items-center gap-2 text-sm text-[var(--tb-accent)] hover:underline transition-colors font-medium"
        >
          钉钉接入指南
          <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
