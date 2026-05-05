"use client";

import {
  Download,
  Keyboard,
  MessageSquareText,
  Play,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type FlowNode = {
  id: string;
  step: number;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  // Grid column/row on desktop 12-col layout
  col: number;
  row: number; // 1 = top, 2 = bottom (used for the branch pair)
  span?: number;
};

const NODES: FlowNode[] = [
  {
    id: "download",
    step: 1,
    icon: Download,
    title: "下载 App",
    subtitle: "从官网下载 macOS 安装包",
    col: 1,
    row: 1,
    span: 2,
  },
  {
    id: "open",
    step: 2,
    icon: Play,
    title: "打开 App",
    subtitle: "首次启动引导授权辅助功能",
    col: 3,
    row: 1,
    span: 2,
  },
  {
    id: "webchat",
    step: 3,
    icon: QrCode,
    title: "扫码 WebChat",
    subtitle: "同 WiFi 手机扫二维码 + 输 OTP",
    col: 5,
    row: 1,
    span: 3,
  },
  {
    id: "im",
    step: 3,
    icon: MessageSquareText,
    title: "连接 IM 机器人",
    subtitle: "飞书 / 钉钉 / 企业微信 自建应用",
    col: 5,
    row: 2,
    span: 3,
  },
  {
    id: "inject",
    step: 4,
    icon: Keyboard,
    title: "手机发消息 · 桌面自动写入",
    subtitle: "文本 / 图片 / 图文混合一键直达",
    col: 8,
    row: 1,
    span: 3,
  },
];

function FlowCard({
  node,
  active,
  highlight,
}: {
  node: FlowNode;
  active: boolean;
  highlight?: boolean;
}) {
  const Icon = node.icon;
  return (
    <div
      className={`relative flex flex-col gap-3 rounded-2xl border p-5 backdrop-blur-sm transition-all duration-500 ${
        active
          ? "border-[var(--accent)]/40 bg-[var(--surface)] shadow-[0_12px_40px_-16px_var(--accent-glow)]"
          : "border-[var(--border)] bg-[var(--surface)]/50"
      }`}
      style={{ transitionDelay: active ? `${node.step * 80}ms` : "0ms" }}
    >
      {/* Step number */}
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
          active
            ? "bg-accent-gradient text-white"
            : "bg-[var(--bg-2)] text-[var(--muted)]"
        }`}
      >
        {node.step}
      </span>

      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
          active
            ? "bg-accent-gradient text-white"
            : "bg-[var(--bg-2)] text-[var(--muted)]"
        }`}
      >
        <Icon size={20} strokeWidth={1.8} />
      </div>

      <div>
        <h3
          className={`text-[15px] font-semibold tracking-tight transition-colors ${
            active ? "text-[var(--text)]" : "text-[var(--text)]/80"
          }`}
        >
          {node.title}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          {node.subtitle}
        </p>
      </div>

      {/* Pulse accent for the final inject node */}
      {highlight && active && (
        <span
          aria-hidden
          className="absolute -inset-1 -z-10 rounded-3xl"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, var(--accent-glow), transparent 70%)",
            filter: "blur(12px)",
            opacity: 0.8,
          }}
        />
      )}
    </div>
  );
}

export function Flow() {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) setActive(true);
      },
      { rootMargin: "0px 0px -20% 0px", threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="flow" className="relative px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-14 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-[var(--subtle)]">
            使用流程
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
            看<span className="text-accent-gradient">手机</span>如何变成
            <span className="text-accent-gradient">你的键盘</span>。
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--muted)]">
            四步上手，两条连接路径可任选其一；消息发出后桌面当前聚焦的输入框自动落字。
          </p>
        </div>

        {/* Desktop flow — horizontal 4-col layout with SVG connectors */}
        <div ref={ref} className="relative hidden md:block">
          {/* SVG connecting lines underneath */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 1200 520"
            aria-hidden
          >
            <defs>
              <linearGradient id="flow-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
                <stop
                  offset="100%"
                  stopColor="var(--accent-2)"
                  stopOpacity="0.6"
                />
              </linearGradient>
              <marker
                id="flow-arrow"
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-2)" />
              </marker>
            </defs>
            {/* 1 → 2 */}
            <path
              d="M 220 140 L 400 140"
              stroke="url(#flow-line)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
              markerEnd="url(#flow-arrow)"
              style={{
                animation: active ? "arc-flow 2.5s linear infinite" : "none",
              }}
            />
            {/* 2 → 3 branch start point (x=580, y=140) */}
            <path
              d="M 580 140 C 660 140, 660 90, 740 90"
              stroke="url(#flow-line)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
              markerEnd="url(#flow-arrow)"
              style={{
                animation: active ? "arc-flow 2.5s 0.3s linear infinite" : "none",
              }}
            />
            <path
              d="M 580 140 C 660 140, 660 340, 740 340"
              stroke="url(#flow-line)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
              markerEnd="url(#flow-arrow)"
              style={{
                animation: active ? "arc-flow 2.5s 0.3s linear infinite" : "none",
              }}
            />
            {/* 3 → 4 merge */}
            <path
              d="M 1000 90 C 1060 90, 1060 220, 1020 220"
              stroke="url(#flow-line)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
              markerEnd="url(#flow-arrow)"
              style={{
                animation: active ? "arc-flow 2.5s 0.6s linear infinite" : "none",
              }}
            />
            <path
              d="M 1000 340 C 1060 340, 1060 220, 1020 220"
              stroke="url(#flow-line)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
              markerEnd="url(#flow-arrow)"
              style={{
                animation: active ? "arc-flow 2.5s 0.6s linear infinite" : "none",
              }}
            />
          </svg>

          {/* Grid cards — positioned in 12-col grid × 2-row */}
          <div className="relative grid grid-cols-12 gap-6" style={{ minHeight: 440 }}>
            {NODES.map((node) => {
              const style: React.CSSProperties = {
                gridColumnStart: node.col,
                gridColumnEnd: `span ${node.span ?? 2}`,
                gridRowStart: node.row,
                alignSelf: "center",
              };
              return (
                <div
                  key={node.id}
                  style={style}
                  className={active ? "animate-fade-up" : "opacity-0"}
                >
                  <FlowCard
                    node={node}
                    active={active}
                    highlight={node.id === "inject"}
                  />
                </div>
              );
            })}
          </div>

          {/* Branch label */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border)] bg-[var(--bg)]/70 px-3 py-1 text-[11px] font-medium text-[var(--muted)] backdrop-blur-sm">
            任选其一
          </div>
        </div>

        {/* Mobile flow — vertical stack with a left rail line */}
        <div className="relative block md:hidden">
          <div className="absolute left-5 top-4 bottom-4 w-px bg-gradient-to-b from-[var(--border)] via-[var(--border-strong)] to-[var(--border)]" />
          <div className="space-y-5">
            {NODES.map((node, i) => (
              <div key={node.id} className="relative flex gap-4 pl-1">
                <span
                  className={`relative z-10 mt-4 flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${
                    i === 2 || i === 3 ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-60"
                  />
                </span>
                <div className="flex-1">
                  <FlowCard node={node} active highlight={node.id === "inject"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Theme repeat — 主题短语复诵 */}
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="h-px w-24 bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent"
          />
          <p className="text-sm font-semibold tracking-tight">
            <span className="text-accent-gradient">手机即键盘</span>
            <span className="ml-2 text-[var(--muted)]">
              — 一条消息，走完全程。
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
