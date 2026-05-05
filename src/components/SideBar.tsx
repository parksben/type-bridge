import { History, Info, Plug, Terminal, Settings2, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

// 主 tab 列表。
// 关于 TypeBridge 不在这里 — 它作为弱化的 footer entry 独立渲染（小一号、灰一些）
const TABS: TabDef[] = [
  { id: "connection", label: "连接 TypeBridge", icon: Plug },
  { id: "input", label: "输入设置", icon: Settings2 },
  { id: "history", label: "历史消息", icon: History },
  { id: "logs", label: "系统日志", icon: Terminal },
];

const ABOUT_TAB: TabDef = { id: "about", label: "关于 TypeBridge", icon: Info };

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

      {/* 底部弱化入口：关于 TypeBridge。小一号 + 灰阶配色，跟主 tab 风格区分 */}
      <div className="mt-auto px-2 py-2">
        <FooterTabButton
          tab={ABOUT_TAB}
          active={activeTab === ABOUT_TAB.id}
          onClick={() => setActiveTab(ABOUT_TAB.id)}
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

/// 底部弱化版本：相对主 tab 字号 -1px、颜色更灰、active 态不再上 accent 侧条，
/// 仅微弱底色变化。这样视觉上和主功能 tab 拉开层级，避免「关于」抢主动线注意力。
function FooterTabButton({
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
      className={`flex items-center gap-1.5 pl-3 pr-2.5 h-7 text-[12px] rounded-md transition-colors text-left w-full ${
        active ? "text-muted" : "text-subtle hover:text-muted"
      }`}
      style={active ? { background: "var(--surface-2)" } : undefined}
    >
      <Icon size={12} strokeWidth={1.5} />
      <span className="truncate">{tab.label}</span>
    </button>
  );
}
