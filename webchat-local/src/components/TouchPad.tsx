import { useEffect, useRef, useState } from "react";
import { RectangleHorizontal, RectangleVertical, Settings2, X } from "lucide-react";
import { WebChatClient } from "@/lib/socket";
import { t } from "@/i18n";

type Props = {
  client: WebChatClient;
  disabled: boolean;
};

type TouchData = { x: number; y: number };

const LS_SENSITIVITY = "tb_touchpad_sensitivity";
const LS_SCROLL_REVERSED = "tb_scroll_reversed";
const DEFAULT_SENSITIVITY = 2.0;
const TAP_MAX_DURATION = 260;
const MULTI_TAP_INTERVAL = 320;
const TWO_FINGER_MOVE_THRESHOLD = 14;
const SCROLL_MULTIPLIER = 2.2;

function loadSensitivity(): number {
  try {
    const v = parseFloat(localStorage.getItem(LS_SENSITIVITY) ?? "");
    return isNaN(v) ? DEFAULT_SENSITIVITY : Math.min(3, Math.max(0.5, v));
  } catch {
    return DEFAULT_SENSITIVITY;
  }
}

function loadScrollReversed(): boolean {
  try {
    return localStorage.getItem(LS_SCROLL_REVERSED) === "true";
  } catch {
    return false;
  }
}

