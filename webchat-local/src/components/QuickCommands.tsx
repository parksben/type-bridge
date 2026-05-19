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
} from "lucide-react";
import type { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import { t, type TKey } from "@/i18n";

type Props = {
  client: WebChatClient;
  disabled: boolean;
  initialTab?: TabId;
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

// ─── ScreenshotTile: 大方块图标在上、文字在下的卡片样式 ──────────
// 替代原 RowCmdButton 的细长全宽样式 —— 加大点击区、降低误触率。
function ScreenshotTile({
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
      className="flex flex-col items-center justify-center gap-2 w-full rounded-2xl select-none disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: pressed ? "#fff3ea" : "#ffffff",
        border: `1px solid ${pressed ? "#f9b27a" : "var(--tb-border)"}`,
        color: accent ? "var(--tb-danger)" : "var(--tb-text)",
        minHeight: "96px",
        padding: "16px 12px",
        boxShadow: pressed
          ? "0 1px 4px rgba(249,115,22,0.15)"
          : "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
        transition: "background 80ms ease, border-color 80ms ease, box-shadow 80ms ease",
      }}
    >
      <span style={{ color: accent ? "var(--tb-danger)" : "var(--tb-accent)", display: "flex" }}>
        <Icon size={28} strokeWidth={1.8} />
      </span>
      <span
        className="text-[12px] font-semibold text-center leading-tight"
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
        style={{ color: accent ? "var(--tb-danger)" : "var(--tb-muted)" }}
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
            ? "#fff3ea"
            : "#ffffff",
          borderTop: `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}`,
          borderBottom: `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}`,
          borderLeft: side === "left" ? `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}` : "none",
          borderRight: side === "right" ? `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}` : "none",
          borderRadius: side === "left" ? "16px 0 0 16px" : "0 16px 16px 0",
          minHeight: "68px",
          padding: "10px 8px",
          boxShadow: isActive
            ? "0 1px 6px rgba(249,115,22,0.15)"
            : "0 1px 3px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)",
          transition: "background 80ms ease, box-shadow 80ms ease",
        }}
      >
        <span style={{ color: "var(--tb-accent)", display: "flex" }}>
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11px] leading-none text-center font-semibold tracking-wide"
          style={{ color: "var(--tb-muted)" }}
        >
          {t(labelKey)}
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-full">
      {mkBtn(left, lPressed, setLPressed, "left")}
      <div style={{ width: "1px", background: "var(--tb-border)", flexShrink: 0 }} />
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
            ? "#fff3ea"
            : "#ffffff",
          borderLeft: `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}`,
          borderRight: `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}`,
          borderTop: side === "top" ? `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}` : "none",
          borderBottom: side === "bottom" ? `1px solid ${isActive ? "#f9b27a" : "var(--tb-border)"}` : "none",
          borderRadius: side === "top" ? "16px 16px 0 0" : "0 0 16px 16px",
          minHeight: "60px",
          padding: "10px 8px",
          boxShadow: isActive
            ? "0 1px 6px rgba(249,115,22,0.15)"
            : "0 1px 3px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)",
          transition: "background 80ms ease, box-shadow 80ms ease",
        }}
      >
        <span style={{ color: "var(--tb-accent)", display: "flex" }}>
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span
          className="text-[11px] leading-none text-center font-semibold tracking-wide"
          style={{ color: "var(--tb-muted)" }}
        >
          {t(labelKey)}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {mkBtn(top, tPressed, setTPressed, "top")}
      <div style={{ height: "1px", background: "var(--tb-border)", flexShrink: 0 }} />
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
          ? "rgba(34, 197, 94, 0.08)"
          : "rgba(239, 68, 68, 0.08)",
        color: success ? "var(--tb-success)" : "var(--tb-danger)",
        border: `1px solid ${success
          ? "rgba(34, 197, 94, 0.3)"
          : "rgba(239, 68, 68, 0.28)"}`,
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

// ─── PageTitle: 每屏顶部的小标题（淡色、居中、不抢戏）─────────

function PageTitle({ label }: { label: string }) {
  return (
    <h2
      className="text-center text-[12px] font-medium tracking-wide select-none shrink-0"
      style={{
        color: "var(--tb-muted)",
        letterSpacing: "0.05em",
        opacity: 0.7,
        marginBottom: "4px",
      }}
    >
      {label}
    </h2>
  );
}

