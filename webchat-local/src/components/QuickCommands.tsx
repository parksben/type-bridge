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
  | { type: "combo"; combo: string };

type CmdDef = {
  labelKey: TKey;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  spec: CmdSpec;
  accent?: boolean;
};

// ─── Arrow definitions (cross layout) ──────────────────────────
const CMD_UP: CmdDef    = { labelKey: "monitor.cmdArrowUp",    Icon: ArrowUp,    spec: { type: "key", code: "ArrowUp" } };
const CMD_DOWN: CmdDef  = { labelKey: "monitor.cmdArrowDown",  Icon: ArrowDown,  spec: { type: "key", code: "ArrowDown" } };
const CMD_LEFT: CmdDef  = { labelKey: "monitor.cmdArrowLeft",  Icon: ArrowLeft,  spec: { type: "key", code: "ArrowLeft" } };
const CMD_RIGHT: CmdDef = { labelKey: "monitor.cmdArrowRight", Icon: ArrowRight, spec: { type: "key", code: "ArrowRight" } };

// ─── Navigation ────────────────────────────────────────────────
const NAV_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdHome",     Icon: ArrowLeftToLine,  spec: { type: "key", code: "Home" } },
  { labelKey: "monitor.cmdEnd",      Icon: ArrowRightToLine, spec: { type: "key", code: "End" } },
  { labelKey: "monitor.cmdPageUp",   Icon: ArrowUpToLine,    spec: { type: "key", code: "PageUp" } },
  { labelKey: "monitor.cmdPageDown", Icon: ArrowDownToLine,  spec: { type: "key", code: "PageDown" } },
];

// ─── Edit ──────────────────────────────────────────────────────
const EDIT_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdUndo",    Icon: Undo2,         spec: { type: "combo", combo: "Undo" } },
  { labelKey: "monitor.cmdRedo",    Icon: Redo2,         spec: { type: "combo", combo: "Redo" } },
  { labelKey: "monitor.cmdNewline", Icon: CornerDownLeft, spec: { type: "text", text: "\n" } },
  { labelKey: "monitor.cmdDelete",  Icon: Delete,        spec: { type: "key", code: "Backspace" }, accent: true },
];

// ─── Clipboard ─────────────────────────────────────────────────
const CLIPBOARD_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdSelectAll", Icon: Maximize2,     spec: { type: "combo", combo: "SelectAll" } },
  { labelKey: "monitor.cmdCopy",      Icon: Copy,          spec: { type: "combo", combo: "Copy" } },
  { labelKey: "monitor.cmdCut",       Icon: Scissors,      spec: { type: "combo", combo: "Cut" } },
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

// ─── Section label ─────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-wider mb-2 mt-5 first:mt-0"
      style={{ color: "var(--tb-muted)", letterSpacing: "0.08em" }}
    >
      {children}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────

export default function QuickCommands({ client, disabled, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);

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
    } else {
      const ack = await client.sendKeyCombo(newClientMessageId(), cmd.spec.combo);
      success = ack.success; reason = ack.reason;
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
            style={{ background: "var(--tb-surface)", color: "var(--tb-muted)", border: "1px solid var(--tb-border)" }}
          >
            <X size={17} strokeWidth={2.2} />
          </button>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto scrollbar-none px-4 pb-8 safe-area-bottom"
        style={{ background: "var(--tb-bg)", paddingTop: onClose ? "12px" : "16px" }}
      >
        {/* Error toast */}
        {error && (
          <div
            className="mb-3 px-3 py-2 rounded-xl text-[12px] text-center"
            style={{
              background: "color-mix(in srgb, var(--tb-danger) 10%, transparent)",
              color: "var(--tb-danger)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Direction keys: cross layout ────────────────── */}
        <SectionLabel>{t("monitor.cmdGroupArrows")}</SectionLabel>
        {/* 3-col grid: [empty | ↑ | empty] [← | ↓ | →] */}
        <div className="grid grid-cols-3 gap-2">
          <div />
          <CmdButton cmd={CMD_UP}    onPress={handlePress} disabled={disabled} large />
          <div />
          <CmdButton cmd={CMD_LEFT}  onPress={handlePress} disabled={disabled} large />
          <CmdButton cmd={CMD_DOWN}  onPress={handlePress} disabled={disabled} large />
          <CmdButton cmd={CMD_RIGHT} onPress={handlePress} disabled={disabled} large />
        </div>

        {/* ── Navigation ──────────────────────────────────── */}
        <SectionLabel>{t("monitor.cmdGroupNav")}</SectionLabel>
        {/* 2-col: [行首 | 行尾] [页首 | 页尾] */}
        <div className="grid grid-cols-2 gap-2">
          {NAV_CMDS.map((cmd) => (
            <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
          ))}
        </div>

        {/* ── Edit ────────────────────────────────────────── */}
        <SectionLabel>{t("monitor.cmdGroupEdit")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {EDIT_CMDS.map((cmd) => (
            <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
          ))}
        </div>

        {/* ── Clipboard ───────────────────────────────────── */}
        <SectionLabel>{t("monitor.cmdGroupClipboard")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {CLIPBOARD_CMDS.map((cmd) => (
            <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
          ))}
        </div>
      </div>
    </>
  );
}
