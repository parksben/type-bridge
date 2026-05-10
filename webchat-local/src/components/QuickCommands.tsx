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
  MousePointerClick,
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
  AppWindow,
  Monitor,
  CheckCircle,
  ShieldAlert,
  Camera,
  PenLine,
  Compass,
} from "lucide-react";
import type { WebChatClient } from "@/lib/socket";
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
  | { type: "clear" }
  | { type: "screenshot"; kind: "screen" | "window" };

type CmdDef = {
  labelKey: TKey;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  spec: CmdSpec;
  accent?: boolean;
};

type TabId = "screenshot" | "edit" | "nav";

// ─── Arrow keys ────────────────────────────────────────────────
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

// ─── Edit + Clipboard ──────────────────────────────────────────
const EDIT_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdUndo",      Icon: Undo2,             spec: { type: "combo", combo: "Undo" } },
  { labelKey: "monitor.cmdRedo",      Icon: Redo2,             spec: { type: "combo", combo: "Redo" } },
  { labelKey: "monitor.cmdNewline",   Icon: CornerDownLeft,    spec: { type: "key", code: "Enter" } },
  { labelKey: "monitor.cmdDelete",    Icon: Delete,            spec: { type: "key", code: "Backspace" }, accent: true },
  { labelKey: "monitor.cmdClear",     Icon: Trash2,            spec: { type: "clear" }, accent: true },
  { labelKey: "monitor.cmdEscape",    Icon: LogOut,            spec: { type: "key", code: "Escape" } },
  { labelKey: "monitor.cmdSelectAll", Icon: MousePointerClick, spec: { type: "combo", combo: "SelectAll" } },
  { labelKey: "monitor.cmdCopy",      Icon: Copy,              spec: { type: "combo", combo: "Copy" } },
  { labelKey: "monitor.cmdCut",       Icon: Scissors,          spec: { type: "combo", combo: "Cut" } },
  { labelKey: "monitor.cmdPaste",     Icon: ClipboardPaste,    spec: { type: "combo", combo: "Paste" } },
];

// ─── Screenshot ────────────────────────────────────────────────
const SCREENSHOT_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdScreenshotWindow", Icon: AppWindow,      spec: { type: "screenshot", kind: "window" } },
  { labelKey: "monitor.cmdScreenshotScreen", Icon: Monitor,        spec: { type: "screenshot", kind: "screen" } },
  { labelKey: "monitor.cmdScreenshotPaste",  Icon: ClipboardPaste, spec: { type: "combo", combo: "Paste" } },
];

// ─── RowCmdButton: 全宽横排按钮（图标 + 文字左对齐）──────────────

function RowCmdButton({
  cmd,
  onPress,
  disabled,
}: {
  cmd: CmdDef;
  onPress: (cmd: CmdDef) => void;
  disabled: boolean;
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
      className="flex items-center gap-3.5 w-full rounded-2xl select-none disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: pressed
          ? "rgba(255,255,255,0.05)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        color: accent ? "var(--tb-danger)" : "var(--tb-text)",
        padding: "14px 16px",
        transition: "background 80ms ease, border-color 80ms ease",
      }}
    >
      <span style={{ color: accent ? "var(--tb-danger)" : "var(--tb-accent)", flexShrink: 0, display: "flex" }}>
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <span
        className="text-[15px] font-medium"
        style={{ color: accent ? "var(--tb-danger)" : "var(--tb-text)" }}
      >
        {t(labelKey)}
      </span>
    </button>
  );
}

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
  const { Icon, labelKey, accent } = cmd;

  return (
    <button
      type="button"
      onTouchStart={(e) => { e.stopPropagation(); }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!disabled) onPress(cmd);
      }}
      onClick={() => { if (!disabled) onPress(cmd); }}
      disabled={disabled}
      className={`keycap flex flex-col items-center justify-center gap-1.5 select-none disabled:opacity-30 disabled:cursor-not-allowed${large ? " rounded-full" : " rounded-2xl"}`}
      style={{
        color: accent ? "var(--tb-danger)" : "var(--tb-text)",
        minHeight: large ? "80px" : "76px",
        minWidth: large ? "80px" : undefined,
        padding: "10px 8px",
      }}
    >
      <span style={{ color: accent ? "var(--tb-danger)" : "var(--tb-accent)" }}>
        <Icon size={large ? 26 : 22} strokeWidth={1.8} />
      </span>
      <span
        className="text-[11px] leading-none text-center font-semibold tracking-wide"
        style={{ color: accent ? "var(--tb-danger)" : "rgba(255,255,255,0.4)" }}
      >
        {t(labelKey)}
      </span>
    </button>
  );
}

// ─── PairedButtons: 两个按钮视觉上一体化 ───────────────────────

