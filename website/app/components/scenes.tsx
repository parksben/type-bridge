"use client";

import {
  MessageSquareText,
  Mic,
  MousePointer2,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT, renderMarked } from "../lib/i18n";

type SceneId = "touchpad" | "typeInput" | "voiceInput" | "quickCommands";

type SceneDef = {
  id: SceneId;
  icon: LucideIcon;
  tint: string;
  tabLabelKey: string;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  detailsKey: string;
  tipKey: string;
  themeKey: string;
};

const SCENE_DEFS: SceneDef[] = [
  {
    id: "touchpad",
    icon: MousePointer2,
    tint: "rgba(234, 88, 12, 0.18)",
    tabLabelKey: "scenes.touchpad.title",
    titleKey: "scenes.touchpad.title",
    subtitleKey: "scenes.touchpad.subtitle",
    descriptionKey: "scenes.touchpad.description",
    detailsKey: "scenes.touchpad.details",
    tipKey: "scenes.touchpad.tip",
    themeKey: "scenes.touchpad.theme",
  },
  {
    id: "typeInput",
    icon: MessageSquareText,
    tint: "rgba(14, 165, 233, 0.18)",
    tabLabelKey: "scenes.typeInput.title",
    titleKey: "scenes.typeInput.title",
    subtitleKey: "scenes.typeInput.subtitle",
    descriptionKey: "scenes.typeInput.description",
    detailsKey: "scenes.typeInput.details",
    tipKey: "scenes.typeInput.tip",
    themeKey: "scenes.typeInput.theme",
  },
  {
    id: "voiceInput",
    icon: Mic,
    tint: "rgba(255, 122, 77, 0.18)",
    tabLabelKey: "scenes.voiceInput.title",
    titleKey: "scenes.voiceInput.title",
    subtitleKey: "scenes.voiceInput.subtitle",
    descriptionKey: "scenes.voiceInput.description",
    detailsKey: "scenes.voiceInput.details",
    tipKey: "scenes.voiceInput.tip",
    themeKey: "scenes.voiceInput.theme",
  },
  {
    id: "quickCommands",
    icon: Zap,
    tint: "rgba(192, 132, 252, 0.18)",
    tabLabelKey: "scenes.quickCommands.title",
    titleKey: "scenes.quickCommands.title",
    subtitleKey: "scenes.quickCommands.subtitle",
    descriptionKey: "scenes.quickCommands.description",
    detailsKey: "scenes.quickCommands.details",
    tipKey: "scenes.quickCommands.tip",
    themeKey: "scenes.quickCommands.theme",
  },
];

const AUTO_PLAY_MS = 10000;

export function Scenes() {
  const { t, tStrings } = useT();
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

  // 5s auto-play — only when playing (in viewport + not hovered)
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setIndex((i) => (i + 1) % SCENE_DEFS.length);
    }, AUTO_PLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, playing]);

  function goTo(i: number) {
    if (i === index) return;
    setIndex(i);
  }

  const activeDef = SCENE_DEFS[index];
  const Icon = activeDef.icon;
  const title = t(activeDef.titleKey);
  const subtitle = t(activeDef.subtitleKey);
  const description = t(activeDef.descriptionKey);
  const details = tStrings(activeDef.detailsKey);
  const tip = t(activeDef.tipKey);

  return (
    <section id="scenes" className="relative flex min-h-screen flex-col items-center justify-center px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            {renderMarked(t("scenes.heading"), "scenes-h")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
            {t("scenes.subheading")}
          </p>
        </div>

        {/* Pill tabs */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {SCENE_DEFS.map((def, i) => (
            <button
              key={def.id}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === index}
              className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                i === index
                  ? "border-transparent bg-accent-gradient text-white shadow-[0_6px_20px_-6px_var(--accent-glow)]"
                  : "border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <def.icon
                size={14}
                strokeWidth={i === index ? 2.4 : 2}
                className={i === index ? "text-white" : ""}
              />
              {t(def.tabLabelKey)}
            </button>
          ))}
        </div>

        {/* Card */}
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
                background: `radial-gradient(circle, ${activeDef.tint}, transparent 65%)`,
              }}
            >
              <Icon
                size={220}
                strokeWidth={1.1}
                className="text-[var(--text)]/[0.045]"
              />
            </div>

            {/* Scene content (keyed for fade-up on change) */}
            <div key={activeDef.id} className="animate-fade-up relative z-10">
              {/* Title row + page indicator */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-sm"
                    style={{ boxShadow: `0 8px 24px -12px ${activeDef.tint}` }}
                  >
                    <Icon
                      size={22}
                      strokeWidth={1.8}
                      className="text-[var(--accent)]"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold tracking-tight md:text-2xl">
                      {title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                      {subtitle}
                    </p>
                  </div>
                </div>

                {/* Page indicator */}
                <div className="shrink-0 font-mono text-xs tabular-nums tracking-widest">
                  <span className="text-[var(--text)] font-bold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mx-1 text-[var(--subtle)]">/</span>
                  <span className="text-[var(--subtle)]">
                    {String(SCENE_DEFS.length).padStart(2, "0")}
                  </span>
                </div>
              </div>

              <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--text)]/90">
                {description}
              </p>

              <ul className="mt-6 space-y-3">
                {details.map((detail, i) => (
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
                    {t("scenes.tipLabel")}
                  </span>
                  {tip}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
