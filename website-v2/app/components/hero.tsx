"use client";

import { ArrowDown, Download, Globe } from "lucide-react";
import { BrandMark } from "./logo";

// ────────────────────────────────────────────
// IM official logo SVGs — shared with old site
// ────────────────────────────────────────────

function FeishuMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" width={size} height={size}>
      <g fillRule="evenodd" clipRule="evenodd" fill="#3370FF">
        <path d="M41.0716 5.99409L3.31071 16.5187L12.3856 25.8126L20.7998 25.9594L30.4827 16.5187C30.2266 15.9943 30.0985 15.5552 30.0985 15.2013C30.0985 14.4074 30.4104 13.7786 30.8947 13.333C31.7241 12.57 32.7222 12.4558 33.8889 12.9905L41.0716 5.99409Z" />
        <path d="M42.1021 6.72842L31.5775 44.4893L22.2836 35.4144L22.1367 27.0002L31.5115 17.4816C32.0195 17.8454 32.5743 18.0105 33.1759 17.9769C34.0784 17.9264 34.6614 17.3813 34.9349 17.0602C35.2083 16.7392 35.5293 16.2051 35.5025 15.4113C35.4847 14.8821 35.3109 14.3941 34.9812 13.9472L42.1021 6.72842Z" />
      </g>
    </svg>
  );
}

function DingTalkMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size}>
      <path
        fill="#0089FF"
        d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1c-5 61.1 33.6 160.5 53.6 182.8c19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8c11.4 61.7 64.9 131.8 107.2 138.4c42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8c-33.1 12.5 24 62.6 24 62.6c84.7 76.8 129.7 50.5 129.7 50.5c33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8c17-71.3-114.5-99.4-265.8-154.5"
      />
    </svg>
  );
}

function WecomMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        fill="#06BA6A"
        d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213c0 .163.13.295.29.295a.33.33 0 0 0 .167-.054l1.903-1.114a.86.86 0 0 1 .717-.098a10.2 10.2 0 0 0 2.837.403c.276 0 .543-.027.811-.05c-.857-2.578.157-4.972 1.932-6.446c1.703-1.415 3.882-1.98 5.853-1.838c-.576-3.583-4.196-6.348-8.596-6.348M5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178a1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18m5.34 2.867c-1.797-.052-3.746.512-5.28 1.786c-1.72 1.428-2.687 3.72-1.78 6.22c.942 2.453 3.666 4.229 6.884 4.229c.826 0 1.622-.12 2.361-.336a.72.72 0 0 1 .598.082l1.584.926a.3.3 0 0 0 .14.047c.134 0 .24-.111.24-.247c0-.06-.023-.12-.038-.177l-.327-1.233a.6.6 0 0 1-.023-.156a.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983a.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983a.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"
      />
    </svg>
  );
}

// ────────────────────────────────────────────
// Concept banner — 4 inputs → bridge node → desktop
// ────────────────────────────────────────────

type ChannelNode = {
  label: string;
  color: string;
  delayMs: number;
  Mark: (props: { size?: number }) => React.ReactNode;
};

const CHANNELS: ChannelNode[] = [
  {
    label: "WebChat",
    color: "#c084fc",
    delayMs: 0,
    Mark: ({ size = 20 }) => (
      <Globe size={size} strokeWidth={1.8} style={{ color: "#c084fc" }} />
    ),
  },
  {
    label: "飞书",
    color: "#3370FF",
    delayMs: 180,
    Mark: ({ size = 22 }) => <FeishuMark size={size} />,
  },
  {
    label: "钉钉",
    color: "#0089FF",
    delayMs: 360,
    Mark: ({ size = 22 }) => <DingTalkMark size={size} />,
  },
  {
    label: "企微",
    color: "#06BA6A",
    delayMs: 540,
    Mark: ({ size = 22 }) => <WecomMark size={size} />,
  },
];

function ChannelBadge({
  channel,
  index,
  total,
}: {
  channel: ChannelNode;
  index: number;
  total: number;
}) {
  // Distribute badges vertically across container
  const topPct = (100 / (total + 1)) * (index + 1);
  return (
    <div
      className="absolute left-0 flex -translate-y-1/2 items-center gap-2"
      style={{ top: `${topPct}%`, animation: `fade-up 700ms ${channel.delayMs}ms both ease-out` }}
    >
      <div className="relative">
        <span
          className="absolute inset-0 rounded-2xl"
          style={{
            animation: `pulse-ring 2.8s ${channel.delayMs}ms ease-out infinite`,
            boxShadow: `0 0 0 2px ${channel.color}66`,
          }}
        />
        <div
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur-sm"
          style={{
            borderColor: `${channel.color}44`,
            backgroundColor: `${channel.color}1a`,
            boxShadow: `0 0 24px ${channel.color}30`,
          }}
        >
          <channel.Mark size={20} />
        </div>
      </div>
      <span
        className="hidden text-[10px] font-semibold uppercase tracking-widest sm:inline"
        style={{ color: channel.color }}
      >
        {channel.label}
      </span>
    </div>
  );
}

function BridgeNode() {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="animate-breathe-glow relative flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-gradient text-white shadow-[0_8px_32px_-8px_var(--accent-glow)]">
        <BrandMark size={32} className="text-white" />
      </div>
      <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
        TypeBridge
      </span>
    </div>
  );
}

