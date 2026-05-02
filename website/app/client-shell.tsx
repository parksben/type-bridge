"use client";

import "./globals.css";
import {
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// ── Theme context ──────────────────────────────────────────────

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolved: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => {},
  resolved: "light",
});

export function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const resolveTheme = useCallback((m: ThemeMode): "light" | "dark" => {
    if (m === "system") {
      if (typeof window === "undefined") return "light";
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return m;
  }, []);

  const applyTheme = useCallback((m: ThemeMode) => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("dark", "light-force");

    if (m === "dark") {
      root.classList.add("dark");
    } else if (m === "light") {
      root.classList.add("light-force");
    }

    try {
      localStorage.setItem("theme", m);
    } catch {
      /* noop */
    }
    setResolved(resolveTheme(m));
  }, [resolveTheme]);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      applyTheme(m);
    },
    [applyTheme]
  );

  useEffect(() => {
    let stored: ThemeMode = "system";
    try {
      const v = localStorage.getItem("theme");
      if (v === "dark" || v === "light" || v === "system") stored = v;
    } catch {
      /* noop */
    }
    setModeState(stored);
    applyTheme(stored);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (
        localStorage.getItem("theme") === "system" ||
        !localStorage.getItem("theme")
      ) {
        setResolved(mq.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Navigation ─────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: "飞书",
    href: "https://open.feishu.cn/document/home/index",
    external: true,
  },
  {
    label: "钉钉",
    href: "https://open.dingtalk.com/document/orgapp/overview-of-organizational-applications",
    external: true,
  },
  {
    label: "企微",
    href: "https://developer.work.weixin.qq.com/document/path/90664",
    external: true,
  },
  { label: "使用文档", href: "#docs", external: false },
  { label: "下载", href: "#download", external: false },
];

function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, setMode, resolved } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const nextMode = (): ThemeMode => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const idx = order.indexOf(mode);
    return order[(idx + 1) % 3];
  };

  const ThemeIcon =
    mode === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const themeLabel =
    mode === "system"
      ? "跟随系统"
      : resolved === "dark"
        ? "深色模式"
        : "浅色模式";

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[var(--tb-bg)]/80 backdrop-blur-xl border-b border-[var(--tb-border)] shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
        {/* Logo */}
        <a
          href="#"
          className="font-brand text-xl text-[var(--tb-accent)] tracking-tight shrink-0 select-none"
        >
          TypeBridge
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--tb-muted)] hover:text-[var(--tb-text)] hover:bg-[var(--tb-surface)] transition-colors"
              >
                {item.label}
                <ExternalLink size={12} className="opacity-40" />
              </a>
            ) : (
              <a
                key={item.label}
                href={item.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--tb-muted)] hover:text-[var(--tb-text)] hover:bg-[var(--tb-surface)] transition-colors"
              >
                {item.label}
              </a>
            )
          )}

          {/* Theme toggle */}
          <button
            onClick={() => setMode(nextMode())}
            title={themeLabel}
            className="ml-2 p-2 rounded-lg text-[var(--tb-muted)] hover:text-[var(--tb-text)] hover:bg-[var(--tb-surface)] transition-colors"
          >
            <ThemeIcon size={17} />
          </button>
        </div>

        {/* Mobile */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setMode(nextMode())}
            title={themeLabel}
            className="p-2 rounded-lg text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
          >
            <ThemeIcon size={17} />
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[var(--tb-bg)]/95 backdrop-blur-xl border-b border-[var(--tb-border)] px-5 pb-4 pt-2 flex flex-col gap-1">
          {NAV_ITEMS.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
              >
                {item.label}
                <ExternalLink size={12} className="opacity-40" />
              </a>
            ) : (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
              >
                {item.label}
              </a>
            )
          )}
        </div>
      )}
    </nav>
  );
}

// ── Client shell ───────────────────────────────────────────────

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TopNav />
      {children}
    </ThemeProvider>
  );
}
