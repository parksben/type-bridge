import { History, Plug, Terminal, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: "connection", label: "连接", icon: Plug },
  { id: "history", label: "消息历史", icon: History },
  { id: "logs", label: "系统日志", icon: Terminal },
];

export default function TabBar() {
  const { activeTab, setActiveTab, connected } = useAppStore();

  return (
    <div className="flex items-center justify-between px-5 h-11 border-b border-border bg-surface">
      <div className="flex items-center gap-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-1.5 px-3 h-11 text-[13px] transition-colors ${
                active ? "text-text" : "text-muted hover:text-text"
              }`}
            >
              <Icon size={14} strokeWidth={active ? 2 : 1.75} />
              {label}
              {active && (
                <span
                  className="absolute left-2 right-2 bottom-0 h-[2px] bg-accent rounded-t-sm"
                  style={{ transition: "all 160ms ease" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-muted">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "dot-connected" : "dot-idle"
          }`}
        />
        <span className="text-[11.5px]">
          {connected ? "已连接" : "未连接"}
        </span>
      </div>
    </div>
  );
}
