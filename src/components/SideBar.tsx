import { History, Plug, Terminal, Settings2, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

// 顶部 3 个主 tab。系统日志不在这里 — 它作为底部固定入口独立渲染（v0.7+）。
const TABS: TabDef[] = [
  { id: "connection", label: "连接 TypeBridge", icon: Plug },
  { id: "input", label: "输入设置", icon: Settings2 },
  { id: "history", label: "历史消息", icon: History },
];

const LOG_TAB: TabDef = { id: "logs", label: "系统日志", icon: Terminal };

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

      {/* 底部固定：系统日志入口。连接状态不在底部冗余展示 —
          已经由「连接 TypeBridge」tab 里的横向子 tab 承担。 */}
      <div
        className="mt-auto px-2 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <TabButton
          tab={LOG_TAB}
          active={activeTab === LOG_TAB.id}
          onClick={() => setActiveTab(LOG_TAB.id)}
        />
      </div>
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
