import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Web Chat 接入指南 — TypeBridge",
  description:
    "TypeBridge Web Chat 接入指南：通过移动端浏览器聊天页面直接向 TypeBridge 发送消息，无需飞书/钉钉/企微等 IM 平台。零配置，打开即用。",
};

import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Smartphone,
  Monitor,
  Wifi,
  AlertCircle,
} from "lucide-react";
import {
  StepSection,
  StepDetail,
  ScreenshotPlaceholder,
  InfoBox,
  DoneBox,
} from "../steps";

export default function WebChatGuidePage() {
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
        <span className="text-[var(--tb-text)] font-medium">
          Web Chat 接入指南
        </span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50 mb-4">
          Web Chat · 开发中
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Web Chat 接入
          <span className="text-[var(--tb-accent)] font-bold">指南</span>
        </h1>
        <p className="text-[var(--tb-muted)] text-lg leading-relaxed">
          Web Chat 是 TypeBridge 自建的移动端浏览器聊天页面——无需飞书、钉钉或企微，
          打开手机浏览器即可向桌面端发送消息。零 IM 平台依赖，零配置，打开即用。
        </p>
      </div>

      {/* Beta notice */}
      <div className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 mb-10">
        <div className="flex items-start gap-3">
          <AlertCircle
            size={18}
            className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
              功能开发中
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400/80">
              Web Chat 功能正在开发中，以下教程内容将随功能上线持续更新。目前可先了解使用方式与预期体验。
            </p>
          </div>
        </div>
      </div>

      {/* What is Web Chat */}
      <section id="what-is-webchat" data-step-anchor="what-is-webchat" className="mb-12">
        <div className="bg-purple-50 dark:bg-purple-950/30 rounded-xl p-5 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--tb-surface)] flex items-center justify-center shrink-0">
              <Globe size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight mb-1">
                什么是 Web Chat？
              </h2>
              <p className="text-[var(--tb-muted)] text-sm font-medium">
                无需 IM 平台，手机浏览器打开即用
              </p>
            </div>
          </div>
        </div>

        <p className="text-[var(--tb-text)] leading-relaxed mb-5">
          Web Chat 是 TypeBridge 提供的第 4 种输入渠道。不同于飞书、钉钉、企微需要你去各家平台创建应用、配置凭据，
          Web Chat 是 TypeBridge 自建的移动端聊天页面——你的手机浏览器直接打开一个 URL，
          就可以在聊天界面中发送文字或语音消息，TypeBridge 桌面端自动接收并注入到当前聚焦的输入框。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="p-4 rounded-xl bg-[var(--tb-surface)] border border-[var(--tb-border)]">
            <Smartphone size={18} className="text-purple-600 dark:text-purple-400 mb-2" />
            <p className="text-sm font-semibold mb-1">手机端</p>
            <p className="text-xs text-[var(--tb-muted)]">浏览器打开 Web Chat 页面，输入或语音发送消息</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--tb-surface)] border border-[var(--tb-border)]">
            <Wifi size={18} className="text-[var(--tb-accent)] mb-2" />
            <p className="text-sm font-semibold mb-1">桥接</p>
            <p className="text-xs text-[var(--tb-muted)]">TypeBridge 通过 WebSocket 实时接收消息</p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--tb-surface)] border border-[var(--tb-border)]">
            <Monitor size={18} className="text-sky-600 dark:text-sky-400 mb-2" />
            <p className="text-sm font-semibold mb-1">桌面端</p>
            <p className="text-xs text-[var(--tb-muted)]">消息自动注入到当前聚焦的输入框</p>
          </div>
        </div>

        <InfoBox>
          Web Chat 的核心优势是「零 IM 平台依赖」——你不需要在任何第三方平台注册应用、获取凭据。
          只要 TypeBridge 桌面端在运行，手机浏览器就能直接连接。
        </InfoBox>
      </section>

      {/* Step 1 */}
      <StepSection number={1} title="启动 TypeBridge 桌面端" duration="约 1 分钟" anchorId="step-start-app">
        <StepDetail>
          <p>
            打开 TypeBridge macOS 客户端。应用启动后，Web Chat 服务自动就绪——无需额外配置凭据或连接参数。
          </p>
          <p className="text-[var(--tb-muted)] mt-3">
            确保应用已获得辅助功能权限（首次使用时会提示授权）。
          </p>
        </StepDetail>
      </StepSection>

      {/* Step 2 */}
      <StepSection number={2} title="在手机浏览器中打开 Web Chat" duration="约 1 分钟" anchorId="step-open-webchat">
        <StepDetail>
          <p>
            在 TypeBridge 配置窗口的「服务配置」板块中，找到 Web Chat 渠道对应的连接地址（显示为二维码 + URL 链接）。
            用手机浏览器扫描二维码或手动输入地址即可打开聊天页面。
          </p>
          <ScreenshotPlaceholder description="TypeBridge 配置窗口中 Web Chat 渠道页面，显示二维码和连接 URL" />
        </StepDetail>

        <StepDetail title="连接建立">
          <p>
            Web Chat 页面加载后，自动通过 WebSocket 与桌面端 TypeBridge 建立连接。
            页面顶部会显示连接状态指示灯——绿色表示已连接，可以开始发送消息。
          </p>
          <ScreenshotPlaceholder description="移动端 Web Chat 页面，顶部显示连接状态指示灯" />
        </StepDetail>
      </StepSection>

      {/* Step 3 */}
      <StepSection number={3} title="发送消息" duration="约 1 分钟" anchorId="step-send-message">
        <StepDetail>
          <p>
            在 Web Chat 聊天界面中，你可以：
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2 text-[var(--tb-muted)]">
            <li>直接输入文字消息并发送</li>
            <li>使用手机语音转文字功能，语音说出内容后发送</li>
            <li>发送图片（拍照或从相册选取）</li>
          </ul>
        </StepDetail>

        <StepDetail title="消息到达桌面端">
          <p>
            消息发送后，TypeBridge 桌面端在 1 秒内接收并自动注入到你电脑当前聚焦的输入框中。
            如果开启了「输入后自动提交」功能，消息还会自动触发提交按键（如 Enter）。
          </p>
          <ScreenshotPlaceholder description="手机端发送消息后，电脑端输入框中文字自动出现" />
        </StepDetail>
      </StepSection>

      {/* Step 4 */}
      <StepSection number={4} title="持续使用与反馈" duration="实时" anchorId="step-continuous-use">
        <StepDetail>
          <p>
            Web Chat 支持持续对话——你可以连续发送多条消息，每条都会依次注入桌面端（进入 FIFO 队列，严格串行处理）。
          </p>
          <p className="text-[var(--tb-muted)] mt-3">
            每条消息处理完成后，Web Chat 页面会显示状态反馈：
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-[var(--tb-muted)]">
            <li>已收到 — 消息已到达桌面端</li>
            <li>已输入 — 消息已成功注入输入框</li>
            <li>输入失败 — 注入失败，会显示具体原因</li>
          </ul>
        </StepDetail>

        <InfoBox>
          Web Chat 页面可以保持后台打开，随时切换回来继续发送消息。
          连接断开时页面会自动尝试重连——无需手动刷新。
        </InfoBox>
      </StepSection>

      {/* Comparison */}
      <section id="comparison" data-step-anchor="comparison" className="mt-12 mb-12">
        <div className="bg-[var(--tb-surface)] rounded-xl p-6 border border-[var(--tb-border)]">
          <h3 className="text-lg font-bold mb-4">Web Chat vs IM 渠道对比</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--tb-border)]">
                  <th className="text-left py-2 pr-4 text-[var(--tb-muted)]">特性</th>
                  <th className="text-center py-2 px-3 text-purple-700 dark:text-purple-400">Web Chat</th>
                  <th className="text-center py-2 px-3 text-blue-700 dark:text-blue-400">飞书</th>
                  <th className="text-center py-2 px-3 text-sky-700 dark:text-sky-400">钉钉</th>
                  <th className="text-center py-2 px-3 text-green-700 dark:text-green-400">企微</th>
                </tr>
              </thead>
              <tbody className="text-[var(--tb-muted)]">
                <tr className="border-b border-[var(--tb-border)]/50">
                  <td className="py-2 pr-4">配置复杂度</td>
                  <td className="text-center py-2 px-3 text-[var(--tb-accent)] font-medium">零配置</td>
                  <td className="text-center py-2 px-3">需要创建应用</td>
                  <td className="text-center py-2 px-3">需要创建应用</td>
                  <td className="text-center py-2 px-3">需要创建应用</td>
                </tr>
                <tr className="border-b border-[var(--tb-border)]/50">
                  <td className="py-2 pr-4">依赖平台</td>
                  <td className="text-center py-2 px-3 text-[var(--tb-accent)] font-medium">无</td>
                  <td className="text-center py-2 px-3">飞书开放平台</td>
                  <td className="text-center py-2 px-3">钉钉开放平台</td>
                  <td className="text-center py-2 px-3">企微管理后台</td>
                </tr>
                <tr className="border-b border-[var(--tb-border)]/50">
                  <td className="py-2 pr-4">语音转文字</td>
                  <td className="text-center py-2 px-3">手机系统自带</td>
                  <td className="text-center py-2 px-3">飞书内置</td>
                  <td className="text-center py-2 px-3">钉钉内置</td>
                  <td className="text-center py-2 px-3">企微内置</td>
                </tr>
                <tr className="border-b border-[var(--tb-border)]/50">
                  <td className="py-2 pr-4">图片消息</td>
                  <td className="text-center py-2 px-3">支持</td>
                  <td className="text-center py-2 px-3">支持</td>
                  <td className="text-center py-2 px-3">支持</td>
                  <td className="text-center py-2 px-3">支持</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">多人协作</td>
                  <td className="text-center py-2 px-3">单用户</td>
                  <td className="text-center py-2 px-3">群 @ 机器人</td>
                  <td className="text-center py-2 px-3">群 @ 机器人</td>
                  <td className="text-center py-2 px-3">群 @ 机器人</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Done */}
      <DoneBox />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-8 border-t border-[var(--tb-border)]">
        <a
          href="/docs/use-cases"
          className="inline-flex items-center gap-2 text-sm text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
        >
          <ArrowLeft size={15} />
          适用场景
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
  );
}