function PairedButtons({
  left,
  right,
  onPress,
  disabled,
}: {
  left: CmdDef;
  right: CmdDef;
  onPress: (cmd: CmdDef) => void;
  disabled: boolean;
}) {
  const [lPressed, setLPressed] = useState(false);
  const [rPressed, setRPressed] = useState(false);

  function mkBtn(
    cmd: CmdDef,
    pressed: boolean,
    setPressed: (v: boolean) => void,
    side: "left" | "right",
  ) {
    const { Icon, labelKey } = cmd;
    const isActive = pressed;
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
        className="flex-1 flex flex-col items-center justify-center gap-1.5 select-none disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: isActive
            ? "rgba(255,255,255,0.05)"
            : "rgba(255,255,255,0.02)",
          borderTop: `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})`,
          borderBottom: `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})`,
          borderLeft: side === "left" ? `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})` : "none",
          borderRight: side === "right" ? `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})` : "none",
          borderRadius: side === "left" ? "16px 0 0 16px" : "0 16px 16px 0",
          minHeight: "68px",
          padding: "10px 8px",
          transition: "background 80ms ease",
        }}
      >
        <span style={{ color: "var(--tb-accent)", display: "flex" }}>
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11px] leading-none text-center font-semibold tracking-wide"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {t(labelKey)}
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-full">
      {mkBtn(left, lPressed, setLPressed, "left")}
      <div style={{ width: "1px", background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
      {mkBtn(right, rPressed, setRPressed, "right")}
    </div>
  );
}

// ─── VerticalPairedButtons: 两个按钮上下一体化 ─────────────────

function VerticalPairedButtons({
  top,
  bottom,
  onPress,
  disabled,
}: {
  top: CmdDef;
  bottom: CmdDef;
  onPress: (cmd: CmdDef) => void;
  disabled: boolean;
}) {
  const [tPressed, setTPressed] = useState(false);
  const [bPressed, setRPressed] = useState(false);

  function mkBtn(
    cmd: CmdDef,
    pressed: boolean,
    setPressed: (v: boolean) => void,
    side: "top" | "bottom",
  ) {
    const { Icon, labelKey } = cmd;
    const isActive = pressed;
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
        className="flex flex-col items-center justify-center gap-1.5 select-none disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: isActive
            ? "rgba(255,255,255,0.05)"
            : "rgba(255,255,255,0.02)",
          borderLeft: `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})`,
          borderRight: `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})`,
          borderTop: side === "top" ? `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})` : "none",
          borderBottom: side === "bottom" ? `1px solid rgba(255,255,255,${isActive ? 0.12 : 0.06})` : "none",
          borderRadius: side === "top" ? "16px 16px 0 0" : "0 0 16px 16px",
          minHeight: "60px",
          padding: "10px 8px",
          transition: "background 80ms ease",
        }}
      >
        <span style={{ color: "var(--tb-accent)", display: "flex" }}>
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11px] leading-none text-center font-semibold tracking-wide"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {t(labelKey)}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {mkBtn(top, tPressed, setTPressed, "top")}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
      {mkBtn(bottom, bPressed, setRPressed, "bottom")}
    </div>
  );
}

// ─── Screenshot feedback toast ──────────────────────────────────

type ScreenshotFeedback = { success: boolean; msg: string } | null;

