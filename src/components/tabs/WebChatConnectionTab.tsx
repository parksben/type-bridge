import { AlertTriangle, Construction, Rocket } from "lucide-react";

/// WebChat 渠道 v2 重构中占位页（P2a 阶段）。
///
/// 旧版"轮询 Netlify 中继"实现已清理，新版"本机 HTTP + Socket.IO server"
/// 将在后续阶段（P2b 起）逐步上线。本组件提供最简单的状态告知，不与任何
/// Rust 命令交互，不崩溃、不报错。P4 阶段会完整改造成新 UI。
export default function WebChatConnectionTab() {
  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <div
          className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <Construction
            size={13}
            strokeWidth={1.75}
            className="shrink-0 mt-0.5 text-accent"
          />
          <div className="flex-1 text-text">
            WebChat 渠道正在进行架构升级（v1 云端中继 → v2 本地局域网 server），
            功能将在后续版本中完整恢复。此期间请改用飞书 / 钉钉 / 企微渠道。
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <AlertTriangle size={12} strokeWidth={1.75} />
            当前状态
          </label>
          <div
            className="rounded-lg px-3.5 py-3 text-[12.5px] leading-relaxed"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            v2 重构阶段：旧版实现已下线，新版桌面本机 HTTP + Socket.IO server
            正在实现中。完整体验上线后会再次启用本面板。
          </div>
        </div>

        <button
          disabled
          className="w-full h-10 rounded-lg font-medium text-[13px] flex items-center justify-center gap-1.5 cursor-not-allowed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--subtle)",
          }}
        >
          <Rocket size={14} strokeWidth={1.75} />
          启动会话 · 开发中
        </button>
      </div>
    </div>
  );
}
