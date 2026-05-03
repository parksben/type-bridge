"use client";

import { useEffect, useState, useRef } from "react";
import { Hash } from "lucide-react";

interface StepEntry {
  id: string;
  title: string;
}

export function RightSidebar() {
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Gather all step anchors from the content area
    const anchors = document.querySelectorAll("[data-step-anchor]");
    const entries: StepEntry[] = [];
    anchors.forEach((el) => {
      const id = el.getAttribute("id");
      const title = el.getAttribute("data-step-title");
      if (id && title) {
        entries.push({ id, title });
      }
    });
    setSteps(entries);
  }, []);

  useEffect(() => {
    if (steps.length === 0) return;

    // Build IntersectionObserver for scroll spy
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first entry that is intersecting (topmost in viewport)
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => {
            const aTop = a.boundingClientRect.top;
            const bTop = b.boundingClientRect.top;
            return aTop - bTop;
          });

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    observerRef.current = observer;

    steps.forEach((step) => {
      const el = document.getElementById(step.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [steps]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  };

  if (steps.length === 0) return null;

  return (
    <aside className="w-[200px] shrink-0 hidden lg:block">
      <nav className="sticky top-20 py-4 pl-4">
        <div className="flex items-center gap-2 mb-3">
          <Hash size={14} className="text-[var(--tb-muted)]" />
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tb-muted)]">
            本页章节
          </p>
        </div>

        <ul className="space-y-0.5">
          {steps.map((step) => {
            const active = activeId === step.id;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => handleClick(step.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                    active
                      ? "text-[var(--tb-accent)] bg-orange-50 dark:bg-orange-950/30 border-l-[3px] border-l-[var(--tb-accent)]"
                      : "text-[var(--tb-muted)] hover:text-[var(--tb-text)] hover:bg-[var(--tb-surface)] border-l-[3px] border-l-transparent"
                  }`}
                >
                  {step.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
