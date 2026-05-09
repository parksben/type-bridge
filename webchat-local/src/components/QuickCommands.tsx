import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Undo2,
  Redo2,
  CornerDownLeft,
  Delete,
  Maximize2,
  Copy,
  Scissors,
  ClipboardPaste,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronsUp,
  ChevronsDown,
  Trash2,
  LogOut,
} from "lucide-react";
import { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import { t, type TKey } from "@/i18n";

type Props = {
  client: WebChatClient;
  disabled: boolean;
};

type CmdSpec =
  | { type: "key"; code: string }
  | { type: "text"; text: string }
  | { type: "combo"; combo: string }
  | { type: "clear" };                 // SelectAll + Backspace

type CmdDef = {
  labelKey: TKey;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  spec: CmdSpec;
  accent?: boolean;
};

type TabId = "arrows" | "nav" | "edit" | "clipboard";

// ─── Arrows ────────────────────────────────────────────────────
const CMD_UP: CmdDef    = { labelKey: "monitor.cmdArrowUp",    Icon: ArrowUp,    spec: { type: "key", code: "ArrowUp" } };
const CMD_DOWN: CmdDef  = { labelKey: "monitor.cmdArrowDown",  Icon: ArrowDown,  spec: { type: "key", code: "ArrowDown" } };
const CMD_LEFT: CmdDef  = { labelKey: "monitor.cmdArrowLeft",  Icon: ArrowLeft,  spec: { type: "key", code: "ArrowLeft" } };
const CMD_RIGHT: CmdDef = { labelKey: "monitor.cmdArrowRight", Icon: ArrowRight, spec: { type: "key", code: "ArrowRight" } };

// ─── Navigation ────────────────────────────────────────────────
const CMD_HOME: CmdDef       = { labelKey: "monitor.cmdHome",      Icon: ArrowLeftToLine,  spec: { type: "key",   code: "Home" } };
const CMD_END: CmdDef        = { labelKey: "monitor.cmdEnd",       Icon: ArrowRightToLine, spec: { type: "key",   code: "End" } };
const CMD_PAGE_UP: CmdDef    = { labelKey: "monitor.cmdPageUp",    Icon: ArrowUpToLine,    spec: { type: "key",   code: "PageUp" } };
const CMD_PAGE_DOWN: CmdDef  = { labelKey: "monitor.cmdPageDown",  Icon: ArrowDownToLine,  spec: { type: "key",   code: "PageDown" } };
const CMD_DOC_TOP: CmdDef    = { labelKey: "monitor.cmdDocTop",    Icon: ChevronsUp,       spec: { type: "combo", combo: "DocTop" } };
const CMD_DOC_BOTTOM: CmdDef = { labelKey: "monitor.cmdDocBottom", Icon: ChevronsDown,     spec: { type: "combo", combo: "DocBottom" } };

// ─── Edit ──────────────────────────────────────────────────────
const EDIT_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdUndo",    Icon: Undo2,         spec: { type: "combo", combo: "Undo" } },
  { labelKey: "monitor.cmdRedo",    Icon: Redo2,         spec: { type: "combo", combo: "Redo" } },
  { labelKey: "monitor.cmdNewline", Icon: CornerDownLeft, spec: { type: "key", code: "Enter" } },
  { labelKey: "monitor.cmdDelete",  Icon: Delete,        spec: { type: "key", code: "Backspace" }, accent: true },
  { labelKey: "monitor.cmdClear",   Icon: Trash2,        spec: { type: "clear" }, accent: true },
  { labelKey: "monitor.cmdEscape",  Icon: LogOut,        spec: { type: "key", code: "Escape" } },
];

// ─── Clipboard ─────────────────────────────────────────────────
const CLIPBOARD_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdSelectAll", Icon: Maximize2,      spec: { type: "combo", combo: "SelectAll" } },
  { labelKey: "monitor.cmdCopy",      Icon: Copy,           spec: { type: "combo", combo: "Copy" } },
  { labelKey: "monitor.cmdCut",       Icon: Scissors,       spec: { type: "combo", combo: "Cut" } },
  { labelKey: "monitor.cmdPaste",     Icon: ClipboardPaste, spec: { type: "combo", combo: "Paste" } },
];

