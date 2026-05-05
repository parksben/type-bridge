import { History, Info, Plug, Terminal, Settings2, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

// 主 tab 列表（v0.7.x 起系统日志回归常规 tab，不再单独占底部 slot）
const TABS: TabDef[] = [
  { id: "connection", label: "连接 TypeBridge", icon: Plug },
  { id: "input", label: "输入设置", icon: Settings2 },
  { id: "history", label: "历史消息", icon: History },
  { id: "logs", label: "系统日志", icon: Terminal },
  { id: "about", label: "关于 TypeBridge", icon: Info },
];

export default function SideBar() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <div
      className="w-[150px] shrink-0 flex flex-col h-full"
      style={{
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <nav className="flex flex-col gap-0.5 px-2 py-3">
        {TABS.map((t) => (
          <TabButton key={t.id} tab={t} active={t.id === activeTab} onClick={() => setActiveTab(t.id)} />
        ))}
      </nav>
    </div>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: TabDef;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 pl-3 pr-2.5 h-9 text-[13px] rounded-md transition-colors text-left ${
        active ? "text-text" : "text-muted hover:text-text"
      }`}
      style={active ? { background: "var(--surface-2)" } : undefined}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm"
          style={{ background: "var(--accent)" }}
        />
      )}
      <Icon size={14} strokeWidth={active ? 2 : 1.75} />
      <span className="truncate">{tab.label}</span>
    </button>
  );
}
