"use client";

import { ArrowDown, Download, Globe } from "lucide-react";
import { useT, renderMarked } from "../lib/i18n";
import { BrandMark, BrandWordmark } from "./logo";

// ────────────────────────────────────────────
// Icon marks — reused in both the app-icon row (left of phone)
// and inside the phone chatbot screen.
// ────────────────────────────────────────────

/** 飞书 — 官方 favicon PNG，原色多色保留 */
function FeishuMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/channel-icons/feishu.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      style={{ display: "inline-block", objectFit: "contain" }}
    />
  );
}

/** 钉钉 — ant-design icons 单色 SVG */
function DingTalkMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="currentColor"
      style={{ color: "#0089FF" }}
      aria-hidden
    >
      <path d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1c-5 61.1 33.6 160.5 53.6 182.8c19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8c11.4 61.7 64.9 131.8 107.2 138.4c42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8c-33.1 12.5 24 62.6 24 62.6c84.7 76.8 129.7 50.5 129.7 50.5c33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8c17-71.3-114.5-99.4-265.8-154.5" />
    </svg>
  );
}

/** 企微 — tdesign icons 单色 SVG */
function WecomMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ color: "#06BA6A" }}
      aria-hidden
    >
      <path d="m17.326 8.158l-.003-.007a6.6 6.6 0 0 0-1.178-1.674c-1.266-1.307-3.067-2.19-5.102-2.417a9.3 9.3 0 0 0-2.124 0h-.001c-2.061.228-3.882 1.107-5.14 2.405a6.7 6.7 0 0 0-1.194 1.682A5.7 5.7 0 0 0 2 10.657c0 1.106.332 2.218.988 3.201l.006.01c.391.594 1.092 1.39 1.637 1.83l.983.793l-.208.875l.527-.267l.708-.358l.761.225c.467.137.955.227 1.517.29h.005q.515.06 1.026.059c.355 0 .724-.02 1.095-.06a9 9 0 0 0 1.346-.258c.095.7.43 1.337.932 1.81c-.658.208-1.352.358-2.061.436c-.442.048-.883.072-1.312.072q-.627 0-1.253-.072a10.7 10.7 0 0 1-1.861-.36l-2.84 1.438s-.29.131-.44.131c-.418 0-.702-.285-.702-.704c0-.252.067-.598.128-.84l.394-1.653c-.728-.586-1.563-1.544-2.052-2.287A7.76 7.76 0 0 1 0 10.658a7.7 7.7 0 0 1 .787-3.39a8.7 8.7 0 0 1 1.551-2.19c1.61-1.665 3.878-2.73 6.359-3.006a11.3 11.3 0 0 1 2.565 0c2.47.275 4.712 1.353 6.323 3.017a8.6 8.6 0 0 1 1.539 2.192c.466.945.769 1.937.769 2.978a3.06 3.06 0 0 0-2-.005c-.001-.644-.189-1.329-.564-2.09zm4.125 6.977l-.024-.024l-.024-.018l-.024-.018l-.096-.095a4.24 4.24 0 0 1-1.169-2.192q0-.038-.006-.075l-.006-.056l-.035-.144a1.3 1.3 0 0 0-.358-.61a1.386 1.386 0 0 0-1.957 0a1.4 1.4 0 0 0 0 1.963c.191.191.418.311.668.371c.024.012.06.012.084.012q.019 0 .041.006q.023.005.042.006a4.24 4.24 0 0 1 2.231 1.186c.048.048.096.095.131.143a.323.323 0 0 0 .466 0a.35.35 0 0 0 .036-.455m-1.05 4.37l-.025.025c-.119.096-.31.096-.453-.036a.326.326 0 0 1 0-.467c.047-.036.094-.083.141-.13l.002-.002a4.27 4.27 0 0 0 1.187-2.28q.005-.024.006-.043c0-.024 0-.06.012-.084a1.386 1.386 0 0 1 2.326-.67a1.4 1.4 0 0 1 0 1.964c-.167.18-.382.299-.608.359l-.143.036l-.057.005q-.035.006-.075.007a4.2 4.2 0 0 0-2.183 1.173l-.095.096q-.009.01-.018.024t-.018.024m-4.392-1.053l.024.024l.024.018q.015.009.024.018l.096.096a4.25 4.25 0 0 1 1.169 2.19q0 .04.006.076q.005.03.006.057l.035.143c.06.228.18.443.358.611c.537.539 1.42.539 1.957 0a1.4 1.4 0 0 0 0-1.964a1.4 1.4 0 0 0-.668-.371c-.024-.012-.06-.012-.084-.012q-.018 0-.041-.006l-.042-.006a4.25 4.25 0 0 1-2.231-1.185a1.4 1.4 0 0 1-.131-.144a.323.323 0 0 0-.466 0a.325.325 0 0 0-.036.455m1.039-4.358l.024-.024a.32.32 0 0 1 .453.035a.326.326 0 0 1 0 .467c-.047.036-.094.083-.141.13l-.002.002a4.27 4.27 0 0 0-1.187 2.281l-.006.042c0 .024 0 .06-.012.084a1.386 1.386 0 0 1-2.326.67a1.4 1.4 0 0 1 0-1.963c.166-.18.381-.3.608-.36l.143-.035q.026 0 .056-.006q.037-.005.075-.006a4.2 4.2 0 0 0 2.183-1.174l.096-.095l.018-.025z" />
    </svg>
  );
}

