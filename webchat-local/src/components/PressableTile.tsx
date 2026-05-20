import type { CSSProperties, ReactNode } from "react";
import { usePressable, type PressVariant } from "../hooks/usePressable";

/**
 * PressableTile — unified visual + interaction wrapper for on-screen keys.
 *
 * Renders a button-shaped tile that:
 *   - Shows a clear pressed state (orange tint + scale + glow) on touch.
 *   - Routes all gesture state through `usePressable` (swipe discrimination,
 *     haptic, audio, long-press repeat).
 *   - Suppresses iOS double-tap zoom and Android long-press tooltip via
 *     `touch-action: manipulation` and `user-select: none`.
 *
 * Layout / sizing is controlled by the caller via `className` / `style`; this
 * component only owns the *press* concerns. That keeps it usable for the
 * D-pad arrows, 2×2 edit grids, 2×3 jump grids, and the wide screenshot
 * tiles without per-variant CSS forks.
 */

export interface PressableTileProps {
  onPress: () => void;
  /** Defaults to 'default'. Use 'accent' for screenshot / clear / paste. */
  variant?: PressVariant;
  /** Long-press auto-repeat (arrows, backspace, space). */
  repeatable?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Optional aria-label for accessibility / unit tests. */
  ariaLabel?: string;
}

export function PressableTile({
  onPress,
  variant = "default",
  repeatable = false,
  disabled = false,
  className,
  style,
  children,
  ariaLabel,
}: PressableTileProps) {
  const { pressed, handlers } = usePressable({
    onPress,
    variant,
    repeatable,
    disabled,
  });

  const baseClass = [
    "pressable-tile",
    `pressable-tile--${variant}`,
    pressed && "is-pressed",
    disabled && "is-disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={baseClass}
      style={style}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={pressed || undefined}
      {...handlers}
    >
      {children}
    </button>
  );
}
