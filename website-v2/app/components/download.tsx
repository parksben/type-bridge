"use client";

import { Apple, Cpu, Download as DownloadIcon, Shield } from "lucide-react";
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

        {/* First-time install notice */}
        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/50 p-4 text-left backdrop-blur-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-2)]">
            <Shield size={16} strokeWidth={1.8} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-sm font-semibold">首次安装须知</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
              应用未经 Apple 公证，macOS 可能阻止首次打开。前往
              <strong className="mx-1 text-[var(--text)]">
                系统设置 → 隐私与安全性
              </strong>
              点「仍要打开」。首次使用需授予
              <strong className="mx-1 text-[var(--text)]">辅助功能</strong>
              权限以完成消息注入。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