// ────────────────────────────────────────────
// Concept banner — Phone → Bridge → Monitor
// Flex layout with equal-width line separators for symmetry.
// ────────────────────────────────────────────

type AppIcon = {
  label: string;
  color: string;
  Mark: (props: { size?: number }) => React.ReactNode;
};

function makeAppIcons(t: (key: string) => string): AppIcon[] {
  return [
    {
      label: t("channel.webchat"),
      color: "#ea580c",
      Mark: ({ size = 20 }) => (
        <img
          src="/typebridge.png"
          width={size}
          height={size}
          alt=""
          aria-hidden
          style={{ display: "inline-block", objectFit: "contain" }}
        />
      ),
    },
    {
      label: t("channel.feishu"),
      color: "#3370FF",
      Mark: ({ size = 22 }) => <FeishuMark size={size} />,
    },
    {
      label: t("channel.dingtalk"),
      color: "#0089FF",
      Mark: ({ size = 22 }) => <DingTalkMark size={size} />,
    },
    {
      label: t("channel.wecom"),
      color: "#06BA6A",
      Mark: ({ size = 22 }) => <WecomMark size={size} />,
    },
  ];
}

/** Phone with channel badges + user message inside */
function PhoneNode() {
  const { t } = useT();
  const apps = makeAppIcons(t);

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/90 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)] backdrop-blur-md"
      style={{ width: "160px", height: "280px" }}
      aria-hidden
    >
      {/* Dynamic island */}
      <div className="flex justify-center pt-2.5">
        <div className="h-[6px] w-[48px] rounded-full bg-[var(--text)]/15" />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-1">
        <span className="text-[9px] font-semibold text-[var(--muted)]">9:41</span>
        <div className="flex items-center gap-1">
          <Globe size={9} strokeWidth={1.5} style={{ color: "var(--muted)" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
        </div>
      </div>

      {/* Channel badges row */}
      <div className="flex items-center gap-1.5 px-4 pt-2">
        {apps.map((app) => (
          <div
            key={app.label}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-md"
            style={{
              backgroundColor: `${app.color}20`,
              border: `1px solid ${app.color}35`,
            }}
          >
            <app.Mark size={11} />
          </div>
        ))}
      </div>

      {/* User message bubble — orange accent background */}
      <div className="flex flex-col items-end px-4 pt-3">
        <div
          className="rounded-2xl px-3 py-2 text-[11px] font-medium leading-tight text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {t("hero.phoneUserMsg")}
        </div>
      </div>

      {/* IM input bar — makes phone look like a real chat app */}
      <div className="mt-auto flex items-center gap-1.5 border-t border-[var(--border)]/40 px-3 py-2">
        {/* Input field */}
        <div
          className="flex-1 rounded-lg border border-[var(--border)]/50 bg-[var(--surface)]/60 px-2 py-1 text-[9px] text-[var(--muted)]"
        >
          <span className="opacity-60">{t("hero.phoneInputPlaceholder")}</span>
        </div>
        {/* Send button */}
        <div
          className="flex h-[20px] w-[20px] items-center justify-center rounded-md"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Home indicator */}
      <div className="flex justify-center pb-1.5">
        <span className="h-[3px] w-[40px] rounded-full bg-[var(--border)]" />
      </div>
    </div>
  );
}

/** Central TypeBridge node */
function BridgeNode() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <img
          src="/typebridge.png"
          alt=""
          className="animate-breathe-glow h-14 w-14 rounded-2xl shadow-[0_8px_32px_-8px_var(--accent-glow)]"
          aria-hidden
        />
      </div>
      <span className="whitespace-nowrap text-[15px] font-extrabold tracking-tight text-[var(--text)]">
        TypeBridge
      </span>
    </div>
  );
}