function DesktopFrame() {
  return (
    <div
      className="animate-float-soft absolute right-2 top-1/2 w-[180px] -translate-y-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 shadow-[0_12px_48px_-12px_var(--accent-glow)] backdrop-blur-sm sm:w-[220px]"
      aria-hidden
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)]/60 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[9px] font-medium tracking-wide text-[var(--subtle)]">
          你的编辑器
        </span>
      </div>
      <div className="space-y-1.5 px-3 py-3">
        <div className="h-1.5 w-3/4 rounded bg-[var(--border-strong)]/70" />
        <div className="h-1.5 w-1/2 rounded bg-[var(--border-strong)]/50" />
        <div className="relative mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-2)]/80 px-2 py-2">
          <div
            className="h-2 rounded bg-accent-gradient"
            style={{ animation: "type-cursor 4.2s ease-in-out infinite" }}
          />
          <span className="animate-blink-cursor absolute right-2 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent)]" />
        </div>
      </div>
    </div>
  );
}

function ConceptBanner() {
  const channelCount = CHANNELS.length;
  return (
    <div className="noise relative mt-10 h-[260px] w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-sm sm:h-[300px] md:h-[340px]">
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Left: channel badges */}
      <div className="absolute inset-y-0 left-3 w-32 sm:left-6 sm:w-40">
        {CHANNELS.map((ch, i) => (
          <ChannelBadge
            key={ch.label}
            channel={ch}
            index={i}
            total={channelCount}
          />
        ))}
      </div>

      {/* Bridge arcs — SVG spanning the middle */}
      <svg
        className="absolute inset-y-0 left-24 right-[210px] h-full w-[calc(100%-24px-210px-24px)] max-w-none sm:left-44 sm:right-[240px] sm:w-[calc(100%-44px-240px-24px)]"
        viewBox="0 0 400 400"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="arc-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {/* Fan of 4 arcs from the left band into the center-right bridge node */}
        {[60, 140, 220, 300].map((y, i) => (
          <g key={y}>
            <path
              d={`M 0 ${y} C 120 ${y}, 240 200, 380 200`}
              fill="none"
              stroke="url(#arc-fade)"
              strokeWidth="1.6"
              strokeDasharray="4 6"
              style={{
                animation: `arc-flow 3.5s ${i * 0.25}s linear infinite`,
              }}
            />
            <path
              d={`M 0 ${y} C 120 ${y}, 240 200, 380 200`}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.12"
              strokeWidth="4"
            />
          </g>
        ))}
      </svg>

      {/* Particles — subtle glowing dots streaking across */}
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="pointer-events-none absolute left-24 sm:left-44"
          style={{
            top: `${15 + i * 18}%`,
            right: "240px",
            height: "4px",
            width: "4px",
            borderRadius: "9999px",
            backgroundColor: i % 2 === 0 ? "var(--accent)" : "var(--accent-2)",
            boxShadow: `0 0 10px 2px ${
              i % 2 === 0 ? "var(--accent-glow)" : "rgba(192,132,252,0.4)"
            }`,
            animation: `particle-travel ${3.2 + i * 0.35}s ${i * 0.4}s linear infinite`,
          }}
        />
      ))}

      {/* Center bridge node */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="relative h-full w-full">
          {/* position the bridge node at ~ right-third so it aligns with arc ends */}
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: "calc(100% - 290px)" }}
          >
            <BridgeNode />
          </div>
        </div>
      </div>

      {/* Right: desktop window */}
      <DesktopFrame />

      {/* Vignette to blend edges */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, var(--bg) 120%)",
          opacity: 0.4,
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────
// Hero section
// ────────────────────────────────────────────

export function Hero() {
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
        {/* Giant brand mark (animated breathing) */}
        <div className="animate-fade-up animate-breathe-glow mx-auto mb-8 inline-block">
          <BrandMark size={72} gradient gradientId="hero-brand-grad" />
        </div>

        {/* Eyebrow */}
        <p
          className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-1.5 text-xs font-medium tracking-[0.2em] text-[var(--muted)] backdrop-blur-sm"
          style={{ animationDelay: "100ms" }}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
          />
          让手机成为桌面输入设备
        </p>

        {/* Main headline */}
        <h1
          className="animate-fade-up mt-6 text-[48px] font-extrabold leading-[1.05] tracking-tight md:text-[88px] lg:text-[104px]"
          style={{ animationDelay: "180ms" }}
        >
          手机
          <span className="text-accent-gradient">即键盘</span>
          <span className="text-[var(--text)]">。</span>
        </h1>

        {/* Subtitle */}
        <p
          className="animate-fade-up mx-auto mt-6 max-w-2xl text-balance text-base text-[var(--muted)] md:text-lg"
          style={{ animationDelay: "260ms" }}
        >
          你的<strong className="font-semibold text-[var(--text)]">飞书 / 钉钉 / 企业微信 / 本地 WebChat</strong>
          ，正在变成桌面最快的输入法。手机说一句，桌面就写一句——文本、图片、图文混合，
          一条消息直达编辑器 / 终端 / 浏览器输入框。
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
            免费下载
          </a>
          <a
            href="#flow"
            className="group inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-6 py-3 text-sm font-medium text-[var(--text)] backdrop-blur-sm transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
          >
            了解原理
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
