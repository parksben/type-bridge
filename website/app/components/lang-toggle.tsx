"use client";

import { useT, type Language } from "../lib/i18n";

const NEXT: Record<Language, Language> = { zh: "en", en: "zh" };

export function LangToggle() {
  const { lang, setLang } = useT();

  function toggle() {
    setLang(NEXT[lang]);
  }

  return (
    <button
      type="button"
      aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
      title={lang === "zh" ? "Switch to English" : "切换到中文"}
      onClick={toggle}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 text-xs font-semibold text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  );
}
