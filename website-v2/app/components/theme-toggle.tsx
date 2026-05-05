"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "tb-theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light") return "light";
  } catch {}
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light-force");
  } else {
    root.classList.remove("light-force");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  // Render a shell pre-mount so layout doesn't jump; icon renders after hydration
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
    >
      {mounted ? (
        theme === "dark" ? (
          <Sun size={16} strokeWidth={1.8} />
        ) : (
          <Moon size={16} strokeWidth={1.8} />
        )
      ) : null}
    </button>
  );
}