// ─── CmdButton ─────────────────────────────────────────────────

function CmdButton({
  cmd,
  onPress,
  disabled,
  large = false,
}: {
  cmd: CmdDef;
  onPress: (cmd: CmdDef) => void;
  disabled: boolean;
  large?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const { Icon, labelKey, accent } = cmd;

  return (
    <button
      type="button"
      onTouchStart={(e) => { e.stopPropagation(); if (!disabled) setPressed(true); }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setPressed(false);
        if (!disabled) onPress(cmd);
      }}
      onTouchCancel={() => setPressed(false)}
      onClick={() => { if (!disabled) onPress(cmd); }}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl select-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: pressed
          ? "color-mix(in srgb, var(--tb-text) 12%, var(--tb-surface))"
          : "var(--tb-surface)",
        border: `1px solid ${pressed ? "var(--tb-text)" : "var(--tb-border)"}`,
        color: accent ? "var(--tb-danger)" : "var(--tb-text)",
        minHeight: large ? "96px" : "88px",
        padding: "14px 8px",
      }}
    >
      <Icon size={large ? 26 : 24} strokeWidth={2} />
      <span
        className="text-[12px] leading-none text-center font-medium"
        style={{ color: accent ? "var(--tb-danger)" : "var(--tb-muted)" }}
      >
        {t(labelKey)}
      </span>
    </button>
  );
}

// ─── Main ──────────────────────────────────────────────────────

const TAB_IDS: TabId[] = ["arrows", "nav", "edit", "clipboard"];

