"use client";

import { Globe } from "lucide-react";
import { useT, type Language } from "../lib/i18n";

const NEXT: Record<Language, Language> = { zh: "en", en: "zh" };

export function LangToggle() {
  const { lang, setLang } = useT();

  function toggle() {
    setLang(NEXT[lang]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
        title={lang === "zh" ? "Switch to English" : "切换到中文"}
        onClick={toggle}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <Globe size={16} strokeWidth={1.8} />
      </button>
      <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent-gradient px-[3px] text-[7.5px] font-bold leading-none text-white">
        {lang === "zh" ? "中" : "EN"}
      </span>
    </div>
  );
}
