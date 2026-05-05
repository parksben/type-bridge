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
    title: "语音输入，桌面直达",
    subtitle: "说一句话，就出现在电脑上",
    description:
      "对着手机说话，飞书、钉钉、企微帮你转成文字，再自动送进电脑当前输入框。写邮件、回消息、填表单——嘴就是键盘。",
    details: [
      "微信回消息 → 手机说一句 → 电脑聊天框直接出现文字",
      "VSCode 写注释 → 手机口述 → 编辑器里实时落字",
      "Slack / Teams 回复 → 不想切窗口打字 → 手机一句话搞定",
    ],
    tip: "打开「自动提交」开关，说完话连回车都不用按。",
    theme: "把嘴变成键盘。",
  },
  {
    id: "ai-coding",
    tabLabel: "AI Coding 搭档",
    icon: Bot,
    tint: "rgba(192, 132, 252, 0.18)",
    title: "AI 编程，动口不动手",
    subtitle: "说一句指令，AI 就开始写代码",
    description:
      "在 Cursor、Copilot Chat 里，用手机说出你的需求——「帮我重构这个函数」「加一个错误处理」——AI 收到完整指令立刻执行，你甚至不用碰键盘。",
    details: [
      "手机说「给这段代码写单测」→ Cursor 对话栏收到指令 → AI 自动生成",
      "重构时不想打断思路 → 手机口述需求 → AI 继续干活",
      "开会时想到一个 bug → 手机说给 AI → 回来代码已修好",
    ],
    tip: "口头描述往往比打字更准确——尤其是复杂的重构需求。",
    theme: "给 AI 配一个声音遥控器。",
  },
  {
    id: "doc-production",
    tabLabel: "高频文档产出",
    icon: FileText,
    tint: "rgba(34, 211, 238, 0.18)",
    title: "写文档，边说边出稿",
    subtitle: "说话就是写作，不敲一个字",
    description:
      "写周报、技术文档、会议纪要——对着手机边想边说，文字实时流进电脑上的编辑器。说完就是草稿，不用事后整理。",
    details: [
      "写周报 → 手机逐条口述 → Notion / 飞书文档里逐行出现",
      "写技术文档 → 手机描述思路 → Markdown 编辑器实时生成段落",
      "会议刚结束 → 趁记忆新鲜口述纪要 → 电脑上直接有文字",
    ],
    tip: "中文语音转文字可达 200+ 字/分钟，比键盘快一倍以上。",
    theme: "让文档以说话的速度产出。",
  },
  {
    id: "cross-device",
    tabLabel: "跨设备流转",
    icon: ArrowRightLeft,
    tint: "rgba(14, 165, 233, 0.18)",
    title: "跨设备粘贴，一步到位",
    subtitle: "手机上看到什么，电脑上就有什么",
    description:
      "手机上看到一个网址、一段代码、一个地址——发给 IM 机器人，电脑输入框里直接出现。不用「复制→发给自己→再复制→粘贴」那套老流程。",
    details: [
      "手机浏览器看到网址 → 复制发给机器人 → 电脑地址栏直接出现",
      "手机收到一段 SQL → 转发给机器人 → 终端 / 编辑器里直接到位",
      "截图发给机器人 → 自动存到电脑剪贴板 → 一键粘贴",
    ],
    tip: "比 Airdrop 快，比微信文件传输更方便。",
    theme: "手机就是电脑的剪贴板。",
  },
  {
    id: "team-collab",
    tabLabel: "团队协作提效",
    icon: Users,
    tint: "rgba(16, 185, 129, 0.18)",
    title: "团队共享键盘",
    subtitle: "群聊发一条，全队电脑同时落字",
    description:
      "团队群聊里 @ 机器人发指令或数据——IP 地址、配置参数、部署命令——所有在线成员的电脑输入框同步收到。运维、开发、测试，一个群搞定。",
    details: [
      "运维发「ssh deploy@10.0.1.5」→ 同事终端直接出现",
      "群里贴一段 JSON 配置 → 开发者编辑器里同步到位",
      "发布前发「确认上线」→ 全队电脑同时弹出提示",
    ],
    tip: "群聊消息是广播模式——一条消息，全队同步。",
    theme: "一条消息，全队同步。",
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

  // 5s 自动轮播 — 仅在 playing（视口内 + 未 hover）时计时
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % SCENES.length);
    }, AUTO_PLAY_MS);
    return () => window.clearTimeout(t);
  }, [index, playing]);

  function goTo(i: number) {
    if (i === index) return;
    setIndex(i);
  }

  const active = SCENES[index];
  const Icon = active.icon;

  return (
    <section id="scenes" className="relative px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        {/* Header — no eyebrow, no trailing period */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            每一个场景，都在验证
            <span className="text-accent-gradient">手机即键盘</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
            5 个典型用法，找到你的那个
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

        {/* Card — no top progress rail (轮播完全靠右上角页码暗示) */}
        <div
          ref={cardRef}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm"
        >
          <div className="relative p-6 md:p-10">
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

                {/* Page indicator — 唯一的进度信号 */}
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
