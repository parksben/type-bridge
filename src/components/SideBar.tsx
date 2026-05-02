import { History, Plug, Terminal, Settings2, LucideIcon } from "lucide-react";
import { useAppStore, TabId } from "../store";

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

interface Section {
  /// 板块标签头：仅多 tab 板块展示，单 tab 板块直接展示按钮以避免文字重复
  label?: string;
  /// 板块内 tab 是否额外缩进（仅"服务配置"用 true）
  indented?: boolean;
  items: TabDef[];
}

const SECTIONS: Section[] = [
  {
    label: "服务配置",
    indented: true,
    items: [
      { id: "connection", label: "连接飞书 Bot", icon: Plug },
      { id: "connection-dingtalk", label: "连接钉钉 Bot", icon: Plug },
      { id: "connection-wecom", label: "连接企微 Bot", icon: Plug },
    ],
  },
  { items: [{ id: "input", label: "输入设置", icon: Settings2 }] },
  { items: [{ id: "history", label: "历史消息", icon: History }] },
  { items: [{ id: "logs", label: "系统日志", icon: Terminal }] },
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
      <nav className="flex flex-col px-2 py-3 gap-2">
        {SECTIONS.map((section, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            {section.label && (
              <div
                className="px-3 pt-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em]"
                style={{ color: "var(--muted)" }}
              >
                {section.label}
              </div>
            )}
            {section.items.map(({ id, label, icon: Icon }) => {
              const active = id === activeTab;
              const padLeft = section.indented ? "pl-7" : "pl-3";
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative flex items-center gap-2 ${padLeft} pr-2.5 h-9 text-[13px] rounded-md transition-colors text-left ${
                    active ? "text-text" : "text-muted hover:text-text"
                  }`}
                  style={
                    active ? { background: "var(--surface-2)" } : undefined
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
          </div>
        ))}
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
