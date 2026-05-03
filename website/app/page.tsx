"use client";

import {
  ArrowDown,
  ArrowRight,
  Download,
  Zap,
  Image,
  Keyboard,
  History,
  Monitor,
  Shield,
  MessageSquareText,
  MousePointerClick,
  BookOpen,
  ArrowLeftRight,
} from "lucide-react";
import { useEffect, useState } from "react";

// ── Hero Banner — animated principle diagram ────────────────────

function HeroBanner() {
  return (
    <div className="hero-banner relative w-full mx-auto select-none overflow-hidden rounded-2xl border border-[var(--tb-border)]"
      style={{ minHeight: "340px" }}
    >
      {/* Dark inner bg for contrast */}
      <div className="absolute inset-0 bg-[#0a0a0f] dark:bg-[#060609]" />

      {/* Grid pattern overlay */}
      <div className="hero-grid-pattern absolute inset-0 opacity-[0.07]" />

      {/* Ambient color orbs */}
      <div className="hero-orb hero-orb-blue" />
      <div className="hero-orb hero-orb-sky" />
      <div className="hero-orb hero-orb-green" />

      {/* ── LEFT: IM sources ── */}
      <div className="absolute left-[8%] md:left-[10%] top-0 bottom-0 flex flex-col items-center justify-center gap-5 md:gap-8 z-10">
        <IMAppIcon name="飞书" color="#3370FF" delay="0s">
          {/* Feishu logo — stylized double-loop */}
          <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
            <path d="M16 4C10 4 5 8 5 14s5 10 11 14c6-4 11-10 11-14S22 4 16 4z" fill="#3370FF" opacity="0.9"/>
            <path d="M16 8c-3 0-6 3-6 7s3 7 6 9c3-2 6-5 6-9s-3-7-6-7z" fill="white" opacity="0.85"/>
            <circle cx="16" cy="14" r="2.5" fill="white"/>
          </svg>
        </IMAppIcon>
        <IMAppIcon name="钉钉" color="#0089FF" delay="0.6s">
          {/* DingTalk logo — hexagon with inner diamond */}
          <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
            <path d="M16 2L4 9v14l12 7 12-7V9L16 2z" fill="#0089FF" opacity="0.9"/>
            <path d="M16 8l-7 4v8l7 4 7-4v-8l-7-4z" fill="white" opacity="0.85"/>
            <path d="M16 12l-3 2v4l3 2 3-2v-4l-3-2z" fill="#0089FF" opacity="0.7"/>
          </svg>
        </IMAppIcon>
        <IMAppIcon name="企微" color="#06BA6A" delay="1.2s">
          {/* WeCom logo — double-arc with center dot */}
          <svg viewBox="0 0 32 32" fill="none" className="w-full h-full">
            <path d="M4 14C4 8 9 4 16 4s12 4 12 10" stroke="#06BA6A" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
            <path d="M4 18c0 6 5 10 12 10s12-4 12-10" stroke="#06BA6A" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
            <circle cx="16" cy="16" r="4" fill="#06BA6A" opacity="0.85"/>
            <circle cx="16" cy="16" r="1.5" fill="white"/>
          </svg>
        </IMAppIcon>
      </div>

      {/* ── CENTER: Bridge arcs + particles ── */}
      <div className="absolute left-[22%] md:left-[24%] right-[18%] md:right-[20%] top-0 bottom-0 overflow-hidden">
        {/* SVG arcs */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 400" preserveAspectRatio="none">
          <defs>
            <linearGradient id="arc-blue" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3370FF" />
              <stop offset="100%" stopColor="#3370FF" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="arc-sky" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0089FF" />
              <stop offset="100%" stopColor="#0089FF" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="arc-green" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06BA6A" />
              <stop offset="100%" stopColor="#06BA6A" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path d="M 0,80 C 80,80 150,150 300,120" fill="none" strokeWidth="1.8" stroke="url(#arc-blue)" className="hero-arc-dash" />
          <path d="M 0,200 C 80,200 150,200 300,200" fill="none" strokeWidth="1.8" stroke="url(#arc-sky)" className="hero-arc-dash hero-arc-dash-delay-1" />
          <path d="M 0,320 C 80,320 150,250 300,280" fill="none" strokeWidth="1.8" stroke="url(#arc-green)" className="hero-arc-dash hero-arc-dash-delay-2" />
          {/* Glow echoes */}
          <path d="M 0,80 C 80,80 150,150 300,120" fill="none" strokeWidth="4" stroke="#3370FF" opacity="0.08" />
          <path d="M 0,200 C 80,200 150,200 300,200" fill="none" strokeWidth="4" stroke="#0089FF" opacity="0.08" />
          <path d="M 0,320 C 80,320 150,250 300,280" fill="none" strokeWidth="4" stroke="#06BA6A" opacity="0.08" />
        </svg>

        {/* Data particles */}
        <HeroParticle color="#3370FF" top="18%" delay="0s" />
        <HeroParticle color="#3370FF" top="20%" delay="1.5s" />
        <HeroParticle color="#0089FF" top="48%" delay="0.3s" />
        <HeroParticle color="#0089FF" top="50%" delay="1.8s" />
        <HeroParticle color="#06BA6A" top="76%" delay="0.6s" />
        <HeroParticle color="#06BA6A" top="78%" delay="2.1s" />

        {/* Bridge center node */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="hero-bridge-node">
            <ArrowLeftRight size={18} className="text-white" />
          </div>
        </div>
      </div>

      {/* ── RIGHT: Desktop target ── */}
      <div className="absolute right-[6%] md:right-[8%] top-1/2 -translate-y-1/2 z-10">
        <div className="hero-desktop-frame animate-float-desktop">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.06]">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            <div className="flex-1 text-center text-[10px] text-white/30 font-medium tracking-wide">TypeBridge</div>
          </div>
          <div className="p-3 space-y-1.5">
            <div className="h-1.5 w-3/4 rounded bg-white/[0.06]" />
            <div className="h-1.5 w-1/2 rounded bg-white/[0.04]" />
            <div className="relative mt-2 px-2.5 py-2 rounded-lg border border-white/[0.12] bg-white/[0.04]">
              <div className="h-1.5 w-4/5 rounded bg-white/25 hero-injected-text" />
              <div className="absolute right-2 top-1 w-[2px] h-3.5 bg-[var(--tb-accent)] animate-blink-cursor rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Scanline overlay */}
      <div className="hero-scanlines absolute inset-0 pointer-events-none" />
    </div>
  );
}

/** IM app icon with glow ring */
function IMAppIcon({ name, color, delay, children }: { name: string; color: string; delay: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-2 animate-fade-up"
      style={{ animationDelay: delay, opacity: 0 }}
    >
      <div className="hero-icon-ring" style={{ borderColor: color, animationDelay: delay }}>
        <div
          className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: color + "15", boxShadow: `0 0 24px 0 ${color}25` }}
        >
          {children}
        </div>
      </div>
      <span className="text-[10px] md:text-xs font-bold tracking-wide text-white/60 uppercase">{name}</span>
    </div>
  );
}

