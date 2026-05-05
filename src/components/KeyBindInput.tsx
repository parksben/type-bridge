import { useEffect, useRef, useState } from "react";
import { Command, Option, ChevronUp, ArrowBigUp, RotateCcw } from "lucide-react";
import { DEFAULT_SUBMIT_KEY, type SubmitKey } from "../store";
import { t } from "../i18n";

interface Props {
  value: SubmitKey;
  onChange: (value: SubmitKey) => void;
  disabled?: boolean;
}

const PURE_MODIFIERS = new Set(["Shift", "Meta", "Control", "Alt", "OS"]);

// e.code → 展示字符串
function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);      // KeyA → A
  if (code.startsWith("Digit")) return code.slice(5);     // Digit1 → 1
  if (code === "NumpadEnter") return "Enter";
  if (code === "Backspace") return "⌫";
  if (code === "Delete") return "Del";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Backslash") return "\\";
  if (code === "Semicolon") return ";";
  if (code === "Quote") return "'";
  if (code === "Comma") return ",";
  if (code === "Period") return ".";
  if (code === "Slash") return "/";
  if (code === "Backquote") return "`";
  return code;
}

export default function KeyBindInput({ value, onChange, disabled }: Props) {
  const [capturing, setCapturing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 离开捕捉区域就取消
  useEffect(() => {
    if (!capturing) return;
    rootRef.current?.focus();
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setCapturing(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [capturing]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setCapturing(false);
      return;
    }
    if (PURE_MODIFIERS.has(e.key)) return; // 等待用户再按一个主键

    const next: SubmitKey = {
      key: e.code,
      cmd: e.metaKey,
      shift: e.shiftKey,
      option: e.altKey,
      ctrl: e.ctrlKey,
    };
    onChange(next);
    setCapturing(false);
  }

  function handleReset(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(DEFAULT_SUBMIT_KEY);
    setCapturing(false);
  }

  const chipBg = capturing ? "var(--accent-soft)" : "var(--surface-2)";
  const chipBorder = capturing ? "var(--accent)" : "var(--border)";

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => !disabled && setCapturing(true)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-mono transition-colors outline-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
      style={{
        background: chipBg,
        border: `1px solid ${chipBorder}`,
        color: "var(--text)",
        minWidth: 110,
        justifyContent: "center",
      }}
      role="button"
      aria-label={t("keybind.setAria")}
    >
      {capturing ? (
        <span className="text-accent">{t("keybind.pressTarget")}</span>
      ) : (
        <>
          {value.ctrl && <ChevronUp size={12} strokeWidth={2} />}
          {value.option && <Option size={12} strokeWidth={2} />}
          {value.shift && <ArrowBigUp size={12} strokeWidth={2} />}
          {value.cmd && <Command size={12} strokeWidth={2} />}
          <span>{codeLabel(value.key)}</span>
          {!disabled && (
            <button
              onClick={handleReset}
              title={t("keybind.resetTooltip")}
              className="ml-1.5 text-subtle hover:text-muted"
              tabIndex={-1}
            >
              <RotateCcw size={10} strokeWidth={1.75} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
