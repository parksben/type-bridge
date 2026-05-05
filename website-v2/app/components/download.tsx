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
      href={`/download/${arch}`}
      className="group relative flex min-w-0 flex-1 items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-[0_16px_40px_-16px_var(--accent-glow)]"
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
      <div className="relative flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-2)]">
          <Mark size={22} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight">
            {label}
          </div>
          <div className="text-xs text-[var(--muted)]">{chip}</div>
        </div>
      </div>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-gradient text-white transition-transform group-hover:translate-y-0.5">
        <DownloadIcon size={16} strokeWidth={2.4} />
      </div>
    </a>
  );
}

export function Download() {
  return (
    <section
      id="download"
      className="relative overflow-hidden px-6 py-24 md:py-32"
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

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Header — no eyebrow, no trailing period */}
        <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
          马上把<span className="text-accent-gradient">手机</span>变成
          <br className="hidden md:block" />
          你桌面的<span className="text-accent-gradient">键盘</span>
        </h2>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <DownloadCard
            arch="arm64"
            label="Apple Silicon"
            chip="M1 / M2 / M3 / M4"
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
            label="Intel"
            chip="x86_64"
            Mark={({ size = 22 }: { size?: number }) => (
              <Cpu
                size={size}
                strokeWidth={1.6}
                className="text-[var(--text)]"
              />
            )}
          />
        </div>

        {/* Post-install notices — two parallel sibling sections, no outer wrapper */}
        <div className="mt-12 space-y-8 text-left">
          <GatekeeperNotice />
          <AccessibilityNotice />
        </div>
      </div>
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
      <SectionHeader icon={Shield} title="首次安装须知">
        应用当前
        <strong className="mx-1 text-[var(--text)]">未经 Apple 公证</strong>
        ，macOS Gatekeeper 可能会阻止首次打开。下面两种方法
        <strong className="mx-1 text-[var(--text)]">二选一</strong>
        都可以正常安装使用。
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
              在系统设置里点「仍要打开」
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
            打开
            <strong className="mx-1 text-[var(--text)]">
              系统设置 → 隐私与安全性
            </strong>
            ，在下方「安全性」区域找到被阻止的 TypeBridge 条目，点
            <strong className="mx-1 text-[var(--text)]">「仍要打开」</strong>
            。之后再双击应用即可正常启动。
          </p>
        </div>

        {/* Method B — CLI */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/50 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-gradient px-1.5 text-[10px] font-bold text-white">
              B
            </span>
            <p className="text-[13px] font-semibold text-[var(--text)]">
              在终端执行一行命令
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
            把
            <code className="mx-1 rounded bg-[var(--surface)] px-1 font-mono text-[11px]">
              .app
            </code>
            拖入
            <strong className="mx-1 text-[var(--text)]">应用程序</strong>
            文件夹后，打开终端粘贴这一行移除 macOS 的"隔离"标记：
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
              aria-label="复制命令"
            >
              {copied ? (
                <>
                  <Check
                    size={12}
                    strokeWidth={2.4}
                    className="text-[var(--accent)]"
                  />
                  已复制
                </>
              ) : (
                <>
                  <Copy size={12} strokeWidth={2} />
                  复制
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
  return (
    <div>
      <SectionHeader icon={KeyRound} title="首次使用须授予「辅助功能」权限">
        这是 TypeBridge 模拟
        <code className="mx-1 rounded bg-[var(--surface)] px-1 font-mono text-[12px]">
          Cmd+V
        </code>
        粘贴和自动提交按键所必需的，不授予无法注入消息。应用首次启动时会自动引导你打开
        <strong className="mx-1 text-[var(--text)]">
          系统设置 → 隐私与安全性 → 辅助功能
        </strong>
        并勾选 TypeBridge。
      </SectionHeader>
    </div>
  );
}
