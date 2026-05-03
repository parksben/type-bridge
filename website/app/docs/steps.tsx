import {
  CheckCircle2,
  Info,
} from "lucide-react";
import type { ReactNode } from "react";

// ── Shared tutorial UI components ──────────────────────────────
// Used by /docs/feishu, /docs/dingtalk, /docs/wecom pages.

export function StepSection({
  number,
  title,
  duration,
  anchorId,
  children,
}: {
  number: number;
  title: string;
  duration?: string;
  anchorId?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={anchorId}
      {...(anchorId ? { "data-step-anchor": "true", "data-step-title": title } : {})}
      className="mb-10"
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="w-9 h-9 rounded-xl bg-[var(--tb-accent)] text-white flex items-center justify-center text-sm font-bold shrink-0">
          {number}
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {duration && (
            <span className="text-xs text-[var(--tb-muted)]">{duration}</span>
          )}
        </div>
      </div>
      <div className="pl-[52px] space-y-6">{children}</div>
    </section>
  );
}

export function StepDetail({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {title && (
        <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
      )}
      <div className="text-[var(--tb-muted)] text-[15px] leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}

export function ScreenshotPlaceholder({ description }: { description: string }) {
  return (
    <div className="my-4 rounded-lg border-2 border-dashed border-[var(--tb-border)] bg-[var(--tb-surface)] p-6 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <Info size={18} className="text-[var(--tb-muted)]" />
      </div>
      <p className="text-xs text-[var(--tb-muted)] leading-relaxed">
        截图占位 — {description}
      </p>
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/30">
      <Info size={15} className="text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
      <p className="text-sm text-blue-700 dark:text-blue-400/80">{children}</p>
    </div>
  );
}

export function DoneBox() {
  return (
    <div className="p-6 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/30 mb-10">
      <div className="flex items-start gap-3">
        <CheckCircle2
          size={20}
          className="text-green-600 dark:text-green-400 mt-0.5 shrink-0"
        />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-300 mb-1">
            配置完成！
          </p>
          <p className="text-sm text-green-700 dark:text-green-400/80 leading-relaxed">
            长连接建立后，向你的应用发送任意文本消息，TypeBridge
            会实时接收并注入到当前聚焦的输入框。你可以在 TypeBridge
            的「系统日志」tab 中查看每条消息的接收和处理状态。
          </p>
        </div>
      </div>
    </div>
  );
}