/** Data particle */
function HeroParticle({ color, top, delay }: { color: string; top: string; delay: string }) {
  return (
    <div
      className="hero-flow-particle"
      style={{
        top,
        animationDelay: delay,
        backgroundColor: color,
        boxShadow: `0 0 8px 3px ${color}50`,
      }}
    />
  );
}

// ── Feature card ───────────────────────────────────────────────

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
      className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 animate-fade-up feature-card-glow"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm">
        <Icon size={20} className="text-[var(--tb-accent)]" />
      </div>
      <h3 className="font-semibold text-[15px] mb-1.5">{title}</h3>
      <p className="text-sm text-[var(--tb-muted)] leading-relaxed">{desc}</p>
    </div>
  );
}

// ── Step ───────────────────────────────────────────────────────

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
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/30 flex items-center justify-center mb-4 relative shadow-sm">
        <Icon size={24} className="text-[var(--tb-accent)]" />
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--tb-accent)] text-white text-xs flex items-center justify-center font-bold shadow-lg shadow-orange-500/25">
          {step}
        </span>
      </div>
      <h3 className="font-semibold text-[15px] mb-1">{title}</h3>
      <p className="text-sm text-[var(--tb-muted)] max-w-[220px]">{desc}</p>
    </div>
  );
}

// ── Download card ──────────────────────────────────────────────

function DownloadCard({
  arch,
  label,
  chip,
}: {
  arch: "arm64" | "x64";
  label: string;
  chip: string;
}) {
  return (
    <a
      href={`/download/${arch}`}
      className="flex-1 max-w-[260px] mx-auto sm:mx-0 inline-flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[var(--tb-surface)] border border-[var(--tb-border)] hover:border-[var(--tb-accent)]/40 transition-all group feature-card-glow"
    >
      <div className="text-left">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-[var(--tb-muted)]">{chip}</div>
      </div>
      <Download
        size={18}
        className="text-[var(--tb-accent)] group-hover:translate-y-0.5 transition-transform"
      />
    </a>
  );
}

