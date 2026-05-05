"use client";

import { useT } from "../lib/i18n";

export function Footer() {
  const { t } = useT();

  return (
    <footer className="relative mt-auto border-t border-[var(--border)] bg-transparent">
      <p className="mx-auto max-w-5xl px-6 py-3 text-center text-xs text-[var(--muted)]">
        TypeBridge © {new Date().getFullYear()}
        <span className="mx-1.5 text-[var(--subtle)]">·</span>
        {t("footer.tagline")}
      </p>
    </footer>
  );
}
