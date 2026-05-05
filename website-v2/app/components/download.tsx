"use client";

import {
  Apple,
  Check,
  Copy,
  Cpu,
  Download as DownloadIcon,
  Shield,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";

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
  const [version, setVersion] = useState<string>("…");

  useEffect(() => {
    fetch("https://api.github.com/repos/parksben/type-bridge/releases/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tag_name) setVersion(String(data.tag_name).replace(/^v/, ""));
        else setVersion("latest");
      })
      .catch(() => setVersion("latest"));
  }, []);

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
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-[var(--subtle)]">
          下载
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
          马上把<span className="text-accent-gradient">手机</span>变成
          <br className="hidden md:block" />
          你桌面的<span className="text-accent-gradient">键盘</span>。
        </h2>
        <p className="mt-4 text-[var(--muted)]">
          最新版本{" "}
          <span className="inline-block rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-2 py-0.5 font-mono text-sm">
            v{version}
          </span>{" "}
          · 支持 macOS 13+
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <DownloadCard
            arch="arm64"
            label="Apple Silicon"
            chip="M1 / M2 / M3 / M4"
            Mark={({ size = 22 }: { size?: number }) => (
              <Apple size={size} strokeWidth={1.6} className="text-[var(--text)]" />
            )}
          />
          <DownloadCard
            arch="x64"
            label="Intel"
            chip="x86_64"
            Mark={({ size = 22 }: { size?: number }) => (
              <Cpu size={size} strokeWidth={1.6} className="text-[var(--text)]" />
            )}
          />
        </div>

        {/* First-time install notice — two paths (GUI / CLI) */}
        <InstallNotice />
      </div>
    </section>
  );
}

const QUARANTINE_CMD = "xattr -rd com.apple.quarantine /Applications/TypeBridge.app";

function InstallNotice() {
  const [copied, setCopied] = useState(false);

  async function copyCmd() {
    try {
      await navigator.clipboard.writeText(QUARANTINE_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — older browsers without clipboard perms
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-5 text-left backdrop-blur-sm md:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-2)]">
          <Shield size={16} strokeWidth={1.8} className="text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">首次安装须知</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
            应用当前
            <strong className="mx-1 text-[var(--text)]">未经 Apple 公证</strong>
            ，macOS Gatekeeper 可能会阻止首次打开。下面两种方法
            <strong className="mx-1 text-[var(--text)]">二选一</strong>
            都可以正常安装使用。
          </p>
        </div>
      </div>

      {/* Two methods */}
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
            把 <code className="rounded bg-[var(--surface)] px-1 font-mono text-[11px]">.app</code> 拖入
            <strong className="mx-1 text-[var(--text)]">应用程序</strong>
            文件夹后，打开终端粘贴这一行移除 macOS 的"隔离"标记：
          </p>
          <div className="group/cmd relative mt-3">
            <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]/80 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-[var(--text)]">
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
                  <Check size={12} strokeWidth={2.4} className="text-[var(--accent)]" />
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

      {/* Runtime permission reminder (separate line) */}
      <div className="mt-5 flex items-start gap-2 border-t border-[var(--border)] pt-4 text-[12px] leading-relaxed text-[var(--muted)]">
        <span
          aria-hidden
          className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
        />
        <p>
          首次使用时，应用会请求
          <strong className="mx-1 text-[var(--text)]">辅助功能</strong>
          权限——这是模拟 `Cmd+V` 粘贴和自动提交按键所必需的，不授予无法注入消息。
        </p>
      </div>
    </div>
  );
}
