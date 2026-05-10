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
  { code: "ArrowUp", Icon: ArrowUp, labelKey: "composer.shortcutArrowUp" },
  { code: "ArrowDown", Icon: ArrowDown, labelKey: "composer.shortcutArrowDown" },
  { code: "ArrowLeft", Icon: ArrowLeft, labelKey: "composer.shortcutArrowLeft" },
  { code: "ArrowRight", Icon: ArrowRight, labelKey: "composer.shortcutArrowRight" },
  { code: "Space", Icon: Space, labelKey: "composer.shortcutSpace" },
  { code: "Enter", Icon: CornerDownLeft, labelKey: "composer.shortcutEnter" },
  { code: "Backspace", Icon: Delete, labelKey: "composer.shortcutBackspace" },
];

type Props = {
  onPress: (code: string) => void;
  disabled: boolean;
};

export default function ShortcutKeysPanel({ onPress, disabled }: Props) {
  return (
    <div
      className="px-2.5 pt-2 pb-2 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none"
      style={{
        background: "var(--tb-surface)",
        borderTop: "1px solid var(--tb-border)",
      }}
    >
      {KEYS.map(({ code, Icon, labelKey }) => (
        <button
          key={code}
          type="button"
          onClick={() => onPress(code)}
          disabled={disabled}
          aria-label={t(labelKey)}
          className="keycap flex-1 min-w-[42px] min-h-[50px] rounded-[10px] flex flex-col items-center justify-center gap-1 select-none disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon size={16} strokeWidth={2} style={{ color: "var(--tb-accent)" }} />
          <span
            className="text-[9px] leading-none font-semibold tracking-wider uppercase"
            style={{ color: "var(--tb-muted)" }}
          >
            {t(labelKey)}
          </span>
        </button>
      ))}
    </div>
  );
}
