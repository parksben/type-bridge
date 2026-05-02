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
  BookOpen,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";

// ── App screenshot (placeholder) ───────────────────────────────

function AppScreenshot() {
  return (
    <div className="relative w-full max-w-[680px] mx-auto">
      <div className="rounded-xl overflow-hidden border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-2xl shadow-black/10">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--tb-border)]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 text-center text-xs text-[var(--tb-muted)]">
            TypeBridge
          </div>
        </div>
        {/* Placeholder content */}
        <div className="aspect-[16/10] bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="w-[18%] border-r border-[var(--tb-border)] p-3 flex flex-col gap-2">
              <div className="h-3 w-3/4 rounded bg-orange-200/50 dark:bg-orange-800/30" />
              <div className="h-2 w-2/3 rounded bg-gray-200 dark:bg-gray-800 ml-2" />
              <div className="h-2 w-2/3 rounded bg-gray-200 dark:bg-gray-800 ml-2" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-3" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-1" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-1" />
              <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-800 mt-1" />
            </div>
            <div className="flex-1 p-4 flex flex-col gap-3">
              <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-8 w-2/3 rounded bg-gray-100 dark:bg-gray-800/50" />
              <div className="h-8 w-1/2 rounded bg-gray-100 dark:bg-gray-800/50" />
              <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-800 mt-2" />
              <div className="h-2 w-3/4 rounded bg-gray-100 dark:bg-gray-800/30 mt-1" />
              <div className="h-2 w-2/3 rounded bg-gray-100 dark:bg-gray-800/30" />
              <div className="mt-3 border border-[var(--tb-border)] rounded-lg p-3">
                <div className="flex justify-between">
                  <div className="h-2 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-2 w-12 rounded bg-orange-200/50 dark:bg-orange-800/30" />
                </div>
                <div className="h-2 w-2/3 rounded bg-gray-100 dark:bg-gray-800/30 mt-2" />
              </div>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-[var(--tb-surface)]/90 dark:bg-[var(--tb-surface)]/90 backdrop-blur-sm px-5 py-2.5 rounded-full border border-[var(--tb-border)] shadow-sm">
              <p className="text-xs text-[var(--tb-muted)]">
                应用截图 — 待替换为 TypeBridge 真机截图
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -inset-4 -z-10 glow-orange opacity-40 rounded-2xl" />
    </div>
  );
}

// ── Platform badge ─────────────────────────────────────────────

function PlatformBadge({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-orange-50 dark:bg-orange-950/50 text-[var(--tb-accent)] border-orange-200 dark:border-orange-900/50"
          : "text-[var(--tb-muted)] border-[var(--tb-border)]"
      }`}
    >
      <CheckCircle2 size={13} />
      {label}
    </span>
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
      className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-orange-300 dark:hover:border-orange-800 transition-all duration-300 animate-fade-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
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
      <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center mb-4 relative">
        <Icon size={24} className="text-[var(--tb-accent)]" />
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--tb-accent)] text-white text-xs flex items-center justify-center font-semibold">
          {step}
        </span>
      </div>
      <h3 className="font-semibold text-[15px] mb-1">{title}</h3>
      <p className="text-sm text-[var(--tb-muted)] max-w-[220px]">{desc}</p>
    </div>
  );
}

// ── Channel setup card ─────────────────────────────────────────

function ChannelCard({
  name,
  desc,
  href,
}: {
  name: string;
  desc: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group p-6 rounded-xl border border-[var(--tb-border)] bg-[var(--tb-surface)] hover:border-orange-300 dark:hover:border-orange-800 transition-all duration-300 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[15px] group-hover:text-[var(--tb-accent)] transition-colors">
          {name}
        </h3>
        <ExternalLink
          size={15}
          className="text-[var(--tb-muted)] group-hover:text-[var(--tb-accent)] transition-colors"
        />
      </div>
      <p className="text-sm text-[var(--tb-muted)] leading-relaxed">{desc}</p>
    </a>
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
      className="flex-1 max-w-[260px] mx-auto sm:mx-0 inline-flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[var(--tb-surface)] border border-[var(--tb-border)] hover:border-orange-300 dark:hover:border-orange-800 transition-all group"
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
      <section className="relative px-6 pt-24 pb-16 md:pt-36 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 glow-orange opacity-50" />
        <div className="max-w-5xl mx-auto relative z-10">
          {/* Badge row */}
          <div className="flex justify-center mb-6 animate-fade-up">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-orange-50 dark:bg-orange-950/50 text-[var(--tb-accent)] border border-orange-200 dark:border-orange-900/50">
              macOS 13+
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-center mb-8 animate-fade-up animate-delay-1">
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

          {/* Platform badges */}
          <div className="flex justify-center gap-2 mb-8 animate-fade-up animate-delay-2">
            <PlatformBadge label="飞书" active />
            <PlatformBadge label="钉钉" active />
            <PlatformBadge label="企业微信" active />
          </div>

          {/* CTA */}
          <div className="flex justify-center gap-3 mb-12 animate-fade-up animate-delay-3">
            <a
              href="/download/arm64"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--tb-accent)] text-white font-semibold text-sm hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-orange-500/20"
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

          {/* App Screenshot */}
          <div className="animate-fade-up animate-delay-4">
            <AppScreenshot />
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
            <div className="hidden md:block absolute top-7 left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] h-[2px] bg-gradient-to-r from-orange-300 via-orange-200 to-orange-300 dark:from-orange-800 dark:via-orange-700 dark:to-orange-800" />
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
        className="px-6 py-20 md:py-28 bg-[var(--tb-surface)] border-y border-[var(--tb-border)]"
      >
        <div className="max-w-5xl mx-auto">
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

      {/* ============ 渠道配置指南 ============ */}
      <section id="docs" className="px-6 py-20 md:py-28">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">
              渠道
              <span className="font-brand text-[var(--tb-accent)]">
                配置指南
              </span>
            </h2>
            <p className="text-[var(--tb-muted)] max-w-md mx-auto">
              选择你使用的 IM 平台，查看对应的机器人配置方法
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChannelCard
              name="飞书"
              desc="创建飞书自建应用，开启长连接能力，获取 App ID 和 App Secret，填入 TypeBridge 即可开始使用。"
              href="https://open.feishu.cn/document/home/index"
            />
            <ChannelCard
              name="钉钉"
              desc="在钉钉开放平台创建企业内部应用，配置机器人消息接收，获取应用凭证后填入 TypeBridge。"
              href="https://open.dingtalk.com/document/orgapp/overview-of-organizational-applications"
            />
            <ChannelCard
              name="企业微信"
              desc="在企业微信管理后台创建自建应用，配置回调 URL 和消息接收，获取 Corp ID 和 Secret 后填入 TypeBridge。"
              href="https://developer.work.weixin.qq.com/document/path/90664"
            />
          </div>
        </div>
      </section>

      {/* ============ 下载 ============ */}
      <section
        id="download"
        className="px-6 py-20 md:py-28 bg-[var(--tb-surface)] border-y border-[var(--tb-border)]"
      >
        <div className="max-w-2xl mx-auto text-center">
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