// ─── Main ──────────────────────────────────────────────────────

const TAB_IDS: TabId[] = ["screenshot", "edit", "nav"];

export default function QuickCommands({ client, disabled, initialTab = "screenshot" }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [screenshotFeedback, setScreenshotFeedback] = useState<ScreenshotFeedback>(null);
  const isProgrammaticScroll = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const TAB_LABELS: Record<TabId, TKey> = {
    screenshot: "monitor.cmdGroupScreenshot",
    edit:       "monitor.cmdGroupEdit",
    nav:        "monitor.cmdGroupNav",
  };

  // ── 启动时滚动到 initialTab ──────────────────────────────
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = TAB_IDS.indexOf(initialTab);
    if (idx <= 0) return;
    isProgrammaticScroll.current = true;
    // 同步滚到位（无动画），避免初次渲染时闪一下
    container.scrollLeft = idx * container.clientWidth;
    setTimeout(() => { isProgrammaticScroll.current = false; }, 100);
  }, []);

  // ── Scroll spy：横向 snap，根据 scrollLeft 推算当前页 ──
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function onScroll() {
      if (isProgrammaticScroll.current) return;
      const w = container!.clientWidth;
      if (!w) return;
      const idx = Math.round(container!.scrollLeft / w);
      const id = TAB_IDS[Math.min(idx, TAB_IDS.length - 1)];
      if (id) setActiveTab(id);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  function goToTab(id: TabId) {
    setActiveTab(id);
    const container = scrollRef.current;
    if (!container) return;
    const idx = TAB_IDS.indexOf(id);
    isProgrammaticScroll.current = true;
    container.scrollTo({ left: idx * container.clientWidth, behavior: "smooth" });
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
            background: "rgba(239,68,68,0.08)",
            color: "var(--tb-danger)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── 横向 snap pager：每屏 100% 宽 ────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden flex min-h-0 scrollbar-none"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >

        {/* ── Page 1: Screenshot ─────────────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <PageTitle label={t(TAB_LABELS.screenshot)} />

          {/* 截图反馈 toast */}
          <ScreenshotToast feedback={screenshotFeedback} />

          {/* 居中区：三个截图按钮，2x2 网格中第三个跨两列 */}
          <div className="flex-1 flex flex-col justify-center gap-3">
            <div className="grid grid-cols-2 gap-3">
              <ScreenshotTile cmd={SCREENSHOT_CMDS[0]} onPress={handlePress} disabled={disabled} />
              <ScreenshotTile cmd={SCREENSHOT_CMDS[1]} onPress={handlePress} disabled={disabled} />
            </div>
            <ScreenshotTile cmd={SCREENSHOT_CMDS[2]} onPress={handlePress} disabled={disabled} />

            {/* 提示说明 */}
            <p
              className="text-center text-[11px] leading-relaxed mt-1"
              style={{ color: "var(--tb-muted)", opacity: 0.55 }}
            >
              {t("monitor.cmdScreenshotHint")}
            </p>
          </div>
        </section>

        {/* ── Page 2: Edit + Clipboard ──────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <PageTitle label={t(TAB_LABELS.edit)} />

          <div className="flex-1 flex flex-col justify-center gap-3">
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
        </section>

        {/* ── Page 3: Navigation ────────────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <PageTitle label={t(TAB_LABELS.nav)} />

          <div className="flex-1 flex flex-col items-center justify-center gap-3">
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
        </section>

      </div>

      {/* ── 底部圆点 indicator（类似 iOS 桌面分页点）─────── */}
      <div
        className="flex items-center justify-center gap-2 shrink-0 select-none"
        style={{
          padding: "10px 0 12px",
          background: "var(--tb-surface)",
          borderTop: "1px solid var(--tb-border)",
        }}
      >
        {TAB_IDS.map((id) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => goToTab(id)}
              aria-label={t(TAB_LABELS[id])}
              className="select-none"
              style={{
                width: isActive ? "20px" : "8px",
                height: "8px",
                borderRadius: "999px",
                background: isActive ? "var(--tb-accent)" : "rgba(0,0,0,0.18)",
                boxShadow: isActive ? "0 0 6px var(--tb-accent-glow)" : "none",
                transition: "width 200ms ease, background 200ms ease, box-shadow 200ms ease",
                padding: 0,
                border: "none",
                cursor: "pointer",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
