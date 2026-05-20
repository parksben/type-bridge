/**
 * Tap sound — short synthesized click for press feedback.
 *
 * Designed as a fallback for platforms where the Vibration API is unavailable
 * (notably iOS), but available on all platforms as an opt-in extra cue.
 *
 * Implementation notes:
 *   - Web Audio API works on plain HTTP (no secure-context requirement).
 *   - AudioContext starts in `suspended` state under Chrome/Safari autoplay
 *     policy; must be resumed from inside a user gesture once. We expose
 *     `primeTapSound()` to call from the first touchstart after chat enters.
 *   - We synthesize a short exponential-decay sine burst instead of loading
 *     an audio file — zero asset weight, zero network, predictable latency.
 *   - Default volume is very low (0.05) so the cue is subliminal, not noisy.
 */

type TapKind = "tap" | "accent";

interface TapParams {
  freq: number;
  duration: number; // seconds
  gain: number;
}

const PRESETS: Record<TapKind, TapParams> = {
  tap: { freq: 880, duration: 0.025, gain: 0.05 },
  accent: { freq: 660, duration: 0.04, gain: 0.08 },
};

let ctx: AudioContext | null = null;
let enabled = false;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const AC =
    (window as unknown as { AudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Unlock the audio context. Must be called from inside a real user-gesture
 * handler (touchstart / click) at least once before `playTap` will produce
 * audible output on iOS Safari.
 *
 * Call this from the first interaction after the chat screen mounts.
 */
export function primeTapSound(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {
      /* ignore */
    });
  }
  enabled = true;
}

/** Toggle tap sound globally (e.g. user preference). */
export function setTapSoundEnabled(on: boolean): void {
  enabled = on;
}

export function isTapSoundEnabled(): boolean {
  return enabled;
}

/**
 * Play a short synthesized click. Silently no-ops if audio is unavailable
 * or has not been primed by a user gesture yet.
 */
export function playTap(kind: TapKind = "tap"): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c || c.state !== "running") return;

  const { freq, duration, gain } = PRESETS[kind];
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, c.currentTime);

    // Quick attack, exponential decay — clicky envelope without thump.
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);

    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration + 0.01);
  } catch {
    // Ignore — audio errors should never break input handling.
  }
}
