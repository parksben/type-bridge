import { History, Plug, Terminal, Settings2, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: "connection", label: "连接飞书 Bot", icon: Plug },
  { id: "history", label: "消息历史", icon: History },
  { id: "logs", label: "系统日志", icon: Terminal },
  { id: "input", label: "输入设置", icon: Settings2 },
];

export default function SideBar() {
  const { activeTab, setActiveTab, connected } = useAppStore();

  return (
    <div
      className="w-[150px] shrink-0 flex flex-col h-full"
      style={{
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <nav className="flex flex-col gap-0.5 px-2 py-3">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-2 pl-3 pr-2.5 h-9 text-[13px] rounded-md transition-colors text-left ${
                active ? "text-text" : "text-muted hover:text-text"
              }`}
              style={
                active
                  ? { background: "var(--surface-2)" }
                  : undefined
              }
            >
              {active && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm"
                  style={{ background: "var(--accent)" }}
                />
              )}
              <Icon size={14} strokeWidth={active ? 2 : 1.75} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="mt-auto px-3 py-3 flex items-center gap-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "dot-connected" : "dot-idle"
          }`}
        />
        <span className="text-[11.5px] text-muted">
          {connected ? "已连接" : "未连接"}
        </span>
      </div>
    </div>
  );
}