/** Monitor with typing-window inside */
function MonitorNode() {
  const { t } = useT();

  return (
    <div className="flex flex-col items-center">
      {/* Monitor body */}
      <div
        className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/90 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.4)] backdrop-blur-md"
        style={{ width: "160px", height: "110px" }}
        aria-hidden
      >
        {/* Window title bar */}
        <div className="flex items-center gap-1.5 border-b border-[var(--border)]/60 px-3 py-1.5">
          <span className="h-[5px] w-[5px] rounded-full bg-[#ff5f57]" />
          <span className="h-[5px] w-[5px] rounded-full bg-[#febc2e]" />
          <span className="h-[5px] w-[5px] rounded-full bg-[#28c840]" />
        </div>
        {/* Typing content — nowrap to prevent English wrapping */}
        <div className="flex items-center overflow-hidden px-3 py-2.5">
          <span className="whitespace-nowrap font-mono text-[11px] leading-none text-[var(--text)]">
            {t("hero.desktopText")}
          </span>
          <span className="animate-blink-cursor ml-0.5 inline-block h-3 w-[2px] rounded-full bg-[var(--accent)]" />
        </div>
      </div>
      {/* Monitor stand */}
      <div className="flex flex-col items-center">
        <div className="h-3 w-6 rounded-b-none border-x border-b border-[var(--border)]/60 bg-[var(--surface)]/70" />
        <div className="h-1.5 w-10 rounded-b-sm border border-[var(--border)]/60 bg-[var(--surface)]/70" />
      </div>
    </div>
  );
}

/** ConceptBanner — phone → bridge → monitor, flex layout for symmetry */
function ConceptBanner() {
  return (
    <div className="noise relative mt-10 h-[340px] w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-sm sm:h-[360px] md:h-[380px]">
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Three nodes + equal-width line separators */}
      <div className="relative flex h-full items-center px-[6%] md:px-[8%]">
        <PhoneNode />

        {/* Line 1: phone → bridge */}
        <div className="flex-1 flex items-center px-3">
          <div
            className="w-full h-[1px]"
            style={{
              background: "linear-gradient(to right, transparent 0%, var(--accent) 18%, var(--accent) 82%, transparent 100%)",
              opacity: 0.4,
            }}
          />
        </div>

        <BridgeNode />

        {/* Line 2: bridge → monitor */}
        <div className="flex-1 flex items-center px-3">
          <div
            className="w-full h-[1px]"
            style={{
              background: "linear-gradient(to right, transparent 0%, var(--accent) 18%, var(--accent) 82%, transparent 100%)",
              opacity: 0.4,
            }}
          />
        </div>

        <MonitorNode />
      </div>

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, var(--bg) 120%)",
          opacity: 0.35,
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────
// Hero section
// ────────────────────────────────────────────

export function Hero() {
  const { t } = useT();

  return (
    <section
      id="hero"
      className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 pb-20 pt-24 md:pt-32"
    >
      {/* Ambient glow — large orb behind content */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--accent-glow), transparent 65%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Giant brand mark + wordmark */}
        <div className="animate-fade-up animate-breathe-glow mx-auto mb-10 inline-flex items-center">
          <BrandWordmark
            gradient
            gradientId="hero-brand-grad"
            markSize={72}
            gapClassName="gap-3 md:gap-4"
            textClassName="text-[44px] md:text-[60px] font-extrabold tracking-tight"
          />
        </div>

        {/* Main headline */}
        <h1
          className="animate-fade-up text-[40px] font-extrabold leading-[1.05] tracking-tight md:text-[72px] lg:text-[84px]"
          style={{ animationDelay: "180ms" }}
        >
          {t("hero.headline")}
        </h1>

        {/* Subtitle */}
        <p
          className="animate-fade-up mx-auto mt-6 max-w-2xl text-balance text-base text-[var(--muted)] md:text-lg"
          style={{ animationDelay: "260ms" }}
        >
          {renderMarked(t("hero.subtitle"), "hero-sub")}
        </p>

        {/* CTA */}
        <div
          className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "340ms" }}
        >
          <a
            href="#download"
            className="group inline-flex items-center gap-2 rounded-xl bg-accent-gradient px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_32px_-8px_var(--accent-glow)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Download size={16} strokeWidth={2.2} />
            {t("hero.ctaDownload")}
          </a>
          <a
            href="#flow"
            className="group inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-6 py-3 text-sm font-medium text-[var(--text)] backdrop-blur-sm transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
          >
            {t("hero.ctaHowto")}
            <ArrowDown
              size={15}
              strokeWidth={2}
              className="transition-transform group-hover:translate-y-0.5"
            />
          </a>
        </div>
      </div>

      {/* Concept banner */}
      <div
        className="animate-fade-up relative z-10 mx-auto mt-12 w-full max-w-5xl"
        style={{ animationDelay: "420ms" }}
      >
        <ConceptBanner />
      </div>
    </section>
  );
}
