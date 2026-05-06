"use client";

import {
  Apple,
  Check,
  Copy,
  Cpu,
  Download as DownloadIcon,
  KeyRound,
  Shield,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { useT, renderMarked } from "../lib/i18n";
import { Footer } from "./footer";

function DownloadCard({
  arch,
  label,
  chip,
  Mark,
}: {
  arch: "arm64" | "x64";
  label: string;
  chip: string;
  Mark: React.ComponentType<{ size?: number }>;
}) {
  return (
    <a
      href={`/dl/${arch}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-[0_12px_32px_-8px_var(--accent-glow)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(400px circle at var(--x, 50%) var(--y, 50%), var(--accent-glow), transparent 55%)",
          filter: "blur(8px)",
        }}
      />
      <div className="relative flex flex-1 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-2)]">
          <Mark size={22} />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
            {label}
          </div>
          <div className="text-xs text-[var(--muted)] whitespace-nowrap">{chip}</div>
        </div>
      </div>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-gradient text-white shadow-[0_4px_12px_-2px_var(--accent-glow)] transition-all group-hover:shadow-[0_6px_20px_-2px_var(--accent-glow)] group-hover:scale-110">
        <DownloadIcon size={18} strokeWidth={2.4} />
      </div>
    </a>
  );
}

export function Download() {
  const { t } = useT();

  return (
    <section
      id="download"
      className="relative flex min-h-screen flex-col overflow-hidden px-6 pt-8 md:pt-12"
    >
      {/* Decorative orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--accent-glow), transparent 65%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
        {/* Header */}
        <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
          {t("download.heading")}
        </h2>

        <div className="mt-10 inline-grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DownloadCard
            arch="arm64"
            label={t("download.appleSilicon")}
            chip={t("download.appleSiliconChip")}
            Mark={({ size = 22 }: { size?: number }) => (
              <Apple
                size={size}
                strokeWidth={1.6}
                className="text-[var(--text)]"
              />
            )}
          />
          <DownloadCard
            arch="x64"
            label={t("download.intel")}
            chip={t("download.intelChip")}
            Mark={({ size = 22 }: { size?: number }) => (
              <Cpu
                size={size}
                strokeWidth={1.6}
                className="text-[var(--text)]"
              />
            )}
          />
        </div>

        {/* Post-install notices */}
        <div className="mt-12 space-y-8 text-left">
          <GatekeeperNotice />
          <AccessibilityNotice />
        </div>
      </div>

      <Footer />
    </section>
  );
}

const QUARANTINE_CMD = "xattr -rd com.apple.quarantine /Applications/TypeBridge.app";

function SectionHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Shield;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-2)]">
        <Icon size={16} strokeWidth={1.8} className="text-[var(--accent)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
          {children}
        </p>
      </div>
    </div>
  );
}

/** Parallel section #1 — Gatekeeper bypass (unsigned app) */
function GatekeeperNotice() {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(QUARANTINE_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div>
      <SectionHeader icon={Shield} title={t("download.gatekeeperTitle")}>
        {renderMarked(t("download.gatekeeperDesc"), "gk")}
      </SectionHeader>

      {/* Two method boxes */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Method A — GUI */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/50 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-gradient px-1.5 text-[10px] font-bold text-white">
              A
            </span>
            <p className="text-[13px] font-semibold text-[var(--text)]">
              {t("download.methodA.title")}
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
            {renderMarked(t("download.methodA.desc"), "ma")}
          </p>
        </div>

        {/* Method B — CLI */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/50 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-gradient px-1.5 text-[10px] font-bold text-white">
              B
            </span>
            <p className="text-[13px] font-semibold text-[var(--text)]">
              {t("download.methodB.title")}
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
            {t("download.methodB.desc")}
          </p>
          <div className="relative mt-3">
            <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-2.5 pr-16 font-mono text-[11.5px] leading-relaxed text-[var(--text)]">
              <Terminal
                size={13}
                strokeWidth={1.8}
                className="mt-0.5 shrink-0 text-[var(--subtle)]"
              />
              <code className="min-w-0 flex-1 break-all">{QUARANTINE_CMD}</code>
            </div>
            <button
              type="button"
              onClick={copyCmd}
              className="absolute right-1.5 top-1.5 inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--muted)] shadow-sm transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
              aria-label={copied ? t("download.copiedButton") : t("download.copyButton")}
            >
              {copied ? (
                <>
                  <Check
                    size={12}
                    strokeWidth={2.4}
                    className="text-[var(--accent)]"
                  />
                  {t("download.copiedButton")}
                </>
              ) : (
                <>
                  <Copy size={12} strokeWidth={2} />
                  {t("download.copyButton")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Parallel section #2 — Accessibility permission runtime requirement */
function AccessibilityNotice() {
  const { t } = useT();
  return (
    <div>
      <SectionHeader icon={KeyRound} title={t("download.accessibilityTitle")}>
        {renderMarked(t("download.accessibilityDesc"), "ax")}
      </SectionHeader>
    </div>
  );
}
