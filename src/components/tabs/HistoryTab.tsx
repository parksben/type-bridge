import { History } from "lucide-react";

export default function HistoryTab() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-subtle">
      <History size={32} strokeWidth={1.25} className="mb-3 opacity-60" />
      <div className="font-display italic text-2xl mb-1.5">message history</div>
      <div className="text-[12px] font-mono max-w-xs">
        此 tab 将在后续迭代接入队列 + 持久化历史
      </div>
    </div>
  );
}
