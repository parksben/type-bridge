"use client";

import {
  ArrowDown,
  Download,
  Zap,
  Image,
  Keyboard,
  History,
  Monitor,
  Shield,
  MessageSquareText,
  MousePointerClick,
  GitFork,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";

function AppScreenshot() {
  return (
    <div className="relative w-full max-w-[680px] mx-auto">
      {/* Browser-style window chrome */}
      <div className="rounded-xl overflow-hidden border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] shadow-2xl shadow-black/10">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 text-center text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)]">
            TypeBridge
          </div>
        </div>
        {/* Screenshot placeholder */}
        <div className="aspect-[16/10] bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 flex items-center justify-center relative overflow-hidden">
          {/* Decorative UI mockup skeleton */}
          <div className="absolute inset-0 flex">
            {/* Left sidebar skeleton */}
            <div className="w-[18%] border-r border-[var(--color-border)] dark:border-[var(--color-border-dark)] p-3 flex flex-col gap-2">
              <div className="h-3 w-3/4 rounded bg-orange-200/50 dark:bg-orange-800/30" />
              <div className="h-2 w-2/3 rounded bg-gray-200 dark:bg-gray-800 ml-2" />
              <div className="h-2 w-2/3 rounded bg-gray-200 dark:bg-gray-800 ml-2" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-3" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-1" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-1" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-1" />
            </div>
            {/* Main content skeleton */}
            <div className="flex-1 p-4 flex flex-col gap-3">
              <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-8 w-2/3 rounded bg-gray-100 dark:bg-gray-800/50" />
              <div className="h-8 w-1/2 rounded bg-gray-100 dark:bg-gray-800/50" />
              <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-800 mt-2" />
              <div className="h-2 w-3/4 rounded bg-gray-100 dark:bg-gray-800/30 mt-1" />
              <div className="h-2 w-2/3 rounded bg-gray-100 dark:bg-gray-800/30" />
              {/* Card skeleton */}
              <div className="mt-3 border border-[var(--color-border)] dark:border-[var(--color-border-dark)] rounded-lg p-3">
                <div className="flex justify-between">
                  <div className="h-2 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-2 w-12 rounded bg-orange-200/50 dark:bg-orange-800/30" />
                </div>
                <div className="h-2 w-2/3 rounded bg-gray-100 dark:bg-gray-800/30 mt-2" />
              </div>
            </div>
          </div>
          {/* Center overlay hint */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-[var(--color-surface)]/90 dark:bg-[var(--color-surface-dark)]/90 backdrop-blur-sm px-5 py-2.5 rounded-full border border-[var(--color-border)] dark:border-[var(--color-border-dark)] shadow-sm">
              <p className="text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)]">
                🖼 App screenshot — replace with actual TypeBridge window
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Glow behind the card */}
      <div className="absolute -inset-4 -z-10 glow-orange opacity-40 rounded-2xl" />
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  delay: number;
}) {
  return (
    <div
      className={`group p-6 rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] hover:border-orange-300 dark:hover:border-orange-800 transition-all duration-300 animate-fade-up`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
        <Icon size={20} className="text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
      </div>
      <h3 className="font-semibold text-[15px] mb-1.5">{title}</h3>
      <p className="text-sm text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] leading-relaxed">
        {desc}
      </p>
    </div>
  );
}

function StepItem({
  step,
  icon: Icon,
  title,
  desc,
  delay,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  desc: string;
  delay: number;
}) {
  return (
    <div
      className="flex flex-col items-center text-center animate-fade-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center mb-4 relative">
        <Icon size={24} className="text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]" />
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--color-accent)] dark:bg-[var(--color-accent-dark)] text-white text-xs flex items-center justify-center font-semibold">
          {step}
        </span>
      </div>
      <h3 className="font-semibold text-[15px] mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] max-w-[220px]">
        {desc}
      </p>
    </div>
  );
}

