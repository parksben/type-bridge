"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "tb-theme";
const ORDER: Theme[] = ["system", "light", "dark"];

function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function systemPrefersLight(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const light = theme === "light" || (theme === "system" && systemPrefersLight());
  root.classList.toggle("light-force", light);
}

const LABEL: Record<Theme, string> = {
  system: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  // When in "system" mode, react to OS-level changes live.
  useEffect(() => {
    if (!mounted || theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [theme, mounted]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  const nextLabel = LABEL[ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]];

  return (
    <button
      type="button"
      aria-label={`当前：${LABEL[theme]}，点击切换到${nextLabel}`}
      title={LABEL[theme]}
      onClick={cycle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
    >
      {mounted ? <Icon size={16} strokeWidth={1.8} /> : null}
    </button>
  );
}
