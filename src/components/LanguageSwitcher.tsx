import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { type Settings, type Lang } from "../store";
import { useI18n } from "../i18n";

const OPTIONS: { value: Lang; label: string; sub: string }[] = [
  { value: "zh", label: "简体中文", sub: "Chinese" },
  { value: "en", label: "English", sub: "英语" },
];

/// SideBar 底部语言切换控件。
///
/// 设计：弱化为 footer 入口（小一号字、灰阶配色），与「关于 TypeBridge」
/// 同级。点击触发 popover（自定义浮层，不是原生 select），上浮在按钮
/// 上方避免被窗口底边裁切。当前语言带 lucide Check 标记。
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
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

  async function pick(next: Lang) {
    setOpen(false);
    if (next === lang) return;
    setLang(next);
    // merge 回写 Rust 持久化
    const current = await invoke<Settings>("get_settings").catch(() => null);
    if (!current) return;
    await invoke("save_settings", { settings: { ...current, language: next } }).catch(() => {});
  }

  // 不能强制使用 useAppStore.getState() 选 channelConnected——单纯展示标签即可
  const currentLabel = OPTIONS.find((o) => o.value === lang)?.label ?? "—";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 h-7 text-[12px] rounded-md transition-colors text-left text-subtle hover:text-muted"
        style={open ? { background: "var(--surface-2)" } : undefined}
        aria-label={t("sidebar.language")}
        aria-expanded={open}
      >
        <Languages size={12} strokeWidth={1.5} />
        <span className="truncate">{currentLabel}</span>
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
            const active = opt.value === lang;
            return (
              <button
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
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text leading-tight">{opt.label}</div>
                  <div className="text-[10.5px] text-subtle mt-0.5">{opt.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