export default function TouchPad({ client, disabled }: Props) {
  const [sensitivity, setSensitivity] = useState<number>(loadSensitivity);
  const [scrollReversed, setScrollReversed] = useState<boolean>(loadScrollReversed);
  const [showSettings, setShowSettings] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);

  const touchesRef = useRef<Map<number, TouchData>>(new Map());
  const padMovedRef = useRef(false);
  const touchStartTimeRef = useRef(0);
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);
  const pendingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCentroid = useRef({ x: 0, y: 0 });
  const twoFingerStart = useRef<{ x: number; y: number } | null>(null);
  const twoFingerMoved = useRef(false);
  const sensRef = useRef(sensitivity);
  const scrollRevRef = useRef(scrollReversed);
  const leftHeldRef = useRef(false);
  const landscapeRef = useRef(false);

  // ResizeObserver 监听容器尺寸，用于横屏 CSS rotate
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // landscapeRef 与 state 保持同步，供 touch handler 同步读取
  function toggleLandscape() {
    setLandscape((v) => {
      landscapeRef.current = !v;
      return !v;
    });
  }

  function saveSensitivity(v: number) {
    const clamped = Math.round(v * 10) / 10;
    setSensitivity(clamped);
    sensRef.current = clamped;
    try { localStorage.setItem(LS_SENSITIVITY, String(clamped)); } catch { /* ignore */ }
  }

  function saveScrollReversed(v: boolean) {
    setScrollReversed(v);
    scrollRevRef.current = v;
    try { localStorage.setItem(LS_SCROLL_REVERSED, String(v)); } catch { /* ignore */ }
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

  // ─── Pad touch events ──────────────────────────────────────

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
      prevCentroid.current = centroid;
      twoFingerStart.current = { ...centroid };
      twoFingerMoved.current = false;
    }
  }

  function handlePadTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const count = e.touches.length;

    if (count === 1 || (count === 2 && leftHeldRef.current)) {
      const ct = e.changedTouches[0];
      const prev = touchesRef.current.get(ct.identifier);
      if (prev) {
        const dx = ct.clientX - prev.x;
        const dy = ct.clientY - prev.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          padMovedRef.current = true;
          if (!disabled) {
            // 横屏旋转 90° 后坐标轴对换：鼠标X=dy, 鼠标Y=-dx
            const mx = landscapeRef.current ? dy : dx;
            const my = landscapeRef.current ? -dx : dy;
            client.sendMouseMove(mx * sensRef.current, my * sensRef.current);
          }
        }
      }
      touchesRef.current.set(ct.identifier, { x: ct.clientX, y: ct.clientY });
    } else if (count === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const centroid = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const scrollDx = centroid.x - prevCentroid.current.x;
      const scrollDy = centroid.y - prevCentroid.current.y;

      if (twoFingerStart.current) {
        const totalMove = Math.hypot(
          centroid.x - twoFingerStart.current.x,
          centroid.y - twoFingerStart.current.y,
        );
        if (totalMove > TWO_FINGER_MOVE_THRESHOLD) twoFingerMoved.current = true;
      }

      if (!disabled) {
        const dir = scrollRevRef.current ? -1 : 1;
        if (Math.abs(scrollDx) > 0.3 || Math.abs(scrollDy) > 0.3) {
          client.sendMouseScroll(dir * scrollDx * SCROLL_MULTIPLIER, dir * scrollDy * SCROLL_MULTIPLIER);
        }
      }

      prevCentroid.current = centroid;
      for (const touch of Array.from(e.changedTouches)) {
        touchesRef.current.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
    }
  }

  function handlePadTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    const remaining = e.touches.length;
    const endCount = e.changedTouches.length;

    // 双指抬起 → 右键单击
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

    // 单指短触 → 单击 / 双击 / 三击
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
    }
  }

  // ─── Bottom button events ──────────────────────────────────

  function handleLeftStart(e: React.TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    setLeftPressed(true);
    leftHeldRef.current = true;
    if (!disabled) client.sendMouseClick("left", "down");
  }
  function handleLeftEnd(e: React.TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    setLeftPressed(false);
    leftHeldRef.current = false;
    if (!disabled) client.sendMouseClick("left", "up");
  }
  function handleRightStart(e: React.TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    setRightPressed(true);
    if (!disabled) client.sendMouseClick("right", "down");
  }
  function handleRightEnd(e: React.TouchEvent) {
    e.stopPropagation(); e.preventDefault();
    setRightPressed(false);
    if (!disabled) client.sendMouseClick("right", "up");
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Settings bottom sheet ─────────────────────────── */}
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

            {/* 灵敏度 */}
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[12px] w-8 text-right shrink-0" style={{ color: "var(--tb-muted)" }}>
                {t("monitor.sensitivityLow")}
              </span>
              <input
                type="range" min={0.5} max={3} step={0.1}
                value={sensitivity}
                onChange={(e) => saveSensitivity(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: "var(--tb-accent)" }}
              />
              <span className="text-[12px] w-8 shrink-0" style={{ color: "var(--tb-muted)" }}>
                {t("monitor.sensitivityHigh")}
              </span>
            </div>
            <div className="text-center text-[13px] font-medium mb-5" style={{ color: "var(--tb-accent)" }}>
              {sensitivity.toFixed(1)}×
            </div>

            {/* 滚动方向 */}
            <div
              className="flex items-center justify-between py-3.5 border-t"
              style={{ borderColor: "var(--tb-border)" }}
            >
              <span className="text-[14px]" style={{ color: "var(--tb-text)" }}>
                {t("monitor.touchpadScrollDir")}
              </span>
              <div
                className="flex rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--tb-border)" }}
              >
                {(
                  [
                    { value: false, label: t("monitor.touchpadScrollNatural") },
                    { value: true, label: t("monitor.touchpadScrollReverse") },
                  ] as { value: boolean; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => saveScrollReversed(value)}
                    className="px-4 py-1.5 text-[13px] font-medium transition-colors"
                    style={{
                      background: scrollReversed === value ? "var(--tb-accent)" : "var(--tb-bg)",
                      color: scrollReversed === value ? "white" : "var(--tb-muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Trackpad + Buttons（内部始终 flex-col，横屏用 CSS rotate） */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <div
          className="absolute flex flex-col"
          style={
            landscape && containerSize.w > 0
              ? {
                  /* 宽高对换后旋转 90°，视觉上充满容器 */
                  width: containerSize.h,
                  height: containerSize.w,
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%) rotate(90deg)",
                }
              : { inset: 0, display: "flex", flexDirection: "column" }
          }
        >
          {/* ── Trackpad area ────────────────────────────── */}
          <div
            className="relative rounded-2xl touch-none select-none overflow-hidden flex-1 mx-3 mt-3"
            style={{
              background: "var(--tb-surface)",
              border: "1px solid var(--tb-border)",
            }}
            onTouchStart={handlePadTouchStart}
            onTouchMove={handlePadTouchMove}
            onTouchEnd={handlePadTouchEnd}
            onTouchCancel={handlePadTouchEnd}
          >
            {/* 中心大字提示 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="text-[28px] font-medium tracking-wide select-none"
                style={{ color: "color-mix(in srgb, var(--tb-muted) 35%, transparent)" }}
              >
                {t("monitor.touchpadHint")}
              </span>
            </div>
            {/* 右上角 overlay：横竖屏切换 + 设置 */}
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              <button
                type="button"
                onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); toggleLandscape(); }}
                onClick={() => toggleLandscape()}
                className="w-9 h-9 flex items-center justify-center rounded-full"
                style={{
                  background: landscape
                    ? "var(--tb-accent)"
                    : "color-mix(in srgb, var(--tb-surface) 80%, transparent)",
                  color: landscape ? "white" : "var(--tb-muted)",
                  border: "1px solid var(--tb-border)",
                  backdropFilter: "blur(4px)",
                }}
              >
                {landscape
                  ? <RectangleVertical size={16} strokeWidth={2} />
                  : <RectangleHorizontal size={16} strokeWidth={2} />}
              </button>
              <button
                type="button"
                onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); setShowSettings(true); }}
                onClick={() => setShowSettings(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--tb-surface) 80%, transparent)",
                  color: "var(--tb-muted)",
                  border: "1px solid var(--tb-border)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <Settings2 size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* ── Mouse buttons（始终横排在底部）──────────── */}
          <div
            className="flex gap-2 px-4 pt-3 shrink-0"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px) + 16px, 24px)" }}
          >
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
      </div>
    </div>
  );
}
