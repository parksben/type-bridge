"use client";

import { ArrowDown, Download, Globe, Mic } from "lucide-react";
import { useT, renderMarked } from "../lib/i18n";
import { BrandMark, BrandWordmark } from "./logo";

// ────────────────────────────────────────────
// Channel icons — match the ones used in the desktop app
// (see src/components/ChannelIcon.tsx + src/assets/icons/)
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

/** 钉钉 — ant-design icons 单色 SVG（app/assets/icons/dingtalk.svg） */
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

/** 企微 — tdesign icons 单色 SVG（app/assets/icons/wecom.svg） */
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
// Concept banner — 4 inputs → bridge node → desktop
// All x/y positions expressed in percentages of the banner box so
// the SVG arc endpoints align exactly with the HTML badges.
// ────────────────────────────────────────────

type ChannelNode = {
  label: string;
  color: string;
  delayMs: number;
  Mark: (props: { size?: number }) => React.ReactNode;
};

function makeChannels(t: (key: string) => string): ChannelNode[] {
  return [
    {
      label: t("channel.voice"),
      color: "#c084fc",
      delayMs: 0,
      Mark: ({ size = 20 }) => (
        <Mic size={size} strokeWidth={1.8} style={{ color: "#c084fc" }} />
      ),
    },
    {
      label: t("channel.feishu"),
      color: "#3370FF",
      delayMs: 180,
      Mark: ({ size = 22 }) => <FeishuMark size={size} />,
    },
    {
      label: t("channel.dingtalk"),
      color: "#0089FF",
      delayMs: 360,
      Mark: ({ size = 22 }) => <DingTalkMark size={size} />,
    },
    {
      label: t("channel.wecom"),
      color: "#06BA6A",
      delayMs: 540,
      Mark: ({ size = 22 }) => <WecomMark size={size} />,
    },
  ];
}

// Geometry — used by both badges and SVG arcs so they stay aligned.
// All values are percentages of the banner (matches SVG viewBox 0 0 100 100 + preserveAspectRatio="none").
const BADGE_LEFT_PCT = 9;
const BRIDGE_X_PCT = 52;
const BRIDGE_Y_PCT = 50;
const DESKTOP_ANCHOR_X_PCT = 84;

function badgeTopPct(i: number, total: number) {
  // Spread across [20%, 80%]
  return 20 + (60 / (total - 1)) * i;
}

function ChannelBadge({
  channel,
  index,
  total,
}: {
  channel: ChannelNode;
  index: number;
  total: number;
}) {
  return (
    <div
      // 用 calc(BADGE_LEFT_PCT% - 22px) 让 icon 左边缘 - 22px，即 icon 中心精确对到 BADGE_LEFT_PCT%。
      // 这样不同 label 长度的 badge，icon 的 x 坐标完全一致（左侧居左对齐）。
      className="absolute flex -translate-y-1/2 items-center gap-2"
      style={{
        top: `${badgeTopPct(index, total)}%`,
        left: `calc(${BADGE_LEFT_PCT}% - 22px)`,
      }}
    >
      <div className="relative">
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
  // 直接复用 app 的 typebridge.png（橙渐变方块 + 白 N，与桌面端一致）。
  // icon 是 64×64；top 上偏 32px，让 icon 中心落在 BRIDGE_Y_PCT。
  return (
    <div
      className="absolute flex -translate-x-1/2 flex-col items-center gap-3"
      style={{
        left: `${BRIDGE_X_PCT}%`,
        top: `calc(${BRIDGE_Y_PCT}% - 32px)`,
      }}
    >
      <div className="relative h-16 w-16">
        <img
          src="/typebridge.png"
          alt=""
          className="h-16 w-16 rounded-2xl shadow-[0_8px_32px_-8px_var(--accent-glow)]"
          aria-hidden
        />
      </div>
      <span className="whitespace-nowrap text-[18px] font-extrabold tracking-tight text-[var(--text)] md:text-[22px]">
        TypeBridge
      </span>
    </div>
  );
}

function DesktopFrame() {
  const { t } = useT();
  return (
    <div
      className="absolute right-3 top-1/2 w-[200px] -translate-y-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/85 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.4)] backdrop-blur-sm sm:right-4 sm:w-[230px]"
      aria-hidden
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)]/60 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]" />
      </div>

      <div className="flex h-[92px] items-center px-4">
        <span className="font-mono text-[12px] leading-none text-[var(--text)]">
          {t("hero.desktopText")}
        </span>
        <span className="ml-0.5 inline-block h-3.5 w-[2px] rounded-full bg-[var(--accent)]" />
      </div>
    </div>
  );
}

function ConceptBanner() {
  const { t } = useT();
  const CHANNELS = makeChannels(t);
  const total = CHANNELS.length;

  return (
    <div className="noise relative mt-10 h-[280px] w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/40 backdrop-blur-sm sm:h-[320px] md:h-[360px]">
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* SVG overlay — arcs from each badge into the bridge, plus bridge→desktop line.
          viewBox 0 0 100 100 + preserveAspectRatio="none" means each unit = 1% of banner box.
          Two-layer pattern per path:
            (a) thin static "track" — solid accent at low opacity
            (b) bright "sweep" overlay with strokeDasharray + animated strokeDashoffset
                creating a single short bright pulse traveling along the path. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          {CHANNELS.map((ch, i) => {
            const y = badgeTopPct(i, total);
            const d = `M ${BADGE_LEFT_PCT} ${y} C ${BRIDGE_X_PCT - 18} ${y}, ${BRIDGE_X_PCT - 8} ${BRIDGE_Y_PCT}, ${BRIDGE_X_PCT - 2} ${BRIDGE_Y_PCT}`;
            return <path key={ch.label} id={`hero-arc-path-${i}`} d={d} />;
          })}
          <path
            id="hero-output-path"
            d={`M ${BRIDGE_X_PCT + 2} ${BRIDGE_Y_PCT} L ${DESKTOP_ANCHOR_X_PCT} ${BRIDGE_Y_PCT}`}
          />
        </defs>

        {/* (a) Static thin track lines — solid accent, very low opacity */}
        {CHANNELS.map((_, i) => (
          <use
            key={`track-${i}`}
            href={`#hero-arc-path-${i}`}
            stroke="var(--accent)"
            strokeOpacity="0.18"
            strokeWidth="1"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <use
          href="#hero-output-path"
          stroke="var(--accent)"
          strokeOpacity="0.22"
          strokeWidth="1"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />

        {/* (b) Sweep overlay removed — concept image is fully static. */}
      </svg>

      {/* Channel badges */}
      {CHANNELS.map((ch, i) => (
        <ChannelBadge key={ch.label} channel={ch} index={i} total={total} />
      ))}

      {/* Central bridge node */}
      <BridgeNode />

      {/* Desktop window */}
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
