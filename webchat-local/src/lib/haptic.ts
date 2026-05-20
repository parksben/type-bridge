/**
 * Haptic feedback wrapper around the Vibration API.
 *
 * Platform support (verified on HTTP / LAN context — Vibration API is NOT
 * secure-context-only, so it works fine on http://192.168.x.x):
 *   - Android Chrome / WebView / 微信 / 钉钉:  ✅
 *   - iOS Safari / WKWebView / 微信 / 钉钉:     ❌ (Apple does not implement)
 *
 * On unsupported platforms (iOS) we silently no-op; the UI should compensate
 * with a stronger visual pressed state and the tap-sound fallback.
 */

type HapticStrength = "tick" | "tap" | "accent";

const DURATIONS: Record<HapticStrength, number> = {
  tick: 8, // repeat pulses while holding a key down
  tap: 20, // standard key press
  accent: 35, // strong actions: screenshot, clear, destructive
};

let cachedSupported: boolean | null = null;

function isSupported(): boolean {
  if (cachedSupported !== null) return cachedSupported;
  cachedSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function";
  return cachedSupported;
}

/**
 * Trigger a haptic pulse if the platform supports it. Silently no-ops otherwise.
 * Safe to call from any event handler — wrapped in try/catch in case the
 * browser throws on permission/policy edge cases.
 */
export function haptic(strength: HapticStrength = "tap"): void {
  if (!isSupported()) return;
  try {
    navigator.vibrate(DURATIONS[strength]);
  } catch {
    // Some browsers throw if called outside a user gesture; ignore.
  }
}

/** Feature-detect helper for callers that want to gate UI hints. */
export function hapticSupported(): boolean {
  return isSupported();
}
