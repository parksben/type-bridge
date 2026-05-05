"use client";

import {
  ArrowRight,
  Download,
  Keyboard,
  MessageSquareText,
  Play,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ────────────────────────────────────────────
// Flow — 4-step horizontal process diagram
//
//   01 下载 ──→ 02 打开 ──→ 03 连接（任选其一：扫码 WebChat / 连接 IM 机器人）──→ 04 桌面自动落字
//
// Desktop: horizontal flex with animated "traveling-glow" connectors between cards.
// Mobile: vertical stack with down-chevron dividers.
// ────────────────────────────────────────────

type Step = {
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

const LINEAR_STEPS: Step[] = [
  {
    label: "01",
    icon: Download,
    title: "下载 App",
    subtitle: "从官网下载 macOS 安装包",
  },
  {
    label: "02",
    icon: Play,
    title: "打开 App",
    subtitle: "首次启动引导授权辅助功能",
  },
];

type Choice = {
  icon: LucideIcon;
  label: string;
  desc: string;
  bg: string;
  accent: string;
};

const CHOICES: Choice[] = [
  {
    icon: QrCode,
    label: "扫码 WebChat",
    desc: "同 WiFi 手机扫二维码",
    bg: "rgba(192, 132, 252, 0.12)",
    accent: "#c084fc",
  },
  {
    icon: MessageSquareText,
    label: "连接 IM 机器人",
    desc: "飞书 / 钉钉 / 企微自建应用",
    bg: "rgba(51, 112, 255, 0.12)",
    accent: "#3370ff",
  },
];

const FINAL_STEP: Step = {
  label: "04",
  icon: Keyboard,
  title: "桌面自动落字",
  subtitle: "文本 / 图片 / 图文混合直达当前聚焦输入框",
};

// ────────────────────────────────────────────
// Cards
// ────────────────────────────────────────────

function StepCard({
  step,
  delayMs,
  active,
  highlight,
  className = "",
}: {
  step: Step;
  delayMs: number;
  active: boolean;
  highlight?: boolean;
  className?: string;
}) {
  const Icon = step.icon;
  return (
    <div
      className={`relative flex flex-col gap-4 rounded-2xl border p-5 backdrop-blur-sm transition-all duration-500 ${
        active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${
        highlight
          ? "border-[var(--accent)]/45 bg-[var(--surface)] shadow-[0_16px_48px_-20px_var(--accent-glow)]"
          : "border-[var(--border)] bg-[var(--surface)]/55 hover:border-[var(--border-strong)]"
      } ${className}`}
      style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
    >
      <span className="text-accent-gradient text-[11px] font-extrabold tracking-[0.25em]">
        STEP {step.label}
      </span>

      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
          highlight
            ? "bg-accent-gradient text-white shadow-[0_8px_24px_-8px_var(--accent-glow)]"
            : "bg-[var(--bg-2)] text-[var(--accent)]"
        }`}
      >
        <Icon size={22} strokeWidth={1.8} />
      </div>

      <div className="space-y-1">
        <h3 className="text-[15px] font-bold tracking-tight text-[var(--text)]">
          {step.title}
        </h3>
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          {step.subtitle}
        </p>
      </div>
    </div>
  );
}

function ChoiceCard({
  delayMs,
  active,
  className = "",
}: {
  delayMs: number;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/55 p-5 backdrop-blur-sm transition-all duration-500 hover:border-[var(--border-strong)] ${
        active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${className}`}
      style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-accent-gradient text-[11px] font-extrabold tracking-[0.25em]">
          STEP 03
        </span>
        <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
          任选其一
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CHOICES.map((c) => {
          const CIcon = c.icon;
          return (
            <div
              key={c.label}
              className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/60 p-3 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: c.bg }}
                >
                  <CIcon size={15} strokeWidth={1.8} style={{ color: c.accent }} />
                </div>
                <span className="text-[13px] font-semibold text-[var(--text)]">
                  {c.label}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                {c.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Connectors — small "traveling glow" bar between cards
// Desktop = horizontal, mobile = vertical (rotated 90deg)
// ────────────────────────────────────────────

function Connector({
  delayMs,
  active,
  orientation = "horizontal",
}: {
  delayMs: number;
  active: boolean;
  orientation?: "horizontal" | "vertical";
}) {
  const isH = orientation === "horizontal";
  return (
    <div
      className={`flex shrink-0 items-center justify-center transition-opacity duration-500 ${
        active ? "opacity-100" : "opacity-0"
      } ${isH ? "px-1" : "py-1"}`}
      style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
      aria-hidden
    >
      <div
        className={`relative overflow-hidden rounded-full bg-[var(--border)] ${
          isH ? "h-[2px] w-10" : "h-8 w-[2px]"
        }`}
      >
        <span
          className="absolute bg-accent-gradient"
          style={
            isH
              ? {
                  top: 0,
                  bottom: 0,
                  width: "40%",
                  left: 0,
                  animation: "flow-travel-h 2.2s linear infinite",
                  borderRadius: "9999px",
                }
              : {
                  left: 0,
                  right: 0,
                  height: "40%",
                  top: 0,
                  animation: "flow-travel-v 2.2s linear infinite",
                  borderRadius: "9999px",
                }
          }
        />
      </div>
      <ArrowRight
        size={isH ? 14 : 14}
        strokeWidth={2}
        className={`ml-1 text-[var(--accent)] ${isH ? "" : "rotate-90"}`}
      />
    </div>
  );
}

// ────────────────────────────────────────────
// Flow section
// ────────────────────────────────────────────

export function Flow() {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setActive(true);
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="flow" className="relative px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        {/* Header — no eyebrow, no trailing period */}
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            看<span className="text-accent-gradient">手机</span>如何变成
            <span className="text-accent-gradient">你的键盘</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
            四步上手，两条连接路径可任选其一；消息发出后桌面当前聚焦的输入框自动落字
          </p>
        </div>

        {/* Desktop flow */}
        <div
          ref={ref}
          className="hidden items-stretch gap-0 md:flex"
        >
          <StepCard
            step={LINEAR_STEPS[0]}
            active={active}
            delayMs={0}
            className="w-0 flex-1"
          />
          <Connector active={active} delayMs={120} />
          <StepCard
            step={LINEAR_STEPS[1]}
            active={active}
            delayMs={200}
            className="w-0 flex-1"
          />
          <Connector active={active} delayMs={320} />
          <ChoiceCard
            active={active}
            delayMs={400}
            className="w-0 flex-[1.8]"
          />
          <Connector active={active} delayMs={520} />
          <StepCard
            step={FINAL_STEP}
            active={active}
            delayMs={600}
            highlight
            className="w-0 flex-1"
          />
        </div>

        {/* Mobile flow — vertical */}
        <div className="space-y-0 md:hidden">
          <StepCard step={LINEAR_STEPS[0]} active delayMs={0} />
          <Connector active delayMs={0} orientation="vertical" />
          <StepCard step={LINEAR_STEPS[1]} active delayMs={0} />
          <Connector active delayMs={0} orientation="vertical" />
          <ChoiceCard active delayMs={0} />
          <Connector active delayMs={0} orientation="vertical" />
          <StepCard step={FINAL_STEP} active delayMs={0} highlight />
        </div>
      </div>

      {/* Keyframes scoped inline to this section */}
      <style>{`
        @keyframes flow-travel-h {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(340%); }
        }
        @keyframes flow-travel-v {
          0%   { transform: translateY(-120%); }
          100% { transform: translateY(340%); }
        }
      `}</style>
    </section>
  );
}
