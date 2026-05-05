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
import { useT, renderMarked } from "../lib/i18n";

// ────────────────────────────────────────────
// Flow — 4-step horizontal process diagram
//
//   01 Download ──→ 02 Launch ──→ 03 Connect (pick one) ──→ 04 Type on Desktop
// ────────────────────────────────────────────

type Step = {
  label: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

type ChoiceDef = {
  icon: LucideIcon;
  label: string;
  desc: string;
  bg: string;
  accent: string;
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
  choices,
  pickOneLabel,
  delayMs,
  active,
  className = "",
}: {
  choices: ChoiceDef[];
  pickOneLabel: string;
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
          {pickOneLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {choices.map((c) => {
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
      {/* 纯静态：细线 + 箭头，只表达方向，不再有 traveling-glow */}
      <div
        className={`rounded-full bg-[var(--border-strong)] ${
          isH ? "h-[2px] w-10" : "h-8 w-[2px]"
        }`}
      />
      <ArrowRight
        size={14}
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
  const { t } = useT();
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

  const LINEAR_STEPS: Step[] = [
    {
      label: "01",
      icon: Download,
      title: t("flow.step01.title"),
      subtitle: t("flow.step01.subtitle"),
    },
    {
      label: "02",
      icon: Play,
      title: t("flow.step02.title"),
      subtitle: t("flow.step02.subtitle"),
    },
  ];

  const CHOICES: ChoiceDef[] = [
    {
      icon: QrCode,
      label: t("flow.choice.webchat.label"),
      desc: t("flow.choice.webchat.desc"),
      bg: "rgba(192, 132, 252, 0.12)",
      accent: "#c084fc",
    },
    {
      icon: MessageSquareText,
      label: t("flow.choice.im.label"),
      desc: t("flow.choice.im.desc"),
      bg: "rgba(51, 112, 255, 0.12)",
      accent: "#3370ff",
    },
  ];

  const FINAL_STEP: Step = {
    label: "04",
    icon: Keyboard,
    title: t("flow.step04.title"),
    subtitle: t("flow.step04.subtitle"),
  };

  return (
    <section id="flow" className="relative flex min-h-screen flex-col items-center justify-center px-6 py-8 md:py-12">
      <div className="mx-auto w-full max-w-6xl overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            {renderMarked(t("flow.heading"), "flow-h")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
            {t("flow.subheading")}
          </p>
        </div>

        {/* Desktop flow */}
        <div ref={ref} className="hidden items-stretch gap-0 md:flex">
          <StepCard step={LINEAR_STEPS[0]} active={active} delayMs={0} className="w-0 flex-1" />
          <Connector active={active} delayMs={120} />
          <StepCard step={LINEAR_STEPS[1]} active={active} delayMs={200} className="w-0 flex-1" />
          <Connector active={active} delayMs={320} />
          <ChoiceCard
            choices={CHOICES}
            pickOneLabel={t("flow.step03.pickOne")}
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
          <ChoiceCard choices={CHOICES} pickOneLabel={t("flow.step03.pickOne")} active delayMs={0} />
          <Connector active delayMs={0} orientation="vertical" />
          <StepCard step={FINAL_STEP} active delayMs={0} highlight />
        </div>
      </div>
    </section>
  );
}
