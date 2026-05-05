import {
  CornerDownLeft,
  Delete,
  Space,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { t, type TKey } from "@/i18n";

type KeySpec = {
  code: string;
  Icon: typeof CornerDownLeft;
  labelKey: TKey;
};

const KEYS: KeySpec[] = [
  { code: "Backspace", Icon: Delete, labelKey: "composer.shortcutBackspace" },
  { code: "ArrowLeft", Icon: ArrowLeft, labelKey: "composer.shortcutArrowLeft" },
  { code: "ArrowUp", Icon: ArrowUp, labelKey: "composer.shortcutArrowUp" },
  { code: "ArrowDown", Icon: ArrowDown, labelKey: "composer.shortcutArrowDown" },
  { code: "ArrowRight", Icon: ArrowRight, labelKey: "composer.shortcutArrowRight" },
  { code: "Space", Icon: Space, labelKey: "composer.shortcutSpace" },
  { code: "Enter", Icon: CornerDownLeft, labelKey: "composer.shortcutEnter" },
];

type Props = {
  onPress: (code: string) => void;
  disabled: boolean;
};

export default function ShortcutKeysPanel({ onPress, disabled }: Props) {
  return (
    <div
      className="px-3 pt-2 pb-1.5 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none"
      style={{ background: "var(--tb-surface)" }}
    >
      {KEYS.map(({ code, Icon, labelKey }) => (
        <button
          key={code}
          type="button"
          onClick={() => onPress(code)}
          disabled={disabled}
          aria-label={t(labelKey)}
          className="flex-1 min-w-[44px] min-h-[44px] rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "var(--tb-bg)",
            borderColor: "var(--tb-border)",
            color: "var(--tb-text)",
          }}
        >
          <Icon size={18} strokeWidth={2} />
          <span className="text-[10px] leading-none" style={{ color: "var(--tb-muted)" }}>
            {t(labelKey)}
          </span>
        </button>
      ))}
    </div>
  );
}
