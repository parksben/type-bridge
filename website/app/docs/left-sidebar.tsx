"use client";

import {
  MessageSquareText,
  ChevronRight,
} from "lucide-react";

const CHANNELS = [
  {
    href: "/docs/feishu",
    label: "飞书接入指南",
    channel: "飞书",
    color: "blue",
    badge: "自建应用",
  },
  {
    href: "/docs/dingtalk",
    label: "钉钉接入指南",
    channel: "钉钉",
    color: "sky",
    badge: "企业内部应用",
  },
  {
    href: "/docs/wecom",
    label: "企业微信接入指南",
    channel: "企业微信",
    color: "green",
    badge: "自建应用",
  },
];

function channelColorClass(color: string, active: boolean) {
  const map: Record<string, { bg: string; text: string; border: string; bgDark: string; borderDark: string }> = {
    blue: {
      bg: "bg-blue-50",
      bgDark: "dark:bg-blue-950/40",
      text: "text-blue-700 dark:text-blue-400",
      border: "border-blue-200",
      borderDark: "dark:border-blue-900/40",
    },
    sky: {
      bg: "bg-sky-50",
      bgDark: "dark:bg-sky-950/40",
      text: "text-sky-700 dark:text-sky-400",
      border: "border-sky-200",
      borderDark: "dark:border-sky-900/40",
    },
    green: {
      bg: "bg-green-50",
      bgDark: "dark:bg-green-950/40",
      text: "text-green-700 dark:text-green-400",
      border: "border-green-200",
      borderDark: "dark:border-green-900/40",
    },
  };
  const c = map[color];
  if (active) {
    return `${c.bg} ${c.bgDark} ${c.text} ${c.border} ${c.borderDark} border-l-[3px] border-l-current`;
  }
  return "text-[var(--tb-muted)] hover:text-[var(--tb-text)] hover:bg-[var(--tb-surface)]";
}

export function LeftSidebar({ currentPath }: { currentPath: string }) {
  return (
    <aside className="w-[220px] shrink-0 hidden lg:block">
      <nav className="sticky top-20 h-[calc(100vh-80px)] overflow-y-auto py-4 pr-4 scrollbar-thin">
        <div className="mb-3 px-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tb-muted)]">
            渠道文档
          </p>
        </div>

        <ul className="space-y-0.5">
          {CHANNELS.map((ch) => {
            const active = currentPath === ch.href;
            return (
              <li key={ch.href}>
                <a
                  href={ch.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm font-medium transition-all duration-200 ${channelColorClass(ch.color, active)}`}
                >
                  <MessageSquareText size={16} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{ch.label}</div>
                    <div className="text-[10px] opacity-60">{ch.badge}</div>
                  </div>
                  {active && <ChevronRight size={14} className="shrink-0" />}
                </a>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 pt-4 border-t border-[var(--tb-border)] px-3">
          <a
            href="/docs"
            className="text-xs text-[var(--tb-muted)] hover:text-[var(--tb-text)] transition-colors"
          >
            ← 文档中心
          </a>
        </div>
      </nav>
    </aside>
  );
}
