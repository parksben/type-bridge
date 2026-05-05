"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandWordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

type NavItem = { id: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { id: "hero", label: "首页" },
  { id: "scenes", label: "场景" },
  { id: "flow", label: "流程" },
  { id: "download", label: "下载" },
];

export function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("hero");
  const [open, setOpen] = useState(false);

  // Scroll state for frosted-blur bg switch
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy via IntersectionObserver — picks the section whose top is closest
  // to the nav bottom as the active one.
  useEffect(() => {
    const sections = NAV_ITEMS.map((i) =>
      document.getElementById(i.id)
    ).filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Consider only entries currently intersecting; pick the one closest to the top
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const top = visible.reduce((best, e) =>
          e.boundingClientRect.top < best.boundingClientRect.top ? e : best
        );
        setActive(top.target.id);
      },
      {
        // Trigger when the section crosses the nav line (~72px from top)
        rootMargin: "-72px 0px -60% 0px",
        threshold: [0, 0.25, 0.5],
      }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Close mobile menu when clicking a link
  function handleNavClick() {
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
          className="group inline-flex items-center"
          aria-label="TypeBridge — 手机即键盘"
        >
          <BrandWordmark markSize={20} gradient />
          <span className="ml-3 hidden text-xs font-medium text-[var(--subtle)] transition-colors group-hover:text-[var(--muted)] md:inline">
            手机即键盘
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
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "关闭菜单" : "打开菜单"}
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
                  onClick={handleNavClick}
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
