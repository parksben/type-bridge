import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, Bell, Cable, Eraser, ExternalLink, Terminal } from "lucide-react";
import { useAppStore, LogEntry } from "../../store";

// 系统日志 tab 只展示运维/系统事件，不含 message / inject（这些归消息历史 tab）
const systemKinds: Set<LogEntry["kind"]> = new Set(["connect", "error", "notify"]);

const kindLabel: Record<LogEntry["kind"], string> = {
  connect: "连接",
  message: "消息",
  inject: "输入",
  error: "错误",
  notify: "通知",
};

const KindIcon: Record<LogEntry["kind"], typeof Cable> = {
  connect: Cable,
  message: Cable,
  inject: Cable,
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

export default function SystemLogTab() {
  const allLogs = useAppStore((s) => s.logs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const logs = allLogs.filter((l) => systemKinds.has(l.kind));
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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-muted">
          <Terminal size={14} strokeWidth={1.75} />
          <span className="text-[11px] font-mono uppercase tracking-[0.12em]">
            {logs.length} 条记录
          </span>
        </div>
        <div className="flex items-center gap-1">
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="tb-btn-ghost flex items-center gap-1.5"
              title="清空当前 UI 显示，不影响文件日志"
            >
              <Eraser size={12} strokeWidth={1.75} />
              清空
            </button>
          )}
          <button onClick={openLogDir} className="tb-btn-ghost flex items-center gap-1.5">
            在访达中显示
            <ExternalLink size={12} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-6 py-4">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-subtle">
            <Terminal size={28} strokeWidth={1.25} className="mb-3 opacity-60" />
            <div className="text-[15px] text-muted mb-1.5">暂无系统事件</div>
            <div className="text-[11.5px] max-w-xs">
              应用运行期间的连接、错误、通知事件将出现在这里
            </div>
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

      <div className="px-6 py-2.5 border-t border-border">
        <span className="text-[11px] font-mono text-subtle">
          ~/Library/Logs/TypeBridge/
        </span>
      </div>
    </div>
  );
}
