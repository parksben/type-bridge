import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "适用场景 — TypeBridge",
  description:
    "TypeBridge 适用场景：语音转文字桌面直达、AI Coding Agent 语音搭档、高频文档产出、跨设备文本流转、团队协作提效。找到你的场景，立刻开始使用。",
};

import {
  Mic,
  Bot,
  FileText,
  ArrowRightLeft,
  Users,
  ArrowRight,
  Download,
  MessageSquareText,
  Globe,
  Sparkles,
} from "lucide-react";

const SCENES = [
  {
    anchorId: "voice-to-text",
    icon: Mic,
    color: "accent",
    title: "语音转文字，桌面直达",
    subtitle: "不想打字时，说一句话就够了",
    description:
      "飞书、钉钉、企业微信都内置了语音转文字功能。在手机上对着 IM 机器人说出你想输入的内容——写邮件、回复 Slack/Teams 消息、填写网页表单——转写结果由 TypeBridge 自动注入电脑端当前聚焦的输入框。",
    details: [
      "飞书/钉钉/企微语音转文字 → IM 机器人消息 → TypeBridge 接收 → 自动粘贴到电脑输入框",
      '典型场景：写邮件不想打字 → 手机说一句\u201C请安排明天下午的会议\u201D → 电脑邮件正文直接出现',
      "适用于所有可接收键盘输入的场景：Slack、Teams、微信、网页表单、终端命令……",
    ],
    tip: "配合「注入后自动提交」功能，语音说完一条消息后连回车键都不用按——手机发一句话，电脑直接发送。",
  },
  {
    anchorId: "ai-coding",
    icon: Bot,
    color: "blue",
    title: "AI Coding Agent 的语音搭档",
    subtitle: "说话驱动 AI 编码，告别手动输入",
    description:
      "在 Cursor、Copilot Chat、Windsurf 等 AI coding 工具中，你通常需要在对话框里手动输入指令。配合 TypeBridge，可以在手机上用语音说出需求，转写结果直接注入 AI Agent 的输入框——无需触碰键盘，即可驱动 AI 执行重构、调试、生成代码等任务。",
    details: [
      "手机语音 → IM 机器人 → TypeBridge → 注入 AI Agent 输入框 → AI 开始工作",
      '示例：对手机说\u201C帮我重构这个函数，把三个参数合并成一个结构体\u201D → AI 收到完整指令，立即执行',
      "解放双手：编码时不想打断思路去打字？手机说一句话，AI 就开始干活",
    ],
    tip: "这是编码提效的全新范式——语音驱动 AI Agent。在复杂的重构或调试场景中，口头描述往往比打字更快、更自然。",
  },
  {
    anchorId: "doc-production",
    icon: FileText,
    color: "purple",
    title: "高频文档产出",
    subtitle: "语音说的就是文档草稿",
    description:
      "对于需要持续产出文字内容的用户——撰写技术文档、起草方案报告、记录会议纪要——手机语音转文字 + TypeBridge 组成了一条\u201C语音 → 文档\u201D的高效管线。一边说话，内容一边实时流入电脑上的编辑器或文档，说出来的就是草稿，无需事后整理转录。",
    details: [
      '手机语音输入 → IM 机器人转写 → TypeBridge 实时注入 → 电脑文档/编辑器中逐行出现内容',
      '典型场景：写技术文档时不想反复打字 → 手机边想边说 → Markdown 编辑器中实时生成草稿段落',
      "配合「输入后自动提交」功能，每段语音说完后自动换行/提交——连续产出，一气呵成",
    ],
    tip: "高频产出场景下，语音输入的速度远超键盘打字（中文语音转文字可达 200+ 字/分钟）。对需要大量文字内容但又不想长时间坐在键盘前的用户，这是效率跃升。",
  },
  {
    anchorId: "cross-device",
    icon: ArrowRightLeft,
    color: "sky",
    title: "跨设备文本流转",
    subtitle: "一句话发送，一步到位",
    description:
      '在手机上看到一段文字、一个链接、一个地址，想把它粘贴到电脑端的输入框——传统做法是\u201C手机复制→发邮件/存云笔记→电脑再复制→粘贴\u201D，至少 4 步。用 TypeBridge，只需要把内容发给 IM 机器人，一步直达。',
    details: [
      "手机上看到的内容 → 复制/转发到 IM 机器人 → TypeBridge → 自动注入电脑输入框",
      "典型场景：手机浏览器看到的网址 → 发给机器人 → 电脑浏览器地址栏直接出现",
      "长文本也能处理：代码片段、SQL 语句、配置参数……粘贴到终端、编辑器、搜索框",
    ],
    tip: "配合图片消息支持，手机截图或图片也能自动下载到剪贴板，一步粘贴到文档或聊天中。",
  },
  {
    anchorId: "team-collab",
    icon: Users,
    color: "green",
    title: "团队协作提效",
    subtitle: "群里发一条指令，同事电脑直接出现",
    description:
      "团队成员在飞书/钉钉群中 @ 机器人发送命令或数据——IP 地址、配置参数、SQL 片段、部署指令——TypeBridge 自动注入到指定同事的电脑输入框。运维人员用手机发一条指令，同事的终端或代码编辑器里直接出现内容。",
    details: [
      "群聊 @ 机器人 → 消息推送到所有在线成员 → 各人 TypeBridge 接收 → 注入各自聚焦的输入框",
      '运维场景：手机发\u201Cssh deploy@10.0.1.5\u201D → 同事终端直接出现，连回车都能自动提交',
      "开发场景：群里贴一段 JSON 配置 → 同事编辑器里直接到位",
    ],
    tip: "群聊消息是广播模式——发一条消息，团队所有在线成员同时收到注入。适合需要多人同步执行的场景。",
  },
];

