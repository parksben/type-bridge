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
import { PressableTile } from "./PressableTile";

type Props = {
  client: WebChatClient;
  disabled: boolean;
  initialTab?: TabId;
};

// CmdSpec.repeatable (UX5): when true, holding the key fires onPress at
// ~16Hz after a 400ms initial delay. Only safe for keys that have an
// idempotent / additive effect when fired repeatedly — i.e. arrows,
// Backspace. NOT safe for Undo, Copy, Screenshot, etc.
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
  /** Visual + haptic "accent" treatment (destructive / screenshot). */
  accent?: boolean;
  /** Enable long-press auto-repeat on this key (UX5). */
  repeatable?: boolean;
};

// 5 tabs (UX1): dpad → edit → clipboard → nav → screenshot
type TabId = "dpad" | "edit" | "clipboard" | "nav" | "screenshot";

// ─── Direction tab keys (UX5: arrows + backspace = repeatable) ─────
const CMD_UP: CmdDef        = { labelKey: "monitor.cmdArrowUp",    Icon: ArrowUp,        spec: { type: "key", code: "ArrowUp" },    repeatable: true };
const CMD_DOWN: CmdDef      = { labelKey: "monitor.cmdArrowDown",  Icon: ArrowDown,      spec: { type: "key", code: "ArrowDown" },  repeatable: true };
const CMD_LEFT: CmdDef      = { labelKey: "monitor.cmdArrowLeft",  Icon: ArrowLeft,      spec: { type: "key", code: "ArrowLeft" },  repeatable: true };
const CMD_RIGHT: CmdDef     = { labelKey: "monitor.cmdArrowRight", Icon: ArrowRight,     spec: { type: "key", code: "ArrowRight" }, repeatable: true };
const CMD_ENTER: CmdDef     = { labelKey: "monitor.cmdNewline",    Icon: CornerDownLeft, spec: { type: "key", code: "Enter" } };
const CMD_BACKSPACE: CmdDef = { labelKey: "monitor.cmdDelete",     Icon: Delete,         spec: { type: "key", code: "Backspace" }, accent: true, repeatable: true };

// ─── Edit tab (4 core actions) ─────────────────────────────────────
const EDIT_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdUndo",   Icon: Undo2,  spec: { type: "combo", combo: "Undo" } },
  { labelKey: "monitor.cmdRedo",   Icon: Redo2,  spec: { type: "combo", combo: "Redo" } },
  { labelKey: "monitor.cmdClear",  Icon: Trash2, spec: { type: "clear" }, accent: true },
  { labelKey: "monitor.cmdEscape", Icon: LogOut, spec: { type: "key", code: "Escape" } },
];

// ─── Clipboard tab (4 actions) ─────────────────────────────────────
const CLIPBOARD_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdSelectAll", Icon: MousePointerClick, spec: { type: "combo", combo: "SelectAll" } },
  { labelKey: "monitor.cmdCopy",      Icon: Copy,              spec: { type: "combo", combo: "Copy" } },
  { labelKey: "monitor.cmdCut",       Icon: Scissors,          spec: { type: "combo", combo: "Cut" } },
  { labelKey: "monitor.cmdPaste",     Icon: ClipboardPaste,    spec: { type: "combo", combo: "Paste" } },
];

// ─── Navigation tab (6 jump targets) ───────────────────────────────
const NAV_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdHome",      Icon: ArrowLeftToLine,  spec: { type: "key",   code: "Home" } },
  { labelKey: "monitor.cmdEnd",       Icon: ArrowRightToLine, spec: { type: "key",   code: "End" } },
  { labelKey: "monitor.cmdPageUp",    Icon: ArrowUpToLine,    spec: { type: "key",   code: "PageUp" } },
  { labelKey: "monitor.cmdPageDown",  Icon: ArrowDownToLine,  spec: { type: "key",   code: "PageDown" } },
  { labelKey: "monitor.cmdDocTop",    Icon: ChevronsUp,       spec: { type: "combo", combo: "DocTop" } },
  { labelKey: "monitor.cmdDocBottom", Icon: ChevronsDown,     spec: { type: "combo", combo: "DocBottom" } },
];

// ─── Screenshot tab (unchanged) ────────────────────────────────────
const SCREENSHOT_CMDS: CmdDef[] = [
  { labelKey: "monitor.cmdScreenshotWindow", Icon: AppWindow,      spec: { type: "screenshot", kind: "window" }, accent: true },
  { labelKey: "monitor.cmdScreenshotScreen", Icon: Monitor,        spec: { type: "screenshot", kind: "screen" }, accent: true },
  { labelKey: "monitor.cmdScreenshotPaste",  Icon: ClipboardPaste, spec: { type: "combo", combo: "Paste" } },
];

// ─── Reusable tile renderer ────────────────────────────────────────
// Wraps PressableTile with the consistent icon-above-label layout used by
// every command button. Layout density is controlled by `density`:
//   - 'normal' — 2-col grids in edit/clipboard/nav
//   - 'dpad'   — chunky tile for direction pad
//   - 'wide'   — full-width tile in screenshot grid
function CmdTile({
  cmd,
  onPress,
  disabled,
  density = "normal",
}: {
  cmd: CmdDef;
  onPress: (cmd: CmdDef) => void;
  disabled: boolean;
  density?: "normal" | "dpad" | "wide";
}) {
  const { Icon, labelKey, accent, repeatable } = cmd;

  const iconSize = density === "wide" ? 28 : density === "dpad" ? 26 : 22;
  const minHeight =
    density === "wide" ? 96 : density === "dpad" ? 76 : 72;

  return (
    <PressableTile
      onPress={() => onPress(cmd)}
      variant={accent ? "accent" : "default"}
      repeatable={repeatable}
      disabled={disabled}
      ariaLabel={t(labelKey)}
      style={{
        width: "100%",
        minHeight: `${minHeight}px`,
        flexDirection: "column",
        gap: density === "wide" ? "8px" : "6px",
        padding: density === "wide" ? "16px 12px" : "10px 8px",
      }}
    >
      <span
        style={{
          color: accent ? "var(--tb-danger)" : "var(--tb-accent)",
          display: "flex",
        }}
      >
        <Icon size={iconSize} strokeWidth={1.8} />
      </span>
      <span
        className="text-[12px] font-semibold text-center leading-tight tracking-wide"
        style={{ color: accent ? "var(--tb-danger)" : "var(--tb-text)" }}
      >
        {t(labelKey)}
      </span>
    </PressableTile>
  );
}

