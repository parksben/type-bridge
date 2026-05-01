import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, LogEntry } from "../store";

const kindLabel: Record<LogEntry["kind"], string> = {
  connect: "连接",
  message: "消息",
  inject: "输入",
  error: "错误",
  notify: "通知",
};

const kindClass: Record<LogEntry["kind"], string> = {
  connect: "text-accent",
  message: "text-text",
  inject: "text-success",
  error: "text-error",
  notify: "text-muted",
};

export default function LogWindow() {
  const logs = useAppStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function openLogDir() {
    const dir = await invoke<string>("get_log_dir");
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(dir);
  }

  return (
    <div className="relative h-screen w-full flex flex-col animate-enter">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-display text-[22px] text-text leading-none">日志</span>
          <span className="text-[11px] font-mono text-subtle uppercase tracking-[0.12em]">
            {logs.length} 条记录
          </span>
        </div>
        <button onClick={openLogDir} className="tb-btn-ghost">
          在访达中显示 →
        </button>
      </div>

      {/* Log list */}
      <div className="relative z-10 flex-1 overflow-y-auto thin-scroll px-6 py-4">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="font-display italic text-2xl text-subtle mb-2">awaiting messages</div>
            <div className="text-[12px] text-subtle font-mono">连接飞书后，消息将出现在这里</div>
          </div>
        ) : (
          <div className="font-mono text-[12px] space-y-1.5">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3 leading-relaxed">
                <span className="text-subtle shrink-0 tabular-nums">{log.time}</span>
                <span className={`shrink-0 font-medium ${kindClass[log.kind]}`}>
                  {kindLabel[log.kind]}
                </span>
                <span className="text-text break-all">{log.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 py-2.5 border-t border-border">
        <span className="text-[11px] font-mono text-subtle">
          ~/Library/Logs/TypeBridge/
        </span>
      </div>
    </div>
  );
}
