import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, LogEntry } from "../store";

const kindLabel: Record<LogEntry["kind"], string> = {
  connect: "连接",
  message: "消息",
  inject: "注入",
  error: "错误",
  notify: "通知",
};

const kindColor: Record<LogEntry["kind"], string> = {
  connect: "text-blue-500",
  message: "text-gray-700",
  inject: "text-green-600",
  error: "text-red-500",
  notify: "text-yellow-600",
};

export default function LogWindow() {
  const logs = useAppStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function openLogDir() {
    const dir = await invoke<string>("get_log_dir");
    const { open } = await import("@tauri-apps/plugin-opener");
    await open(dir);
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="font-semibold text-gray-800">消息日志</span>
        <button
          onClick={openLogDir}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          在访达中显示
        </button>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-xs px-4 py-3 space-y-1">
        {logs.length === 0 && (
          <div className="text-gray-400 mt-4 text-center text-sm">暂无日志</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-400 shrink-0">{log.time}</span>
            <span className={`shrink-0 font-medium ${kindColor[log.kind]}`}>
              [{kindLabel[log.kind]}]
            </span>
            <span className="text-gray-700 break-all">{log.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          日志文件：~/Library/Logs/TypeBridge/
        </span>
      </div>
    </div>
  );
}
