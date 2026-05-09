import { useState } from "react";
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
  X,
} from "lucide-react";
import { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import { t, type TKey } from "@/i18n";

type Props = {
  client: WebChatClient;
  disabled: boolean;
  onClose?: () => void;
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
const NAV_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdHome",      Icon: ArrowLeftToLine,  spec: { type: "key",   code: "Home" } },
  { labelKey: "monitor.cmdEnd",       Icon: ArrowRightToLine, spec: { type: "key",   code: "End" } },
  { labelKey: "monitor.cmdPageUp",    Icon: ArrowUpToLine,    spec: { type: "key",   code: "PageUp" } },
  { labelKey: "monitor.cmdPageDown",  Icon: ArrowDownToLine,  spec: { type: "key",   code: "PageDown" } },
  { labelKey: "monitor.cmdDocTop",    Icon: ChevronsUp,       spec: { type: "combo", combo: "DocTop" } },
  { labelKey: "monitor.cmdDocBottom", Icon: ChevronsDown,     spec: { type: "combo", combo: "DocBottom" } },
];

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
        minHeight: large ? "76px" : "68px",
        padding: "10px 6px",
      }}
    >
      <Icon size={large ? 22 : 20} strokeWidth={2} />
      <span
        className="text-[11px] leading-none text-center font-medium"
        style={{ color: accent ? "var(--tb-danger)" : "var(--tb-muted)" }}
      >
        {t(labelKey)}
      </span>
    </button>
  );
}

// ─── Main ──────────────────────────────────────────────────────

export default function QuickCommands({ client, disabled, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("arrows");
  const [error, setError] = useState<string | null>(null);

  const TABS: { id: TabId; label: string }[] = [
    { id: "arrows",    label: t("monitor.cmdGroupArrows") },
    { id: "nav",       label: t("monitor.cmdGroupNav") },
    { id: "edit",      label: t("monitor.cmdGroupEdit") },
    { id: "clipboard", label: t("monitor.cmdGroupClipboard") },
  ];

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
      // 全选 → 删除
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
      {/* Sheet header */}
      {onClose && (
        <div
          className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0"
          style={{ borderBottom: "1px solid var(--tb-border)" }}
        >
          <span className="text-[15px] font-semibold" style={{ color: "var(--tb-text)" }}>
            {t("monitor.modeShortcuts")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: "var(--tb-bg)", color: "var(--tb-muted)" }}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded-xl text-[12px] text-center"
          style={{
            background: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
            color: "var(--tb-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Horizontal tab bar ─────────────────────────────── */}
      <div
        className="flex gap-1 px-4 pt-3 pb-2 shrink-0 overflow-x-auto scrollbar-none"
        style={{ borderBottom: "1px solid var(--tb-border)" }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className="px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors shrink-0"
            style={{
              background: activeTab === id ? "var(--tb-accent)" : "var(--tb-surface)",
              color: activeTab === id ? "white" : "var(--tb-muted)",
              border: activeTab === id ? "none" : "1px solid var(--tb-border)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* Arrows tab */}
        {activeTab === "arrows" && (
          <div className="flex flex-col gap-2 items-center">
            {/* Row 1: Up */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
              <div />
              <CmdButton cmd={CMD_UP}    onPress={handlePress} disabled={disabled} large />
              <div />
            </div>
            {/* Row 2: Left / Down / Right */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
              <CmdButton cmd={CMD_LEFT}  onPress={handlePress} disabled={disabled} large />
              <CmdButton cmd={CMD_DOWN}  onPress={handlePress} disabled={disabled} large />
              <CmdButton cmd={CMD_RIGHT} onPress={handlePress} disabled={disabled} large />
            </div>
          </div>
        )}

        {/* Nav tab */}
        {activeTab === "nav" && (
          <div className="grid grid-cols-2 gap-2">
            {NAV_CMDS.map((cmd) => (
              <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
            ))}
          </div>
        )}

        {/* Edit tab */}
        {activeTab === "edit" && (
          <div className="grid grid-cols-2 gap-2">
            {EDIT_CMDS.map((cmd) => (
              <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
            ))}
          </div>
        )}

        {/* Clipboard tab */}
        {activeTab === "clipboard" && (
          <div className="grid grid-cols-2 gap-2">
            {CLIPBOARD_CMDS.map((cmd) => (
              <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
            ))}
          </div>
        )}

      </div>
    </>
  );
}
