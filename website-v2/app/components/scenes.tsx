"use client";

import {
  ArrowRightLeft,
  Bot,
  FileText,
  Mic,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Scene = {
  id: string;
  tabLabel: string;
  icon: LucideIcon;
  tint: string;
  title: string;
  subtitle: string;
  description: string;
  details: string[];
  tip: string;
  theme: string;
};

const SCENES: Scene[] = [
  {
    id: "voice-to-text",
    tabLabel: "语音转文字",
    icon: Mic,
    tint: "rgba(255, 122, 77, 0.18)",
    title: "语音转文字，桌面直达",
    subtitle: "不想打字时，说一句话就够了",
    description:
      "飞书、钉钉、企业微信都内置了语音转文字功能。在手机上对着 IM 机器人说出你想输入的内容——写邮件、回复 Slack/Teams 消息、填写网页表单——转写结果由 TypeBridge 自动注入电脑端当前聚焦的输入框。",
    details: [
      "飞书 / 钉钉 / 企微语音转文字 → IM 机器人消息 → TypeBridge 接收 → 自动粘贴到电脑输入框",
      "典型场景：写邮件不想打字 → 手机说一句「请安排明天下午的会议」→ 电脑邮件正文直接出现",
      "适用于所有可接收键盘输入的场景：Slack、Teams、微信、网页表单、终端命令……",
    ],
    tip: "配合「注入后自动提交」功能，语音说完一条消息后连回车键都不用按——手机发一句话，电脑直接发送。",
    theme: "手机即键盘 — 语音版的那一下。",
  },
  {
    id: "ai-coding",
    tabLabel: "AI Coding 搭档",
    icon: Bot,
    tint: "rgba(192, 132, 252, 0.18)",
    title: "AI Coding Agent 的语音搭档",
    subtitle: "说话驱动 AI 编码，告别手动输入",
    description:
      "在 Cursor、Copilot Chat、Windsurf 等 AI coding 工具中，你通常需要在对话框里手动输入指令。配合 TypeBridge，可以在手机上用语音说出需求，转写结果直接注入 AI Agent 的输入框——无需触碰键盘，即可驱动 AI 执行重构、调试、生成代码等任务。",
    details: [
      "手机语音 → IM 机器人 → TypeBridge → 注入 AI Agent 输入框 → AI 开始工作",
      "示例：对手机说「帮我重构这个函数，把三个参数合并成一个结构体」→ AI 收到完整指令，立即执行",
      "解放双手：编码时不想打断思路去打字？手机说一句话，AI 就开始干活",
    ],
    tip: "这是编码提效的全新范式——语音驱动 AI Agent。在复杂的重构或调试场景中，口头描述往往比打字更快、更自然。",
    theme: "手机即键盘 — AI 时代的最高输入效率。",
  },
  {
    id: "doc-production",
    tabLabel: "高频文档产出",
    icon: FileText,
    tint: "rgba(34, 211, 238, 0.18)",
    title: "高频文档产出",
    subtitle: "语音说的就是文档草稿",
    description:
      "对于需要持续产出文字内容的用户——撰写技术文档、起草方案报告、记录会议纪要——手机语音转文字 + TypeBridge 组成了一条「语音 → 文档」的高效管线。一边说话，内容一边实时流入电脑上的编辑器或文档，说出来的就是草稿，无需事后整理转录。",
    details: [
      "手机语音输入 → IM 机器人转写 → TypeBridge 实时注入 → 电脑文档/编辑器中逐行出现内容",
      "典型场景：写技术文档时不想反复打字 → 手机边想边说 → Markdown 编辑器中实时生成草稿段落",
      "配合「输入后自动提交」功能，每段语音说完后自动换行/提交——连续产出，一气呵成",
    ],
    tip: "高频产出场景下，语音输入的速度远超键盘打字（中文语音转文字可达 200+ 字/分钟）。对需要大量文字内容但又不想长时间坐在键盘前的用户，这是效率跃升。",
    theme: "手机即键盘 — 让文档以说话的速度生长。",
  },
  {
    id: "cross-device",
    tabLabel: "跨设备流转",
    icon: ArrowRightLeft,
    tint: "rgba(14, 165, 233, 0.18)",
    title: "跨设备文本流转",
    subtitle: "一句话发送，一步到位",
    description:
      "在手机上看到一段文字、一个链接、一个地址，想把它粘贴到电脑端的输入框——传统做法是「手机复制→发邮件/存云笔记→电脑再复制→粘贴」，至少 4 步。用 TypeBridge，只需要把内容发给 IM 机器人，一步直达。",
    details: [
      "手机上看到的内容 → 复制/转发到 IM 机器人 → TypeBridge → 自动注入电脑输入框",
      "典型场景：手机浏览器看到的网址 → 发给机器人 → 电脑浏览器地址栏直接出现",
      "长文本也能处理：代码片段、SQL 语句、配置参数……粘贴到终端、编辑器、搜索框",
    ],
    tip: "配合图片消息支持，手机截图或图片也能自动下载到剪贴板，一步粘贴到文档或聊天中。",
    theme: "手机即键盘 — 也是你桌面的剪贴板。",
  },
  {
    id: "team-collab",
    tabLabel: "团队协作提效",
    icon: Users,
    tint: "rgba(16, 185, 129, 0.18)",
    title: "团队协作提效",
    subtitle: "群里发一条指令，同事电脑直接出现",
    description:
      "团队成员在飞书/钉钉群中 @ 机器人发送命令或数据——IP 地址、配置参数、SQL 片段、部署指令——TypeBridge 自动注入到指定同事的电脑输入框。运维人员用手机发一条指令，同事的终端或代码编辑器里直接出现内容。",
    details: [
      "群聊 @ 机器人 → 消息推送到所有在线成员 → 各人 TypeBridge 接收 → 注入各自聚焦的输入框",
      "运维场景：手机发「ssh deploy@10.0.1.5」→ 同事终端直接出现，连回车都能自动提交",
      "开发场景：群里贴一段 JSON 配置 → 同事编辑器里直接到位",
    ],
    tip: "群聊消息是广播模式——发一条消息，团队所有在线成员同时收到注入。适合需要多人同步执行的场景。",
    theme: "手机即键盘 — 也是团队共享的那一只。",
  },
];

const AUTO_PLAY_MS = 5000;

export function Scenes() {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Viewport pause: only play when ≥ 30% of the card is visible
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const playing = inView && !hovered;

  function goTo(i: number) {
    if (i === index) return;
    setIndex(i);
  }

  function next() {
    setIndex((i) => (i + 1) % SCENES.length);
  }

  const active = SCENES[index];
  const Icon = active.icon;

  return (
    <section id="scenes" className="relative px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        {/* Header — no eyebrow, no trailing period */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            每一个场景，都是
            <span className="text-accent-gradient">手机即键盘</span>
            的一次验证
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
            5 种典型场景，看看 TypeBridge 在你工作流里的落点
          </p>
        </div>

        {/* Pill tabs */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {SCENES.map((scene, i) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === index}
              className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                i === index
                  ? "border-transparent bg-accent-gradient text-white shadow-[0_6px_20px_-6px_var(--accent-glow)]"
                  : "border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <scene.icon
                size={14}
                strokeWidth={i === index ? 2.4 : 2}
                className={i === index ? "text-white" : ""}
              />
              {scene.tabLabel}
            </button>
          ))}
        </div>

        {/* Card — top border acts as the rotation progress rail */}
        <div
          ref={cardRef}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm"
        >
          {/* Progress rail at card top — acts as the top border */}
          <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-[var(--border)]/60">
            <span
              key={`prog-${index}`}
              className="block h-full bg-accent-gradient"
              style={{
                width: 0,
                animation: `scene-progress ${AUTO_PLAY_MS}ms linear forwards`,
                animationPlayState: playing ? "running" : "paused",
              }}
              onAnimationEnd={() => {
                if (playing) next();
              }}
            />
          </div>

          <div className="relative p-6 pt-8 md:p-10 md:pt-12">
            {/* Watermark icon */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 flex h-72 w-72 items-center justify-center rounded-full opacity-90"
              style={{
                background: `radial-gradient(circle, ${active.tint}, transparent 65%)`,
              }}
            >
              <Icon
                size={220}
                strokeWidth={1.1}
                className="text-[var(--text)]/[0.045]"
              />
            </div>

            {/* Scene content (keyed for fade-up on change) */}
            <div key={active.id} className="animate-fade-up relative z-10">
              {/* Title row + page indicator on the right */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-sm"
                    style={{ boxShadow: `0 8px 24px -12px ${active.tint}` }}
                  >
                    <Icon
                      size={22}
                      strokeWidth={1.8}
                      className="text-[var(--accent)]"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold tracking-tight md:text-2xl">
                      {active.title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                      {active.subtitle}
                    </p>
                  </div>
                </div>

                {/* Page indicator — only element needed for progress signal now */}
                <div className="shrink-0 font-mono text-xs tabular-nums tracking-widest">
                  <span className="text-[var(--text)] font-bold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mx-1 text-[var(--subtle)]">/</span>
                  <span className="text-[var(--subtle)]">
                    {String(SCENES.length).padStart(2, "0")}
                  </span>
                </div>
              </div>

              <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--text)]/90">
                {active.description}
              </p>

              <ul className="mt-6 space-y-3">
                {active.details.map((detail, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[14px] leading-relaxed text-[var(--text)]/85"
                  >
                    <Sparkles
                      size={15}
                      strokeWidth={1.8}
                      className="mt-0.5 shrink-0 text-[var(--accent)]"
                    />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/60 p-4">
                <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                  <span className="font-semibold text-[var(--accent)]">
                    提示：
                  </span>{" "}
                  {active.tip}
                </p>
              </div>

              {/* Theme repeat — 主题短语复诵 */}
              <div className="mt-8 flex items-center gap-3 border-t border-[var(--border)] pt-6">
                <span
                  aria-hidden
                  className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent"
                />
                <p className="text-sm font-semibold tracking-tight text-[var(--text)]/90">
                  <span className="text-accent-gradient">{active.theme}</span>
                </p>
                <span
                  aria-hidden
                  className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inline keyframe — only required by this component */}
      <style>{`
        @keyframes scene-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </section>
  );
}
