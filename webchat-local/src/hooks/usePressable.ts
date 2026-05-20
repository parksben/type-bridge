import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "../lib/haptic";
import { playTap, primeTapSound } from "../lib/tapSound";

/**
 * usePressable — unified press handler for all on-screen keys.
 *
 * Responsibilities (consolidated from UX2/3/4/5 work):
 *
 *   UX2 — visible pressed state:
 *     Returns `pressed` so callers can render an active style.
 *
 *   UX3 — swipe-vs-tap discrimination:
 *     Tracks pointer movement after touchstart. If horizontal travel exceeds
 *     SWIPE_THRESHOLD (8 px) AND dominates over vertical travel, the gesture
 *     is reclassified as a swipe — pressed visual is cleared, onPress is NOT
 *     fired on touchend, and any in-flight repeat is cancelled. This makes
 *     the horizontal pager glide naturally without firing the key your
 *     finger happened to land on.
 *
 *   UX4 — haptic + audio feedback:
 *     Triggers `haptic()` and `playTap()` on the initial press only (NOT on
 *     each repeat tick — see UX5 below for that). Strength escalates for
 *     accent actions.
 *
 *   UX5 — long-press repeat:
 *     If `repeatable === true`, holding the key fires onPress once
 *     immediately, then again after REPEAT_DELAY (400 ms), then on a
 *     REPEAT_INTERVAL (60 ms) cadence. Each repeat tick fires a soft
 *     `tick` haptic only — no audio — to avoid sensory overload. Release,
 *     swipe, or pointercancel stops the repeat instantly.
 *
 * Press model uses Touch Events (not Pointer Events) because Touch Events
 * give us multi-touch start/move/end on all target browsers including
 * legacy WKWebViews. We also bind onMouseDown/Up/Leave for desktop dev/QA.
 *
 * IMPORTANT: caller MUST also pass `{ touchAction: 'manipulation' }` on the
 * element style (or equivalent CSS) to suppress the 300 ms iOS click delay
 * and the system long-press tooltip on Android.
 */

const SWIPE_THRESHOLD = 8; // px — beyond this, treat as scroll/swipe
const REPEAT_DELAY = 400; // ms — initial wait before repeat starts
const REPEAT_INTERVAL = 60; // ms — repeat cadence (~16Hz, matches iOS keyboard)

export type PressVariant = "default" | "accent";

export interface UsePressableOptions {
  /** Called when the gesture resolves as a tap (or each repeat tick). */
  onPress: () => void;
  /** Standard vs strong haptic / audio cue. Default 'default'. */
  variant?: PressVariant;
  /** Enable long-press auto-repeat. Default false. */
  repeatable?: boolean;
  /** Disable all interaction. */
  disabled?: boolean;
}

export interface PressableHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
}

export interface UsePressableResult {
  pressed: boolean;
  handlers: PressableHandlers;
}

export function usePressable(opts: UsePressableOptions): UsePressableResult {
  const { onPress, variant = "default", repeatable = false, disabled = false } =
    opts;

  const [pressed, setPressed] = useState(false);

  // Refs avoid re-renders for transient gesture state.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);
  const activeRef = useRef(false); // tracks an in-flight press
  const initialTimerRef = useRef<number | null>(null);
  const repeatTimerRef = useRef<number | null>(null);

  // Hold latest callback in a ref so timers always see fresh closures.
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const clearTimers = useCallback(() => {
    if (initialTimerRef.current !== null) {
      window.clearTimeout(initialTimerRef.current);
      initialTimerRef.current = null;
    }
    if (repeatTimerRef.current !== null) {
      window.clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount — otherwise a held key during navigation would keep
  // firing onPress against a stale parent.
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const startPress = useCallback(
    (x: number, y: number) => {
      if (disabled) return;
      startXRef.current = x;
      startYRef.current = y;
      swipingRef.current = false;
      activeRef.current = true;
      setPressed(true);

      // Initial press: fire once + sensory feedback.
      // Important: prime audio on the first user gesture, no-op afterwards.
      primeTapSound();
      onPressRef.current();
      haptic(variant === "accent" ? "accent" : "tap");
      playTap(variant === "accent" ? "accent" : "tap");

      if (repeatable) {
        clearTimers();
        initialTimerRef.current = window.setTimeout(() => {
          // Once the initial delay elapses, start steady repeats.
          repeatTimerRef.current = window.setInterval(() => {
            if (!activeRef.current || swipingRef.current) {
              clearTimers();
              return;
            }
            onPressRef.current();
            haptic("tick");
          }, REPEAT_INTERVAL);
        }, REPEAT_DELAY);
      }
    },
    [disabled, variant, repeatable, clearTimers],
  );

  const movePress = useCallback((x: number, y: number) => {
    if (!activeRef.current || swipingRef.current) return;
    const dx = Math.abs(x - startXRef.current);
    const dy = Math.abs(y - startYRef.current);
    if (dx > SWIPE_THRESHOLD && dx > dy) {
      // Reclassify as swipe — cancel everything.
      swipingRef.current = true;
      activeRef.current = false;
      setPressed(false);
      if (initialTimerRef.current !== null || repeatTimerRef.current !== null) {
        // Stop any pending or in-progress repeat.
        if (initialTimerRef.current !== null) {
          window.clearTimeout(initialTimerRef.current);
          initialTimerRef.current = null;
        }
        if (repeatTimerRef.current !== null) {
          window.clearInterval(repeatTimerRef.current);
          repeatTimerRef.current = null;
        }
      }
    }
  }, []);

  const endPress = useCallback(() => {
    activeRef.current = false;
    setPressed(false);
    clearTimers();
  }, [clearTimers]);

  const handlers: PressableHandlers = {
    onTouchStart: (e) => {
      if (disabled) return;
      e.stopPropagation();
      const t = e.touches[0];
      if (!t) return;
      startPress(t.clientX, t.clientY);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (!t) return;
      movePress(t.clientX, t.clientY);
    },
    onTouchEnd: (e) => {
      e.stopPropagation();
      endPress();
    },
    onTouchCancel: () => {
      endPress();
    },
    // Desktop dev / QA support — no repeat, no haptic (mouse has none).
    onMouseDown: (e) => {
      if (disabled) return;
      e.stopPropagation();
      activeRef.current = true;
      setPressed(true);
      onPressRef.current();
    },
    onMouseUp: () => {
      activeRef.current = false;
      setPressed(false);
    },
    onMouseLeave: () => {
      if (activeRef.current) {
        activeRef.current = false;
        setPressed(false);
      }
    },
  };

  return { pressed, handlers };
}
