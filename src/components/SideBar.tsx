import { History, Info, Plug, Terminal, Settings2, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";
import { useI18n, type TKey } from "../i18n";

interface TabDef {
  id: TabId;
  labelKey: TKey;
  icon: LucideIcon;
}

// 主 tab 列表。
// 关于 TypeBridge 不在这里 — 它作为弱化的 footer entry 独立渲染（小一号、灰一些）
const TABS: TabDef[] = [
  { id: "connection", labelKey: "sidebar.connection", icon: Plug },
  { id: "input", labelKey: "sidebar.input", icon: Settings2 },
  { id: "history", labelKey: "sidebar.history", icon: History },
  { id: "logs", labelKey: "sidebar.logs", icon: Terminal },
];

const ABOUT_TAB: TabDef = { id: "about", labelKey: "sidebar.about", icon: Info };

export default function SideBar() {
  const { activeTab, setActiveTab } = useAppStore();
  const { t } = useI18n();

  return (
    <div
      className="w-[184px] shrink-0 flex flex-col h-full"
      style={{
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <nav className="flex flex-col gap-0.5 px-2 py-3">
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            label={t(tab.labelKey)}
            active={tab.id === activeTab}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </nav>

      {/* 底部弱化入口区：关于 TypeBridge */}
      <div className="mt-auto px-2 py-2 flex flex-col gap-0.5">
        <FooterTabButton
          tab={ABOUT_TAB}
          label={t(ABOUT_TAB.labelKey)}
          active={activeTab === ABOUT_TAB.id}
          onClick={() => setActiveTab(ABOUT_TAB.id)}
        />
      </div>
    </div>
  );
}

function TabButton({
  tab,
  label,
  active,
  onClick,
}: {
  tab: TabDef;
  label: string;
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
      <span className="truncate">{label}</span>
    </button>
  );
}

/// 底部弱化版本：相对主 tab 字号 -1px、颜色更灰、active 态不再上 accent 侧条，
/// 仅微弱底色变化。这样视觉上和主功能 tab 拉开层级，避免「关于」抢主动线注意力。
function FooterTabButton({
  tab,
  label,
  active,
  onClick,
}: {
  tab: TabDef;
  label: string;
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
      <span className="truncate">{label}</span>
    </button>
  );
}