export default function HomePage() {
  const [version, setVersion] = useState<string>("...");

  useEffect(() => {
    fetch("https://api.github.com/repos/parksben/type-bridge/releases/latest")
      .then((r) => r.json())
      .then((data) => {
        if (data.tag_name) setVersion(data.tag_name.replace(/^v/, ""));
      })
      .catch(() => setVersion("latest"));
  }, []);

  return (
    <div className="min-h-screen noise-bg">
      {/* ============ HERO ============ */}
      <section className="relative px-6 pt-24 pb-16 md:pt-32 md:pb-20 overflow-hidden">
        <div className="absolute inset-0 glow-orange opacity-50" />
        <div className="max-w-5xl mx-auto relative z-10">
          {/* Badge */}
          <div className="flex justify-center mb-6 animate-fade-up">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-orange-50 dark:bg-orange-950/50 text-[var(--color-accent)] dark:text-[var(--color-accent-dark)] border border-orange-200 dark:border-orange-900/50">
              macOS 13+
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-center mb-6 animate-fade-up animate-delay-1">
            <span className="block text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08]">
              Speak via Feishu,
            </span>
            <span className="block text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mt-1">
              Type{" "}
              <span className="font-brand text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]">
                Anywhere
              </span>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-center max-w-xl mx-auto mb-8 text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] text-base md:text-lg leading-relaxed animate-fade-up animate-delay-2">
            Forward Feishu bot messages directly into your desktop input field —{" "}
            <strong className="text-[var(--color-text)] dark:text-[var(--color-text-dark)]">
              voice, text, or images
            </strong>
            . A macOS menu bar app that bridges your phone and your Mac.
          </p>

          {/* CTA */}
          <div className="flex justify-center gap-3 mb-12 animate-fade-up animate-delay-3">
            <a
              href="/download/arm64"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-accent)] dark:bg-[var(--color-accent-dark)] text-white font-semibold text-sm hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-500/20"
            >
              <Download size={17} />
              Download for macOS
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] font-medium text-sm hover:bg-[var(--color-surface)] dark:hover:bg-[var(--color-surface-dark)] transition-all"
            >
              Learn more
              <ArrowDown size={15} />
            </a>
          </div>

          {/* App Screenshot */}
          <div className="animate-fade-up animate-delay-4">
            <AppScreenshot />
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
              How it{" "}
              <span className="font-brand text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]">
                Works
              </span>
            </h2>
            <p className="text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] max-w-md mx-auto">
              Three simple steps from your phone to your desktop
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop only) */}
            <div className="hidden md:block absolute top-7 left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] h-[2px] bg-gradient-to-r from-orange-300 via-orange-200 to-orange-300 dark:from-orange-800 dark:via-orange-700 dark:to-orange-800" />
            <StepItem
              step={1}
              icon={MessageSquareText}
              title="Send a Message"
              desc="Send text, voice, or images to your Feishu bot from any device"
              delay={0.1}
            />
            <StepItem
              step={2}
              icon={Zap}
              title="TypeBridge Receives"
              desc="The app receives your message in real-time via Feishu WebSocket"
              delay={0.2}
            />
            <StepItem
              step={3}
              icon={MousePointerClick}
              title="Instant Paste"
              desc="Content is pasted into your focused input field automatically"
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="px-6 py-20 md:py-28 bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] border-y border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
              Built for{" "}
              <span className="font-brand text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]">
                Speed
              </span>
            </h2>
            <p className="text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] max-w-md mx-auto">
              Every detail designed to get your message where it needs to go
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Zap}
              title="Real-time Injection"
              desc="Messages appear in your focused input field within milliseconds of arrival. No copy-paste, no switching windows."
              delay={0.1}
            />
            <FeatureCard
              icon={Image}
              title="Text + Images"
              desc="Supports text, images, and mixed content. Images are downloaded and pasted just like text — works in any app."
              delay={0.15}
            />
            <FeatureCard
              icon={Keyboard}
              title="Auto-Submit"
              desc="Optionally auto-press Enter after injection. One tap on your phone sends the message — no need to touch your keyboard."
              delay={0.2}
            />
            <FeatureCard
              icon={History}
              title="Message History"
              desc="Browse, copy, or delete up to 500 recent messages. Everything stays local — your data never leaves your machine."
              delay={0.25}
            />
            <FeatureCard
              icon={Monitor}
              title="Menu Bar Native"
              desc="Lives quietly in your macOS menu bar. Zero dock presence, minimal CPU, always ready when you need it."
              delay={0.3}
            />
            <FeatureCard
              icon={Shield}
              title="Privacy First"
              desc="All credentials and history stored locally. No cloud sync, no telemetry, no analytics. Your messages are yours."
              delay={0.35}
            />
          </div>
        </div>
      </section>

      {/* ============ DOWNLOAD ============ */}
      <section className="px-6 py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
            Ready to{" "}
            <span className="font-brand text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]">
              Bridge
            </span>
            ?
          </h2>
          <p className="text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] mb-10">
            Latest version{" "}
            <span className="font-mono text-sm bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] px-2 py-0.5 rounded border border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
              v{version}
            </span>
            {" "}for macOS 13+
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="/download/arm64"
              className="flex-1 max-w-[260px] mx-auto sm:mx-0 inline-flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] border border-[var(--color-border)] dark:border-[var(--color-border-dark)] hover:border-orange-300 dark:hover:border-orange-800 transition-all group"
            >
              <div className="text-left">
                <div className="font-semibold text-sm">Apple Silicon</div>
                <div className="text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)]">
                  M1 / M2 / M3 / M4
                </div>
              </div>
              <Download
                size={18}
                className="text-[var(--color-accent)] dark:text-[var(--color-accent-dark)] group-hover:translate-y-0.5 transition-transform"
              />
            </a>

            <a
              href="/download/x64"
              className="flex-1 max-w-[260px] mx-auto sm:mx-0 inline-flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] border border-[var(--color-border)] dark:border-[var(--color-border-dark)] hover:border-orange-300 dark:hover:border-orange-800 transition-all group"
            >
              <div className="text-left">
                <div className="font-semibold text-sm">Intel</div>
                <div className="text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)]">
                  x86_64
                </div>
              </div>
              <Download
                size={18}
                className="text-[var(--color-accent)] dark:text-[var(--color-accent-dark)] group-hover:translate-y-0.5 transition-transform"
              />
            </a>
          </div>

          {/* Accessiblity hint */}
          <div className="mt-8 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 text-left">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 mt-0.5">
                <Shield size={16} className="text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium mb-1 text-amber-800 dark:text-amber-300">
                  First-time setup
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400/80 leading-relaxed">
                  After downloading, macOS may block the app because it&apos;s not signed. 
                  Go to <strong>System Settings → Privacy & Security</strong> and click &quot;Open Anyway&quot;. 
                  Then grant <strong>Accessibility</strong> permission when prompted to enable message injection.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="px-6 py-10 border-t border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-brand text-lg text-[var(--color-accent)] dark:text-[var(--color-accent-dark)]">
              TypeBridge
            </span>
            <span className="text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)]">
              © {new Date().getFullYear()}
            </span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href="https://github.com/parksben/type-bridge"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] hover:text-[var(--color-accent)] dark:hover:text-[var(--color-accent-dark)] transition-colors"
            >
              <GitFork size={14} />
              GitHub
            </a>
            <a
              href="https://github.com/parksben/type-bridge/blob/main/docs/REQUIREMENTS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] hover:text-[var(--color-accent)] dark:hover:text-[var(--color-accent-dark)] transition-colors"
            >
              <BookOpen size={14} />
              Docs
            </a>
            <a
              href="https://github.com/parksben/type-bridge/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] dark:text-[var(--color-muted-dark)] hover:text-[var(--color-accent)] dark:hover:text-[var(--color-accent-dark)] transition-colors"
            >
              <ExternalLink size={14} />
              Releases
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
