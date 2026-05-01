import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  Bell,
  Cable,
  ExternalLink,
  Inbox,
  Keyboard,
  MessageSquare,
} from "lucide-react";
import { useAppStore, LogEntry } from "../store";

const kindLabel: Record<LogEntry["kind"], string> = {
  connect: "连接",
  message: "消息",
  inject: "输入",
  error: "错误",
  notify: "通知",
};

const KindIcon: Record<LogEntry["kind"], typeof Cable> = {
  connect: Cable,
  message: MessageSquare,
  inject: Keyboard,
  error: AlertCircle,
  notify: Bell,
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
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-display text-[22px] text-text leading-none">日志</span>
          <span className="text-[11px] font-mono text-subtle uppercase tracking-[0.12em]">
            {logs.length} 条记录
          </span>
        </div>
        <button onClick={openLogDir} className="tb-btn-ghost flex items-center gap-1.5">
          在访达中显示
          <ExternalLink size={12} strokeWidth={1.75} />
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto thin-scroll px-6 py-4">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-subtle">
            <Inbox size={32} strokeWidth={1.25} className="mb-3 opacity-60" />
            <div className="font-display italic text-2xl mb-1.5">awaiting messages</div>
            <div className="text-[12px] font-mono">连接飞书后，消息将出现在这里</div>
          </div>
        ) : (
          <div className="font-mono text-[12px] space-y-1.5">
            {logs.map((log, i) => {
              const Icon = KindIcon[log.kind];
              return (
                <div key={i} className="flex items-start gap-3 leading-relaxed">
                  <span className="text-subtle shrink-0 tabular-nums pt-[2px]">{log.time}</span>
                  <span className={`shrink-0 flex items-center gap-1 font-medium pt-[2px] ${kindClass[log.kind]}`}>
                    <Icon size={11} strokeWidth={1.75} />
                    {kindLabel[log.kind]}
                  </span>
                  <span className="text-text break-all">{log.text}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="relative z-10 px-6 py-2.5 border-t border-border">
        <span className="text-[11px] font-mono text-subtle">
          ~/Library/Logs/TypeBridge/
        </span>
      </div>
    </div>
  );
}