export default function QuickCommands({ client, disabled }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("arrows");
  const [error, setError] = useState<string | null>(null);
  // 是否正在程序化滚动（点击 Tab 触发），期间暂停 scroll spy
  const isProgrammaticScroll = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<TabId, HTMLDivElement | null>>({
    arrows: null, nav: null, edit: null, clipboard: null,
  });

  const TABS: { id: TabId; label: string }[] = [
    { id: "arrows",    label: t("monitor.cmdGroupArrows") },
    { id: "nav",       label: t("monitor.cmdGroupNav") },
    { id: "edit",      label: t("monitor.cmdGroupEdit") },
    { id: "clipboard", label: t("monitor.cmdGroupClipboard") },
  ];

  // ── Scroll spy ───────────────────────────────────────────────
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function onScroll() {
      if (isProgrammaticScroll.current) return;
      const st = container!.scrollTop;
      let current: TabId = "arrows";
      for (const id of TAB_IDS) {
        const el = sectionRefs.current[id];
        if (el && el.offsetTop <= st + 48) current = id;
      }
      setActiveTab(current);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // ── Click tab → scroll to section ───────────────────────────
  function handleTabClick(id: TabId) {
    setActiveTab(id);
    const el = sectionRefs.current[id];
    const container = scrollRef.current;
    if (!el || !container) return;

    isProgrammaticScroll.current = true;
    container.scrollTo({ top: el.offsetTop, behavior: "smooth" });

    // smooth scroll 结束后恢复 spy（通常 300-500ms）
    setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
  }

  async function handlePress(cmd: CmdDef) {
    if (disabled) return;
    let success = true;
    let reason: string | undefined;

    if (cmd.spec.type === "key") {
      const ack = await client.sendKey(newClientMessageId(), cmd.spec.code);
      success = ack.success; reason = ack.reason;
    } else if (cmd.spec.type === "text") {
      const ack = await client.sendText(newClientMessageId(), cmd.spec.text);
      success = ack.success; reason = ack.reason;
    } else if (cmd.spec.type === "combo") {
      const ack = await client.sendKeyCombo(newClientMessageId(), cmd.spec.combo);
      success = ack.success; reason = ack.reason;
    } else if (cmd.spec.type === "clear") {
      const ack1 = await client.sendKeyCombo(newClientMessageId(), "SelectAll");
      if (!ack1.success) { success = false; reason = ack1.reason; }
      else {
        await new Promise<void>((r) => setTimeout(r, 60));
        const ack2 = await client.sendKey(newClientMessageId(), "Backspace");
        success = ack2.success; reason = ack2.reason;
      }
    }

    if (!success) {
      setError(reason ?? t("monitor.cmdFailed"));
      setTimeout(() => setError(null), 2500);
    }
  }

  return (
    <>
      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded-xl text-[12px] text-center shrink-0"
          style={{
            background: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
            color: "var(--tb-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Underline tab bar ──────────────────────────────── */}
      <div
        className="flex shrink-0 overflow-x-auto scrollbar-none"
        style={{ borderBottom: "1px solid var(--tb-border)" }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabClick(id)}
            className="flex-1 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors relative"
            style={{ color: activeTab === id ? "var(--tb-accent)" : "var(--tb-muted)" }}
          >
            {label}
            {/* 下划线 */}
            <span
              className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-200"
              style={{
                width: activeTab === id ? "80%" : "0%",
                height: "2px",
                background: "var(--tb-accent)",
              }}
            />
          </button>
        ))}
      </div>

      {/* ── Scrollable content — all sections rendered ─────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {/* Arrows section */}
        <div
          ref={(el) => { sectionRefs.current["arrows"] = el; }}
          className="flex flex-col gap-3 items-center px-4 pt-5 pb-10"
        >
          <div className="grid grid-cols-3 gap-3 w-full max-w-[300px]">
            <div />
            <CmdButton cmd={CMD_UP}    onPress={handlePress} disabled={disabled} large />
            <div />
          </div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-[300px]">
            <CmdButton cmd={CMD_LEFT}  onPress={handlePress} disabled={disabled} large />
            <CmdButton cmd={CMD_DOWN}  onPress={handlePress} disabled={disabled} large />
            <CmdButton cmd={CMD_RIGHT} onPress={handlePress} disabled={disabled} large />
          </div>
        </div>

        {/* Nav section */}
        <div
          ref={(el) => { sectionRefs.current["nav"] = el; }}
          className="flex flex-col gap-3 px-4 pt-5 pb-10"
          style={{ borderTop: "1px solid var(--tb-border)" }}
        >
          <div className="grid grid-cols-2 gap-3">
            <CmdButton cmd={CMD_HOME}      onPress={handlePress} disabled={disabled} large />
            <CmdButton cmd={CMD_END}       onPress={handlePress} disabled={disabled} large />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-3">
              <CmdButton cmd={CMD_PAGE_UP}    onPress={handlePress} disabled={disabled} large />
              <CmdButton cmd={CMD_PAGE_DOWN}  onPress={handlePress} disabled={disabled} large />
            </div>
            <div className="flex flex-col gap-3">
              <CmdButton cmd={CMD_DOC_TOP}    onPress={handlePress} disabled={disabled} large />
              <CmdButton cmd={CMD_DOC_BOTTOM} onPress={handlePress} disabled={disabled} large />
            </div>
          </div>
        </div>

        {/* Edit section */}
        <div
          ref={(el) => { sectionRefs.current["edit"] = el; }}
          className="grid grid-cols-2 gap-3 px-4 pt-5 pb-10"
          style={{ borderTop: "1px solid var(--tb-border)" }}
        >
          {EDIT_CMDS.map((cmd) => (
            <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} large />
          ))}
        </div>

        {/* Clipboard section */}
        <div
          ref={(el) => { sectionRefs.current["clipboard"] = el; }}
          className="grid grid-cols-2 gap-3 px-4 pt-5"
          style={{ borderTop: "1px solid var(--tb-border)" }}
        >
          {CLIPBOARD_CMDS.map((cmd) => (
            <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} large />
          ))}
        </div>

        {/* 底部撑高，确保最后一个 section 可滚动到顶部 */}
        <div style={{ height: "50vh" }} aria-hidden />

      </div>
    </>
  );
}