// ─── Screenshot feedback toast ─────────────────────────────────────
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

// ─── Main ──────────────────────────────────────────────────────────

const TAB_IDS: TabId[] = ["dpad", "edit", "clipboard", "nav", "screenshot"];

export default function QuickCommands({ client, disabled, initialTab = "dpad" }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [screenshotFeedback, setScreenshotFeedback] = useState<ScreenshotFeedback>(null);
  const isProgrammaticScroll = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const TAB_LABELS: Record<TabId, TKey> = {
    dpad:       "monitor.cmdGroupDpad",
    edit:       "monitor.cmdGroupEdit",
    clipboard:  "monitor.cmdGroupClipboard",
    nav:        "monitor.cmdGroupNav",
    screenshot: "monitor.cmdGroupScreenshot",
  };

  // Initial scroll to initialTab — synchronous to avoid flash.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = TAB_IDS.indexOf(initialTab);
    if (idx <= 0) return;
    isProgrammaticScroll.current = true;
    container.scrollLeft = idx * container.clientWidth;
    setTimeout(() => { isProgrammaticScroll.current = false; }, 100);
  }, []);

  // Scroll spy — derive active tab from scrollLeft. Snap CSS guarantees
  // alignment; we just observe.
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

      {/* ── Horizontal snap pager ──────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden flex min-h-0 scrollbar-none"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >

        {/* ── Page 1: Direction (D-pad + Enter + Backspace) ── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            {/* D-pad */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
              <div />
              <CmdTile cmd={CMD_UP}    onPress={handlePress} disabled={disabled} density="dpad" />
              <div />
            </div>
            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
              <CmdTile cmd={CMD_LEFT}  onPress={handlePress} disabled={disabled} density="dpad" />
              <CmdTile cmd={CMD_DOWN}  onPress={handlePress} disabled={disabled} density="dpad" />
              <CmdTile cmd={CMD_RIGHT} onPress={handlePress} disabled={disabled} density="dpad" />
            </div>

            {/* Divider */}
            <div
              className="w-full max-w-[260px]"
              style={{
                height: "1px",
                background: "linear-gradient(90deg, transparent, var(--tb-border), transparent)",
                margin: "2px 0",
              }}
            />

            {/* Enter + Backspace (Backspace is repeatable for fast delete) */}
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-[260px]">
              <CmdTile cmd={CMD_ENTER}     onPress={handlePress} disabled={disabled} />
              <CmdTile cmd={CMD_BACKSPACE} onPress={handlePress} disabled={disabled} />
            </div>
          </div>
        </section>

        {/* ── Page 2: Edit ─────────────────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <div className="flex-1 flex flex-col justify-center gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              {EDIT_CMDS.map((cmd) => (
                <CmdTile key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Page 3: Clipboard ────────────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <div className="flex-1 flex flex-col justify-center gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              {CLIPBOARD_CMDS.map((cmd) => (
                <CmdTile key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Page 4: Navigation ───────────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <div className="flex-1 flex flex-col justify-center gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              {NAV_CMDS.map((cmd) => (
                <CmdTile key={cmd.labelKey} cmd={cmd} onPress={handlePress} disabled={disabled} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Page 5: Screenshot ───────────────────────── */}
        <section
          className="flex flex-col px-4 pt-3 pb-2 shrink-0"
          style={{ width: "100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
        >
          <ScreenshotToast feedback={screenshotFeedback} />

          <div className="flex-1 flex flex-col justify-center gap-3">
            <div className="grid grid-cols-2 gap-3">
              <CmdTile cmd={SCREENSHOT_CMDS[0]} onPress={handlePress} disabled={disabled} density="wide" />
              <CmdTile cmd={SCREENSHOT_CMDS[1]} onPress={handlePress} disabled={disabled} density="wide" />
            </div>
            <CmdTile cmd={SCREENSHOT_CMDS[2]} onPress={handlePress} disabled={disabled} density="wide" />

            <p
              className="text-center text-[11px] leading-relaxed mt-1"
              style={{ color: "var(--tb-muted)", opacity: 0.55 }}
            >
              {t("monitor.cmdScreenshotHint")}
            </p>
          </div>
        </section>

      </div>

      {/* ── Bottom indicator: dynamic title + page dots ─────── */}
      <div
        className="flex flex-col items-center shrink-0 select-none"
        style={{
          padding: "8px 0 12px",
          background: "var(--tb-bg)",
        }}
      >
        <div
          key={activeTab}
          className="text-center text-[12px] font-medium tracking-wide select-none"
          style={{
            color: "var(--tb-muted)",
            letterSpacing: "0.05em",
            opacity: 0.75,
            marginBottom: "8px",
            animation: "tb-fade-in 220ms ease",
          }}
        >
          {t(TAB_LABELS[activeTab])}
        </div>
        <div className="flex items-center justify-center gap-2">
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
    </div>
  );
}
