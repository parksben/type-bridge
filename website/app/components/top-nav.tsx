"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { BrandWordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { LangToggle } from "./lang-toggle";

/** GitHub mark — lucide-react v1 doesn't ship brand logos, so inline SVG. */
function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function TopNav() {
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("hero");
  const [open, setOpen] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const NAV_ITEMS = useMemo(() => [
    { id: "hero", label: t("nav.home") },
    { id: "scenes", label: t("nav.scenes") },
    { id: "flow", label: t("nav.flow") },
    { id: "download", label: t("nav.download") },
  ], [t]);

  // Scroll state for frosted-blur bg switch
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy: find the section whose top is closest to the nav bottom.
  // Uses scroll event + rAF throttle; IntersectionObserver is unreliable with scroll-snap.
  useEffect(() => {
    const ids = NAV_ITEMS.map((i) => i.id);
    const NAV_HEIGHT = 64;
    let rafId = 0;

    function computeActive() {
      let bestId = ids[0];
      let bestDist = Infinity;

      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // How far is this section's top from the nav bottom line?
        // Prefer the section whose top is just crossing (or nearest to) the nav boundary.
        const dist = Math.abs(top - NAV_HEIGHT);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      }

      if (activeRef.current !== bestId) {
        setActive(bestId);
      }
    }

    function onScroll() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(computeActive);
    }

    computeActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [NAV_ITEMS]);

  // Click nav item — immediately update active (don't wait for scroll event)
  function handleNavClick(id: string) {
    setActive(id);
    setOpen(false);
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-lg"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        {/* Brand — click returns to hero */}
        <a
          href="#hero"
          onClick={() => handleNavClick("hero")}
          className="group inline-flex items-center"
          aria-label={t("nav.brandAria")}
        >
          <BrandWordmark markSize={30} textClassName="text-[18px] font-bold tracking-tight" gradient />
          <span className="ml-3 hidden text-xs font-medium text-[var(--subtle)] transition-colors group-hover:text-[var(--muted)] md:inline">
            {t("nav.tagline")}
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => handleNavClick(item.id)}
                className="relative rounded-md px-3 py-2 text-sm font-medium transition-colors"
              >
                <span
                  className={
                    isActive
                      ? "text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }
                >
                  {item.label}
                </span>
                {isActive && (
                  <span className="pointer-events-none absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full bg-accent-gradient" />
                )}
              </a>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/parksben/type-bridge"
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t("nav.githubAria")}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <GithubMark size={15} />
          </a>
          <LangToggle />
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 text-[var(--muted)] transition-colors hover:text-[var(--text)] md:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-lg md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--surface)] text-[var(--text)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