// ── Page ───────────────────────────────────────────────────────

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
      <section className="relative px-6 pt-24 pb-16 md:pt-36 md:pb-24 overflow-hidden min-h-[560px] md:min-h-[640px]">
        <div className="absolute inset-0 hero-section-glow" />
        <div className="max-w-5xl mx-auto relative z-10">
          {/* Badge row */}
          <div className="flex justify-center mb-6 animate-fade-up">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-orange-50 dark:bg-orange-950/50 text-[var(--tb-accent)] border border-orange-200 dark:border-orange-900/50">
              macOS 13+
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-center mb-6 animate-fade-up animate-delay-1">
            <span className="block text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08]">
              在手机上发消息，
            </span>
            <span className="block text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mt-2">
              桌面端
              <span className="font-brand text-[var(--tb-accent)] ml-1">
                自动输入
              </span>
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-center max-w-xl mx-auto mb-4 text-[var(--tb-muted)] text-base md:text-lg leading-relaxed animate-fade-up animate-delay-2">
            通过飞书 / 钉钉 / 企业微信机器人消息，把内容自动注入到 Mac
            当前聚焦的输入框中。
          </p>
          <p className="text-center max-w-xl mx-auto mb-6 text-[var(--tb-muted)] text-sm leading-relaxed animate-fade-up animate-delay-2">
            支持文本、图片、图文混合。一条消息，桌面直达。
          </p>

          {/* CTA */}
          <div className="flex justify-center gap-3 mb-10 animate-fade-up animate-delay-3">
            <a
              href="/download/arm64"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--tb-accent)] text-white font-semibold text-sm hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[var(--tb-accent)]/25"
            >
              <Download size={17} />
              免费下载
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--tb-border)] font-medium text-sm hover:bg-[var(--tb-surface)] transition-all"
            >
              了解更多
              <ArrowDown size={15} />
            </a>
          </div>

          {/* Concept banner (replaces app screenshot) */}
          <div className="animate-fade-up animate-delay-4">
            <HeroBanner />
          </div>
        </div>
      </section>

      {/* ============ 工作原理 ============ */}
      <section className="px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
              工作
              <span className="font-brand text-[var(--tb-accent)]">原理</span>
            </h2>
            <p className="text-[var(--tb-muted)] max-w-md mx-auto">
              从手机到桌面，只需三步
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-7 left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] h-[2px] bg-gradient-to-r from-[var(--tb-accent)]/40 via-[var(--tb-accent)]/20 to-[var(--tb-accent)]/40" />
            <StepItem
              step={1}
              icon={MessageSquareText}
              title="发送消息"
              desc="在手机或任意设备上，向你的 IM 机器人发送文本、语音或图片"
              delay={0.1}
            />
            <StepItem
              step={2}
              icon={Zap}
              title="TypeBridge 接收"
              desc="应用通过长连接实时接收消息，无需轮询，延迟不到一秒"
              delay={0.2}
            />
            <StepItem
              step={3}
              icon={MousePointerClick}
              title="即时注入"
              desc="消息内容自动写入你当前聚焦的输入框，无需手动复制粘贴"
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ============ 功能特性 ============ */}
      <section
        id="features"
        className="px-6 py-20 md:py-28 bg-[var(--tb-surface)] border-y border-[var(--tb-border)] relative overflow-hidden"
      >
        <div className="absolute inset-0 section-glow-accent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
              功能
              <span className="font-brand text-[var(--tb-accent)]">特性</span>
            </h2>
            <p className="text-[var(--tb-muted)] max-w-md mx-auto">
              每个细节都为高效输入而设计
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={MessageSquareText}
              title="多平台支持"
              desc="支持飞书、钉钉、企业微信三大主流 IM 平台。配置一次，随时切换。"
              delay={0.1}
            />
            <FeatureCard
              icon={Image}
              title="文本 + 图片"
              desc="支持纯文本、图片、图文混合消息。图片自动下载并写入剪贴板，适用于所有应用。"
              delay={0.15}
            />
            <FeatureCard
              icon={Keyboard}
              title="注入后自动提交"
              desc="可选在注入完成后自动按下回车键。手机上发一条消息，桌面端直接发送，无需触碰键盘。"
              delay={0.2}
            />
            <FeatureCard
              icon={History}
              title="消息历史"
              desc="浏览、复制或删除最近 500 条消息记录。所有数据仅存储在本地，不会上传到任何服务器。"
              delay={0.25}
            />
            <FeatureCard
              icon={Monitor}
              title="菜单栏原生应用"
              desc="安静地驻留在 macOS 菜单栏。无 Dock 图标，极低 CPU 占用，随时待命。"
              delay={0.3}
            />
            <FeatureCard
              icon={Shield}
              title="本地优先，隐私安全"
              desc="所有凭据和历史记录仅存储在本地。无云端同步，无数据上报，无用户追踪。你的消息只属于你。"
              delay={0.35}
            />
          </div>
        </div>
      </section>

      {/* ============ 接入教程 ============ */}
      <section id="docs" className="px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-14">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
              接入
              <span className="font-brand text-[var(--tb-accent)]">教程</span>
            </h2>
            <p className="text-[var(--tb-muted)] max-w-md mx-auto">
              手把手教你完成三大 IM 平台的机器人配置
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <a
              href="/docs/feishu"
              className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <MessageSquareText size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-[15px] mb-1.5 group-hover:text-[var(--tb-accent)] transition-colors">
                飞书接入指南
              </h3>
              <p className="text-sm text-[var(--tb-muted)] leading-relaxed mb-3">
                创建飞书自建应用，获取 App ID 和 App Secret，开启长连接接收消息。
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--tb-accent)]">
                查看教程 <ArrowRight size={13} />
              </span>
            </a>

            <a
              href="/docs/dingtalk"
              className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <MessageSquareText size={20} className="text-sky-600 dark:text-sky-400" />
              </div>
              <h3 className="font-semibold text-[15px] mb-1.5 group-hover:text-[var(--tb-accent)] transition-colors">
                钉钉接入指南
              </h3>
              <p className="text-sm text-[var(--tb-muted)] leading-relaxed mb-3">
                在钉钉开放平台创建企业内部应用，配置机器人消息接收。
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--tb-accent)]">
                查看教程 <ArrowRight size={13} />
              </span>
            </a>

            <a
              href="/docs/wecom"
              className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-[var(--tb-accent)]/40 transition-all duration-300 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                <MessageSquareText size={20} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold text-[15px] mb-1.5 group-hover:text-[var(--tb-accent)] transition-colors">
                企业微信接入指南
              </h3>
              <p className="text-sm text-[var(--tb-muted)] leading-relaxed mb-3">
                在企业微信管理后台创建自建应用，配置消息回调与接收。
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--tb-accent)]">
                查看教程 <ArrowRight size={13} />
              </span>
            </a>
          </div>

          <a
            href="/docs"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--tb-border)] text-sm font-medium text-[var(--tb-muted)] hover:text-[var(--tb-text)] hover:border-[var(--tb-accent)]/40 transition-all"
          >
            <BookOpen size={16} />
            浏览全部文档
          </a>
        </div>
      </section>

      {/* ============ 下载 ============ */}
      <section
        id="download"
        className="px-6 py-20 md:py-28 bg-[var(--tb-surface)] border-y border-[var(--tb-border)] relative overflow-hidden"
      >
        <div className="absolute inset-0 section-glow-download pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
            下载
            <span className="font-brand text-[var(--tb-accent)]">
              TypeBridge
            </span>
          </h2>
          <p className="text-[var(--tb-muted)] mb-10">
            最新版本{" "}
            <span className="font-mono text-sm bg-[var(--tb-bg)] px-2 py-0.5 rounded border border-[var(--tb-border)]">
              v{version}
            </span>
            {" "}· 支持 macOS 13+
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
            <DownloadCard
              arch="arm64"
              label="Apple Silicon"
              chip="M1 / M2 / M3 / M4"
            />
            <DownloadCard arch="x64" label="Intel" chip="x86_64" />
          </div>

          {/* First-time setup hint */}
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 text-left">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 mt-0.5">
                <Shield
                  size={16}
                  className="text-amber-700 dark:text-amber-400"
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-1 text-amber-800 dark:text-amber-300">
                  首次安装须知
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400/80 leading-relaxed">
                  由于应用未经过 Apple 公证，macOS 可能会阻止打开。请前往
                  <strong>系统设置 → 隐私与安全性</strong>，点击「仍要打开」。
                  首次使用时需授予 <strong>辅助功能</strong>{" "}
                  权限，才能启用消息注入功能。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="px-6 py-8 border-t border-[var(--tb-border)]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-brand text-lg text-[var(--tb-accent)] select-none">
              TypeBridge
            </span>
            <span className="text-xs text-[var(--tb-muted)]">
              © {new Date().getFullYear()}
            </span>
          </div>
          <p className="text-xs text-[var(--tb-muted)]">
            macOS 菜单栏工具 · 让 IM 消息直达桌面输入框
          </p>
        </div>
      </footer>
    </div>
  );
}
