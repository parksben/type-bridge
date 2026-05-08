import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useAppStore, type Theme } from "../store";
import { useI18n, type TKey } from "../i18n";

const OPTIONS: { value: Theme; Icon: typeof Monitor }[] = [
  { value: "system", Icon: Monitor },
  { value: "light",  Icon: Sun },
  { value: "dark",   Icon: Moon },
];

const THEME_KEY: Record<Theme, TKey> = {
  system: "theme.system",
  light:  "theme.light",
  dark:   "theme.dark",
};

/// 「关于」页面右下角主题切换控件（浅色 / 深色 / 跟随系统）。
///
/// 风格与 LanguageSwitcher 对齐：弱化 footer 入口、下拉浮层上弹。
/// 状态持久化到 localStorage("tb_theme")，通过 setTheme 同步写入
/// document.documentElement 的 data-theme 属性使 CSS 变量即时生效。
export default function ThemeSwitcher() {
  const { theme, setTheme } = useAppStore();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点外面 / 按 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: Theme) {
    setOpen(false);
    if (next === theme) return;
    setTheme(next);
  }

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0];
  const CurrentIcon = current.Icon;
  const currentLabel = t(THEME_KEY[current.value]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 pl-3 pr-2 h-7 text-[12px] rounded-md transition-colors text-left w-full text-subtle hover:text-muted"
        style={open ? { background: "var(--surface-2)" } : undefined}
        aria-label={t("sidebar.theme")}
        aria-expanded={open}
      >
        <CurrentIcon size={12} strokeWidth={1.5} />
        <span className="truncate flex-1">{currentLabel}</span>
        <ChevronDown
          size={11}
          strokeWidth={1.75}
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 bottom-full mb-1.5 rounded-md overflow-hidden animate-enter"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
            zIndex: 60,
          }}
          role="listbox"
        >
          {OPTIONS.map((opt) => {
            const active = opt.value === theme;
            const OptionIcon = opt.Icon;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => pick(opt.value)}
                role="option"
                aria-selected={active}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <Check
                  size={11}
                  strokeWidth={2}
                  className="shrink-0 text-accent"
                  style={{ visibility: active ? "visible" : "hidden" }}
                />
                <OptionIcon size={12} strokeWidth={1.5} className="shrink-0 text-muted" />
                <span className="text-[12px] text-text leading-tight">
                  {t(THEME_KEY[opt.value])}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
