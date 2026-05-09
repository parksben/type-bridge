import { useRef, useState } from "react";
import { Settings2, X } from "lucide-react";
import { WebChatClient } from "@/lib/socket";
import { newClientMessageId } from "@/lib/storage";
import { t } from "@/i18n";

type Props = {
  client: WebChatClient;
  disabled: boolean;
};

type TouchData = { x: number; y: number };

const LS_SENSITIVITY = "tb_touchpad_sensitivity";
const DEFAULT_SENSITIVITY = 1.5;
const TAP_MAX_DURATION = 260;         // ms — lifted within this → tap
const MULTI_TAP_INTERVAL = 320;       // ms — taps within this → multi-click
const TWO_FINGER_MOVE_THRESHOLD = 14; // px — 2-finger centroid travel → not a tap
const THREE_FINGER_SWIPE_MIN = 38;    // px — min travel to fire 3-finger gesture
const SCROLL_MULTIPLIER = 2.2;

function loadSensitivity(): number {
  try {
    const v = parseFloat(localStorage.getItem(LS_SENSITIVITY) ?? "");
    return isNaN(v) ? DEFAULT_SENSITIVITY : Math.min(3, Math.max(0.5, v));
  } catch {
    return DEFAULT_SENSITIVITY;
  }
}

export default function TouchPad({ client, disabled }: Props) {
  const [sensitivity, setSensitivity] = useState<number>(loadSensitivity);
  const [showSettings, setShowSettings] = useState(false);
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);

  // All touch tracking in refs — zero re-renders during gesture
  const touchesRef = useRef<Map<number, TouchData>>(new Map());
  const padMovedRef = useRef(false);
  const touchStartTimeRef = useRef(0);
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);
  const pendingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchStartDist = useRef(0);
  const prevCentroid = useRef({ x: 0, y: 0 });
  const twoFingerStart = useRef<{ x: number; y: number } | null>(null);
  const twoFingerMoved = useRef(false);
  const threeFingerStart = useRef<{ x: number; y: number } | null>(null);
  const threeFingerFired = useRef(false);
  const sensRef = useRef(sensitivity);
  const leftHeldRef = useRef(false);  // bottom left button currently held

  function saveSensitivity(v: number) {
    const clamped = Math.round(v * 10) / 10;
    setSensitivity(clamped);
    sensRef.current = clamped;
    try { localStorage.setItem(LS_SENSITIVITY, String(clamped)); } catch { /* ignore */ }
  }

  function clearPendingTap() {
    if (pendingTapTimerRef.current) {
      clearTimeout(pendingTapTimerRef.current);
      pendingTapTimerRef.current = null;
    }
  }

  async function fireMultiClick(count: 1 | 2 | 3) {
    if (disabled) return;
    for (let i = 0; i < count; i++) {
      client.sendMouseClick("left", "down");
      client.sendMouseClick("left", "up");
      if (i < count - 1) await new Promise<void>((r) => setTimeout(r, 55));
    }
  }

  // ─── Pad touch events ─────────────────────────────────────────

  function handlePadTouchStart(e: React.TouchEvent) {
    e.preventDefault();

    for (const touch of Array.from(e.changedTouches)) {
      touchesRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }

    const count = e.touches.length;

    if (count === 1) {
      padMovedRef.current = false;
      touchStartTimeRef.current = Date.now();
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const centroid = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      pinchStartDist.current = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      prevCentroid.current = centroid;
      twoFingerStart.current = { ...centroid };
      twoFingerMoved.current = false;
    } else if (count === 3) {
      const all = Array.from(e.touches);
      threeFingerStart.current = {
        x: all.reduce((s, t) => s + t.clientX, 0) / 3,
        y: all.reduce((s, t) => s + t.clientY, 0) / 3,
      };
      threeFingerFired.current = false;
    }
  }

  function handlePadTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const count = e.touches.length;

    // 1-finger move OR left-button held + 1 pad finger (2 total but drag mode)
    if (count === 1 || (count === 2 && leftHeldRef.current)) {
      const ct = e.changedTouches[0];
      const prev = touchesRef.current.get(ct.identifier);
      if (prev) {
        const dx = ct.clientX - prev.x;
        const dy = ct.clientY - prev.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          padMovedRef.current = true;
          if (!disabled) {
            client.sendMouseMove(dx * sensRef.current, dy * sensRef.current);
          }
        }
      }
      touchesRef.current.set(ct.identifier, { x: ct.clientX, y: ct.clientY });
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centroid = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const scrollDx = centroid.x - prevCentroid.current.x;
      const scrollDy = centroid.y - prevCentroid.current.y;
      const distDelta = newDist - pinchStartDist.current;

      if (twoFingerStart.current) {
        const totalMove = Math.hypot(
          centroid.x - twoFingerStart.current.x,
          centroid.y - twoFingerStart.current.y,
        );
        if (totalMove > TWO_FINGER_MOVE_THRESHOLD) twoFingerMoved.current = true;
      }

      if (!disabled) {
        if (Math.abs(scrollDx) > 0.3 || Math.abs(scrollDy) > 0.3) {
          client.sendMouseScroll(-scrollDx * SCROLL_MULTIPLIER, -scrollDy * SCROLL_MULTIPLIER);
        }
        if (Math.abs(distDelta) > 4) {
          client.sendMouseZoom(distDelta * 0.008);
          pinchStartDist.current = newDist;
        }
      }

      prevCentroid.current = centroid;
      for (const touch of Array.from(e.changedTouches)) {
        touchesRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
    } else if (count === 3) {
      if (!threeFingerFired.current && threeFingerStart.current) {
        const all = Array.from(e.touches);
        const cx = all.reduce((s, t) => s + t.clientX, 0) / 3;
        const cy = all.reduce((s, t) => s + t.clientY, 0) / 3;
        const dx = cx - threeFingerStart.current.x;
        const dy = cy - threeFingerStart.current.y;
        if (Math.hypot(dx, dy) > THREE_FINGER_SWIPE_MIN) {
          threeFingerFired.current = true;
          if (!disabled) {
            let combo: string;
            if (Math.abs(dx) > Math.abs(dy)) {
              combo = dx < 0 ? "DesktopLeft" : "DesktopRight";
            } else {
              combo = dy < 0 ? "MissionControl" : "AppExpose";
            }
            client.sendKeyCombo(newClientMessageId(), combo);
          }
        }
      }
    }
  }

  function handlePadTouchEnd(e: React.TouchEvent) {
    e.preventDefault();

    const remaining = e.touches.length;
    const endCount = e.changedTouches.length;

    // ── 2-finger tap → right-click ──────────────────────────────
    if (remaining === 0 && endCount >= 2 && !twoFingerMoved.current) {
      const duration = Date.now() - touchStartTimeRef.current;
      if (duration < TAP_MAX_DURATION + 80 && !disabled) {
        client.sendMouseClick("right", "down");
        client.sendMouseClick("right", "up");
      }
      for (const touch of Array.from(e.changedTouches)) {
        touchesRef.current.delete(touch.identifier);
      }
      twoFingerStart.current = null;
      return;
    }

    // ── 1-finger tap → single / double / triple click ──────────
    if (remaining === 0 && endCount === 1 && !padMovedRef.current) {
      const duration = Date.now() - touchStartTimeRef.current;
      if (duration < TAP_MAX_DURATION) {
        const now = Date.now();
        if (now - lastTapTimeRef.current < MULTI_TAP_INTERVAL) {
          tapCountRef.current += 1;
        } else {
          tapCountRef.current = 1;
        }
        lastTapTimeRef.current = now;
        clearPendingTap();

        const currentCount = tapCountRef.current;
        pendingTapTimerRef.current = setTimeout(() => {
          const clicks = Math.min(currentCount, 3) as 1 | 2 | 3;
          fireMultiClick(clicks);
          tapCountRef.current = 0;
          lastTapTimeRef.current = 0;
        }, MULTI_TAP_INTERVAL);
      }
    }

    for (const touch of Array.from(e.changedTouches)) {
      touchesRef.current.delete(touch.identifier);
    }

    if (remaining === 0) {
      twoFingerStart.current = null;
      threeFingerStart.current = null;
      threeFingerFired.current = false;
    }
  }

  // ─── Bottom button events ──────────────────────────────────────

  function handleLeftStart(e: React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    setLeftPressed(true);
    leftHeldRef.current = true;
    if (!disabled) client.sendMouseClick("left", "down");
  }
  function handleLeftEnd(e: React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    setLeftPressed(false);
    leftHeldRef.current = false;
    if (!disabled) client.sendMouseClick("left", "up");
  }
  function handleRightStart(e: React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    setRightPressed(true);
    if (!disabled) client.sendMouseClick("right", "down");
  }
  function handleRightEnd(e: React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    setRightPressed(false);
    if (!disabled) client.sendMouseClick("right", "up");
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Settings bottom sheet ─────────────────────────────── */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.38)" }}
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full rounded-t-2xl px-6 pt-5 pb-8 safe-area-bottom"
            style={{ background: "var(--tb-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <span className="text-[16px] font-semibold" style={{ color: "var(--tb-text)" }}>
                {t("monitor.sensitivity")}
              </span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: "var(--tb-bg)", color: "var(--tb-muted)" }}
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <span className="text-[12px] w-8 text-right shrink-0" style={{ color: "var(--tb-muted)" }}>
                {t("monitor.sensitivityLow")}
              </span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={sensitivity}
                onChange={(e) => saveSensitivity(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: "var(--tb-accent)" }}
              />
              <span className="text-[12px] w-8 shrink-0" style={{ color: "var(--tb-muted)" }}>
                {t("monitor.sensitivityHigh")}
              </span>
            </div>
            <div className="text-center text-[13px] font-medium" style={{ color: "var(--tb-accent)" }}>
              {sensitivity.toFixed(1)}×
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar: settings button ──────────────────────────── */}
      <div className="flex items-center justify-end px-3 pt-3 pb-1 shrink-0">
        <button
          type="button"
          onTouchEnd={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowSettings(true);
          }}
          onClick={() => setShowSettings(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full"
          style={{
            background: "var(--tb-surface)",
            color: "var(--tb-muted)",
            border: "1px solid var(--tb-border)",
          }}
        >
          <Settings2 size={16} strokeWidth={2} />
        </button>
      </div>

      {/* ── Trackpad area ─────────────────────────────────────── */}
      <div
        className="mx-3 flex-1 relative rounded-2xl touch-none select-none overflow-hidden"
        style={{
          background: "var(--tb-surface)",
          border: "1px solid var(--tb-border)",
        }}
        onTouchStart={handlePadTouchStart}
        onTouchMove={handlePadTouchMove}
        onTouchEnd={handlePadTouchEnd}
        onTouchCancel={handlePadTouchEnd}
      >
        {/* Usage hint — bottom */}
        <div
          className="absolute bottom-3 left-0 right-0 text-center text-[11px] pointer-events-none"
          style={{ color: "var(--tb-muted)" }}
        >
          {t("monitor.touchpadHint")}
        </div>
      </div>

      {/* ── Bottom mouse buttons ──────────────────────────────── */}
      <div className="flex gap-2 px-4 pt-3 pb-6 safe-area-bottom shrink-0">
        <button
          type="button"
          className="flex-1 rounded-xl text-[15px] font-medium select-none transition-colors"
          style={{
            background: leftPressed
              ? "color-mix(in srgb, var(--tb-text) 18%, var(--tb-surface))"
              : "var(--tb-surface)",
            color: "var(--tb-text)",
            border: `1px solid ${leftPressed ? "var(--tb-text)" : "var(--tb-border)"}`,
            paddingTop: "18px",
            paddingBottom: "18px",
          }}
          onTouchStart={handleLeftStart}
          onTouchEnd={handleLeftEnd}
          onTouchCancel={handleLeftEnd}
        >
          {t("monitor.touchpadLeftBtn")}
        </button>
        <button
          type="button"
          className="flex-1 rounded-xl text-[15px] font-medium select-none transition-colors"
          style={{
            background: rightPressed
              ? "color-mix(in srgb, var(--tb-text) 18%, var(--tb-surface))"
              : "var(--tb-surface)",
            color: "var(--tb-text)",
            border: `1px solid ${rightPressed ? "var(--tb-text)" : "var(--tb-border)"}`,
            paddingTop: "18px",
            paddingBottom: "18px",
          }}
          onTouchStart={handleRightStart}
          onTouchEnd={handleRightEnd}
          onTouchCancel={handleRightEnd}
        >
          {t("monitor.touchpadRightBtn")}
        </button>
      </div>
    </div>
  );
}