function colorClasses(color: string) {
  const map: Record<string, { bg: string; icon: string }> = {
    accent: {
      bg: "bg-orange-50 dark:bg-orange-950/30",
      icon: "text-orange-600 dark:text-orange-400",
    },
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      icon: "text-blue-600 dark:text-blue-400",
    },
    sky: {
      bg: "bg-sky-50 dark:bg-sky-950/30",
      icon: "text-sky-600 dark:text-sky-400",
    },
    green: {
      bg: "bg-green-50 dark:bg-green-950/30",
      icon: "text-green-600 dark:text-green-400",
    },
    purple: {
      bg: "bg-purple-50 dark:bg-purple-950/30",
      icon: "text-purple-600 dark:text-purple-400",
    },
  };
  return map[color] || map.accent;
}

export default function UseCasesPage() {
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
        <span className="text-[var(--tb-text)] font-medium">适用场景</span>
      </div>

      {/* Header */}
      <div className="mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-50 dark:bg-orange-950/50 text-[var(--tb-accent)] border border-orange-200 dark:border-orange-900/50 mb-4">
          适用场景
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          什么场景需要
          <span className="text-[var(--tb-accent)] font-bold">
            TypeBridge
          </span>
        </h1>
        <p className="text-[var(--tb-muted)] text-lg leading-relaxed max-w-2xl">
          TypeBridge 不是又一个聊天工具——它是 IM 消息到桌面输入框的桥接工具。
          以下场景，可能正是你需要的。
        </p>
      </div>

      {/* Scene sections */}
      <div className="space-y-12">
        {SCENES.map((scene) => {
          const Icon = scene.icon;
          const c = colorClasses(scene.color);
          return (
            <section key={scene.anchorId} id={scene.anchorId} data-step-anchor={scene.anchorId}>
              {/* Scene header */}
              <div className={`${c.bg} rounded-xl p-5 mb-5`}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--tb-surface)] flex items-center justify-center shrink-0">
                    <Icon size={20} className={c.icon} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight mb-1">
                      {scene.title}
                    </h2>
                    <p className="text-[var(--tb-muted)] text-sm font-medium">
                      {scene.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-[var(--tb-text)] leading-relaxed mb-5">
                {scene.description}
              </p>

              {/* Details */}
              <ul className="space-y-3 mb-5">
                {scene.details.map((detail, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[var(--tb-text)] leading-relaxed"
                  >
                    <Sparkles
                      size={16}
                      className="text-[var(--tb-accent)] shrink-0 mt-1"
                    />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>

              {/* Tip */}
              <div className="p-4 rounded-xl bg-[var(--tb-surface)] border border-[var(--tb-border)] mb-2">
                <p className="text-sm text-[var(--tb-muted)] leading-relaxed">
                  <span className="text-[var(--tb-accent)] font-semibold">
                    提示：
                  </span>{" "}
                  {scene.tip}
                </p>
              </div>
            </section>
          );
        })}
      </div>

      {/* Call to action */}
      <section id="cta" data-step-anchor="cta" className="mt-16 pt-12 border-t border-[var(--tb-border)]">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight mb-3">
            找到你的场景？
          </h2>
          <p className="text-[var(--tb-muted)] text-lg leading-relaxed">
            下载 TypeBridge，5 分钟完成配置，立刻开始。
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <a
            href="/download/arm64"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-[var(--tb-accent)] text-white hover:opacity-90 transition-opacity shadow-lg shadow-[var(--tb-accent)]/25"
          >
            <Download size={16} />
            免费下载
          </a>
          <a
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium border border-[var(--tb-border)] bg-[var(--tb-surface)] text-[var(--tb-text)] hover:border-[var(--tb-accent)]/40 transition-all"
          >
            <MessageSquareText size={16} />
            查看接入教程
          </a>
        </div>

        {/* Channel links */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <a
            href="/docs/webchat"
            className="group p-5 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-purple-400/40 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <Globe
                size={16}
                className="text-purple-600 dark:text-purple-400 shrink-0"
              />
              <span className="font-semibold text-sm group-hover:text-[var(--tb-accent)] transition-colors">
                Web Chat 接入指南
              </span>
            </div>
            <p className="text-xs text-[var(--tb-muted)] leading-relaxed">
              官方渠道，无需 IM 平台，打开浏览器即可使用。
            </p>
            <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 mt-3">
              开始教程 <ArrowRight size={12} />
            </div>
          </a>
          <a
            href="/docs/feishu"
            className="group p-5 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-blue-400/40 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageSquareText
                size={16}
                className="text-blue-600 dark:text-blue-400 shrink-0"
              />
              <span className="font-semibold text-sm group-hover:text-[var(--tb-accent)] transition-colors">
                飞书接入指南
              </span>
            </div>
            <p className="text-xs text-[var(--tb-muted)] leading-relaxed">
              创建飞书自建应用，开启长连接接收消息。
            </p>
            <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-3">
              开始教程 <ArrowRight size={12} />
            </div>
          </a>
          <a
            href="/docs/dingtalk"
            className="group p-5 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-sky-400/40 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageSquareText
                size={16}
                className="text-sky-600 dark:text-sky-400 shrink-0"
              />
              <span className="font-semibold text-sm group-hover:text-[var(--tb-accent)] transition-colors">
                钉钉接入指南
              </span>
            </div>
            <p className="text-xs text-[var(--tb-muted)] leading-relaxed">
              创建钉钉企业内部应用，配置 Stream Mode。
            </p>
            <div className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 mt-3">
              开始教程 <ArrowRight size={12} />
            </div>
          </a>
          <a
            href="/docs/wecom"
            className="group p-5 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-green-400/40 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageSquareText
                size={16}
                className="text-green-600 dark:text-green-400 shrink-0"
              />
              <span className="font-semibold text-sm group-hover:text-[var(--tb-accent)] transition-colors">
                企业微信接入指南
              </span>
            </div>
            <p className="text-xs text-[var(--tb-muted)] leading-relaxed">
              创建企微自建应用，配置消息回调。
            </p>
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-3">
              开始教程 <ArrowRight size={12} />
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}