function ScreenshotToast({ feedback }: { feedback: ScreenshotFeedback }) {
  if (!feedback) return null;
  const { success, msg } = feedback;
  return (
    <div
      className="flex items-start gap-3 px-3.5 py-3 rounded-xl text-[13px] font-medium shrink-0"
      style={{
        background: success
          ? "rgba(74, 222, 128, 0.1)"
          : "rgba(248, 113, 113, 0.1)",
        color: success ? "var(--tb-success)" : "var(--tb-danger)",
        border: `1px solid ${success
          ? "rgba(74, 222, 128, 0.25)"
          : "rgba(248, 113, 113, 0.22)"}`,
      }}
    >
      <span className="shrink-0 mt-0.5">
        {success
          ? <CheckCircle size={20} strokeWidth={2} />
          : <ShieldAlert size={20} strokeWidth={2} />}
      </span>
      <span className="leading-relaxed">{msg}</span>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────

const TAB_IDS: TabId[] = ["screenshot", "edit", "nav"];

export default function QuickCommands({ client, disabled }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("screenshot");
  const [error, setError] = useState<string | null>(null);
  const [screenshotFeedback, setScreenshotFeedback] = useState<ScreenshotFeedback>(null);
  const isProgrammaticScroll = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<TabId, HTMLDivElement | null>>({
    screenshot: null, edit: null, nav: null,
  });

  const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: "screenshot", label: t("monitor.cmdGroupScreenshot"), Icon: Camera },
    { id: "edit",       label: t("monitor.cmdGroupEdit"),       Icon: PenLine },
    { id: "nav",        label: t("monitor.cmdGroupNav"),        Icon: Compass },
  ];

  // ── Scroll spy ──────────────────────────────────────────────
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function onScroll() {
      if (isProgrammaticScroll.current) return;
      const h = container!.clientHeight;
      if (!h) return;
      const idx = Math.round(container!.scrollTop / h);
      const id = TAB_IDS[Math.min(idx, TAB_IDS.length - 1)];
      if (id) setActiveTab(id);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  function handleTabClick(id: TabId) {
    setActiveTab(id);
    const container = scrollRef.current;
    if (!container) return;
    const idx = TAB_IDS.indexOf(id);
    isProgrammaticScroll.current = true;
    container.scrollTo({ top: idx * container.clientHeight, behavior: "smooth" });
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
    } else if (cmd.spec.type === "screenshot") {
      const ack = await client.sendScreenshot(cmd.spec.kind);
      const feedbackMsg = ack.success
        ? t("monitor.cmdScreenshotSuccess")
        : ack.reason === "ERR_SCREEN_RECORDING_PERMISSION"
          ? t("monitor.cmdScreenshotPermDenied")
          : (ack.reason ?? t("monitor.cmdScreenshotFailed"));
      setScreenshotFeedback({ success: ack.success, msg: feedbackMsg });
      setTimeout(() => setScreenshotFeedback(null), 3000);
      return;
    }

    if (!success) {
      setError(reason ?? t("monitor.cmdFailed"));
      setTimeout(() => setError(null), 2500);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded-xl text-[12px] text-center shrink-0"
          style={{
            background: "rgba(248, 113, 113, 0.1)",
            color: "var(--tb-danger)",
            border: "1px solid rgba(248, 113, 113, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────── */}
      <div
        className="flex shrink-0 overflow-x-auto scrollbar-none"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "var(--tb-surface)",
        }}
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabClick(id)}
            className="flex-1 py-2.5 text-[12px] font-semibold whitespace-nowrap relative flex flex-col items-center gap-1 select-none"
            style={{
              color: activeTab === id ? "var(--tb-accent)" : "rgba(255,255,255,0.3)",
              transition: "color 150ms ease",
            }}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
            <span
              className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
              style={{
                width: activeTab === id ? "70%" : "0%",
                height: "2px",
                background: "var(--tb-accent)",
                boxShadow: activeTab === id ? "0 0 8px var(--tb-accent-glow)" : "none",
                transition: "width 200ms ease, box-shadow 200ms ease",
              }}
            />
          </button>
        ))}
      </div>

      {/* ── Snap-scroll sections ───────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ scrollSnapType: "y mandatory" }}
      >

        {/* ── Screenshot ────────────────────────────────────── */}
        <div
          ref={(el) => { sectionRefs.current["screenshot"] = el; }}
          className="flex flex-col justify-center gap-4 px-4"
          style={{ height: "100%", scrollSnapAlign: "start" }}
        >
          {/* 截图反馈 toast */}
          <ScreenshotToast feedback={screenshotFeedback} />

          {/* 三个截图按钮：每个独占一行 */}
          {SCREENSHOT_CMDS.map((cmd) => (
            <RowCmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
          ))}

          {/* 提示说明 */}
          <p
            className="text-center text-[11px] leading-relaxed"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            {t("monitor.cmdScreenshotHint")}
          </p>
        </div>

        {/* ── Edit + Clipboard ─────────────────────────────── */}
        <div
          ref={(el) => { sectionRefs.current["edit"] = el; }}
          className="flex flex-col justify-center gap-3 px-4"
          style={{ height: "100%", scrollSnapAlign: "start" }}
        >
          {/* 编辑操作：undo/redo/enter/delete/clear/escape */}
          <div className="grid grid-cols-2 gap-2.5">
            {EDIT_CMDS.slice(0, 6).map((cmd) => (
              <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
            ))}
          </div>

          {/* 分割线 */}
          <div
            style={{
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
              margin: "2px 0",
            }}
          />

          {/* 剪贴板：selectAll/copy/cut/paste */}
          <div className="grid grid-cols-2 gap-2.5">
            {EDIT_CMDS.slice(6).map((cmd) => (
              <CmdButton key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
            ))}
          </div>
        </div>

        {/* ── Navigation ────────────────────────────────────── */}
        <div
          ref={(el) => { sectionRefs.current["nav"] = el; }}
          className="flex flex-col items-center justify-center gap-3 px-4"
          style={{ height: "100%", scrollSnapAlign: "start" }}
        >
          {/* 方向键 D-pad */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
            <div />
            <CmdButton cmd={CMD_UP}    onPress={handlePress} disabled={disabled} large />
            <div />
          </div>
          <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
            <CmdButton cmd={CMD_LEFT}  onPress={handlePress} disabled={disabled} large />
            <CmdButton cmd={CMD_DOWN}  onPress={handlePress} disabled={disabled} large />
            <CmdButton cmd={CMD_RIGHT} onPress={handlePress} disabled={disabled} large />
          </div>

          {/* 分割线 */}
          <div
            className="w-full"
            style={{
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
              margin: "2px 0",
            }}
          />

          {/* 行首 ↔ 行尾 */}
          <PairedButtons left={CMD_HOME} right={CMD_END} onPress={handlePress} disabled={disabled} />

          {/* 上一页/下一页 ↕ 与 页首/页尾 ↕ 并列一行 */}
          <div className="flex gap-2.5 w-full">
            <VerticalPairedButtons top={CMD_PAGE_UP} bottom={CMD_PAGE_DOWN} onPress={handlePress} disabled={disabled} />
            <VerticalPairedButtons top={CMD_DOC_TOP} bottom={CMD_DOC_BOTTOM} onPress={handlePress} disabled={disabled} />
          </div>
        </div>

      </div>
    </div>
  );
}
