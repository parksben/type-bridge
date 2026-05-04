import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Eraser, History } from "lucide-react";
import {
  useAppStore,
  CHANNEL_LABEL,
  type ChannelId,
  type HistoryMessage,
  type MessageStatus,
} from "../../store";
import HistoryCard from "../HistoryCard";

type ChannelFilter = "all" | ChannelId;

export default function HistoryTab() {
  const {
    history,
    hiddenHistoryIds,
    setHistory,
    updateHistoryStatus,
    removeHistoryMessage,
    clearHistoryDisplay,
  } = useAppStore();
  const [imagesBaseDir, setImagesBaseDir] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  // 按渠道分组计数（不受 filter 影响；让 chip 始终显示各渠道总量）
  const channelCounts = useMemo(() => {
    const counts: Partial<Record<ChannelId, number>> = {};
    for (const m of history) {
      if (hiddenHistoryIds.has(m.id)) continue;
      counts[m.channel] = (counts[m.channel] ?? 0) + 1;
    }
    return counts;
  }, [history, hiddenHistoryIds]);

  // 过滤出软清空后仍可见 + 按渠道筛选的消息
  const visible = useMemo(
    () =>
      history
        .filter((m) => !hiddenHistoryIds.has(m.id))
        .filter((m) => channelFilter === "all" || m.channel === channelFilter),
    [history, hiddenHistoryIds, channelFilter]
  );

  // 初次加载历史 + 解析 typebridge 目录绝对路径
  useEffect(() => {
    invoke<HistoryMessage[]>("get_history").then(setHistory).catch(() => {});
    invoke<string>("get_history_dir").then(setImagesBaseDir).catch(() => {});
  }, []);

  // 监听整体结构变化（新增/删除）→ 重新拉
  useEffect(() => {
    const un = listen("typebridge://history-update", () => {
      invoke<HistoryMessage[]>("get_history").then(setHistory).catch(() => {});
    });
    return () => { un.then((f) => f()); };
  }, []);

  // 监听单条状态变化 → 仅更新 status 字段（更高效）
  useEffect(() => {
    const un = listen<{ id: string; status: MessageStatus; reason?: string }>(
      "typebridge://message-status",
      (e) => {
        updateHistoryStatus(e.payload.id, e.payload.status, e.payload.reason);
      }
    );
    return () => { un.then((f) => f()); };
  }, []);

  const stats = useMemo(() => {
    let sent = 0, failed = 0, processing = 0, queued = 0;
    for (const m of visible) {
      switch (m.status) {
        case "sent": sent++; break;
        case "failed": failed++; break;
        case "processing": processing++; break;
        case "queued": queued++; break;
      }
    }
    return { sent, failed, processing, queued };
  }, [visible]);

  async function handleDelete(id: string) {
    await invoke("delete_history_message", { id }).catch(() => {});
    removeHistoryMessage(id);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <FilterChip
            label="全部"
            count={visible.length}
            active={channelFilter === "all"}
            onClick={() => setChannelFilter("all")}
          />
          {(["webchat", "feishu", "dingtalk", "wecom"] as ChannelId[]).map((ch) => {
            const count = channelCounts[ch];
            if (count === undefined) return null; // 无此渠道消息 → 不显示 chip
            return (
              <FilterChip
                key={ch}
                label={CHANNEL_LABEL[ch]}
                count={count}
                active={channelFilter === ch}
                onClick={() => setChannelFilter(ch)}
              />
            );
          })}
          <div className="text-[11.5px] font-mono text-muted ml-2">
            <span className="text-success">已发送 {stats.sent}</span>
            <span className="text-error ml-2">失败 {stats.failed}</span>
            {(stats.processing > 0 || stats.queued > 0) && (
              <span className="text-accent ml-2">处理中 {stats.processing + stats.queued}</span>
            )}
          </div>
        </div>
        {visible.length > 0 && (
          <button
            onClick={async () => {
              if (!window.confirm("清空全部历史消息？\n队列中尚未注入的对应条目也会被取消。")) {
                return;
              }
              await invoke("clear_all_history").catch(() => {});
              clearHistoryDisplay();
            }}
            className="tb-btn-ghost flex items-center gap-1.5"
            title="删除所有历史，并取消队列中尚未注入的对应条目"
          >
            <Eraser size={12} strokeWidth={1.75} />
            清空
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-6 py-4">
        {visible.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-subtle">
            <History size={32} strokeWidth={1.25} className="mb-3 opacity-60" />
            <div className="text-[15px] text-muted mb-1.5">暂无消息记录</div>
            <div className="text-[12px] max-w-xs">
              连接飞书后，机器人收到的消息将进入队列并在这里展示
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-w-2xl mx-auto">
            {visible.map((msg) => (
              <HistoryCard
                key={msg.id}
                message={msg}
                imagesBaseDir={imagesBaseDir}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/// 渠道筛选 chip。active 用 accent 色填充，非 active 灰底。
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] text-[11.5px] transition-colors"
      style={
        active
          ? {
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }
          : {
              background: "var(--surface-2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }
      }
    >
      <span>{label}</span>
      <span className="font-mono opacity-80">{count}</span>
    </button>
  );
}
