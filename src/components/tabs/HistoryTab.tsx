import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { History, Trash2 } from "lucide-react";
import { useAppStore, type HistoryMessage, type MessageStatus } from "../../store";
import HistoryCard from "../HistoryCard";

export default function HistoryTab() {
  const { history, setHistory, updateHistoryStatus, removeHistoryMessage } = useAppStore();
  const [imagesBaseDir, setImagesBaseDir] = useState<string>("");

  // 初次加载历史 + 解析 typebridge 目录绝对路径
  useEffect(() => {
    invoke<HistoryMessage[]>("get_history").then(setHistory).catch(() => {});
    invoke<string>("get_history_dir").then(setImagesBaseDir).catch(() => {});
  }, []);

  // 监听整体结构变化（新增/删除）→ 重新拉
  useEffect(() => {
    const un = listen("feishu://history-update", () => {
      invoke<HistoryMessage[]>("get_history").then(setHistory).catch(() => {});
    });
    return () => { un.then((f) => f()); };
  }, []);

  // 监听单条状态变化 → 仅更新 status 字段（更高效）
  useEffect(() => {
    const un = listen<{ id: string; status: MessageStatus; reason?: string }>(
      "feishu://message-status",
      (e) => {
        updateHistoryStatus(e.payload.id, e.payload.status, e.payload.reason);
      }
    );
    return () => { un.then((f) => f()); };
  }, []);

  const stats = useMemo(() => {
    let sent = 0, failed = 0, processing = 0, queued = 0;
    for (const m of history) {
      switch (m.status) {
        case "sent": sent++; break;
        case "failed": failed++; break;
        case "processing": processing++; break;
        case "queued": queued++; break;
      }
    }
    return { sent, failed, processing, queued };
  }, [history]);

  async function handleDelete(id: string) {
    await invoke("delete_history_message", { id }).catch(() => {});
    removeHistoryMessage(id);
  }

  async function handleRetry(id: string) {
    try {
      await invoke("retry_history_message", { id });
    } catch (e) {
      // 即时反馈给用户
      console.error("retry failed", e);
    }
  }

  async function handleClearAll() {
    const confirmed = window.confirm("确定清空全部消息历史？此操作不可恢复。");
    if (!confirmed) return;
    for (const m of history) {
      await invoke("delete_history_message", { id: m.id }).catch(() => {});
    }
    setHistory([]);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="text-[11.5px] font-mono text-muted">
          最近 {history.length} 条
          <span className="text-success ml-2">已发送 {stats.sent}</span>
          <span className="text-error ml-2">失败 {stats.failed}</span>
          {(stats.processing > 0 || stats.queued > 0) && (
            <span className="text-accent ml-2">处理中 {stats.processing + stats.queued}</span>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="tb-btn-ghost flex items-center gap-1.5"
          >
            <Trash2 size={11} strokeWidth={1.75} />
            清空
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-6 py-4">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-subtle">
            <History size={32} strokeWidth={1.25} className="mb-3 opacity-60" />
            <div className="font-display italic text-2xl mb-1.5">awaiting messages</div>
            <div className="text-[12px] font-mono max-w-xs">
              连接飞书后，机器人收到的消息将进入队列并在这里展示
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-w-2xl mx-auto">
            {history.map((msg) => (
              <HistoryCard
                key={msg.id}
                message={msg}
                imagesBaseDir={imagesBaseDir}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
