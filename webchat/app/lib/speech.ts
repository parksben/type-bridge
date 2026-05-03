// Web Speech API 封装。SpeechRecognition 跨浏览器命名不一致：
//   - 标准: window.SpeechRecognition
//   - WebKit (iOS Safari / Chrome): window.webkitSpeechRecognition
//
// iOS Safari 的实现有些 quirk：
//   - 必须每次重新 new，不能复用实例
//   - continuous=true 不稳定，建议用 false + 短时多次
//   - 结果触发顺序：onstart → onaudiostart → onresult (interim) → onresult (final) → onend
//
// 国产 Android ROM（华为/MIUI/ColorOS 等）的 quirk：
//   - SpeechRecognition 接口存在，但底层 Google 语音服务不可用
//   - start() 会弹出系统 toast"找不到 Android 语音引擎"，但 **不会 fire onerror**
//   - 也不会 fire onend —— 永远卡在 loading 状态
//   - 解决方案：start() 后 START_TIMEOUT_MS 内未收到 onstart / onaudiostart，
//     主动 abort() 并把 "engine-timeout" 报给上层，触发 fallback

type RecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecog = any;

export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export type SpeechController = {
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

type Options = {
  lang?: string;
  onInterim?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
};

// 5s 内引擎未启动 → 认定为"系统缺引擎"。够用户应对权限弹窗 + 正常引擎冷启动。
const START_TIMEOUT_MS = 5000;

export function createSpeech(opts: Options): SpeechController | null {
  if (!isSpeechSupported()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  let recog: AnyRecog | null = null;
  let lastInterim = "";
  let cancelled = false;
  // 标志：error 已触发时 onend 不再走 onEnd 分支（避免 VoiceButton 里把 picker
  // 重置回 idle 的竞态）
  let errored = false;
  // 标志：引擎已确认启动（收到 onstart / onaudiostart / 任何 result）
  let started = false;
  // 超时 timer：start() 后 5s 内未 started 就主动兜底
  let startTimer: ReturnType<typeof setTimeout> | null = null;

  function clearStartTimer() {
    if (startTimer !== null) {
      clearTimeout(startTimer);
      startTimer = null;
    }
  }

  function start() {
    cancelled = false;
    errored = false;
    started = false;
    lastInterim = "";
    recog = new Ctor();
    recog.lang = opts.lang || "zh-CN";
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      started = true;
      clearStartTimer();
    };
    recog.onaudiostart = () => {
      started = true;
      clearStartTimer();
    };
    recog.onspeechstart = () => {
      started = true;
      clearStartTimer();
    };

    recog.onresult = (e: AnyRecog) => {
      started = true;
      clearStartTimer();
      if (cancelled) return;
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i] as RecognitionResult & {
          0: { transcript: string };
          isFinal: boolean;
        };
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) {
        lastInterim = interim;
        opts.onInterim?.(interim);
      }
      if (final) {
        opts.onFinal?.(final);
      }
    };

    recog.onerror = (e: AnyRecog) => {
      errored = true;
      clearStartTimer();
      if (cancelled) return;
      opts.onError?.(e.error || "unknown error");
    };

    recog.onend = () => {
      clearStartTimer();
      // 若已通过 error 分支通知上层，就不再 fire onEnd（否则 VoiceButton
      // 会把刚切到的 picker mode 又重置为 idle）
      if (!cancelled && !errored) {
        if (lastInterim) opts.onFinal?.(lastInterim);
        opts.onEnd?.();
      }
      recog = null;
    };

    try {
      recog.start();
      // 兜底：START_TIMEOUT_MS 内没 started 就主动触发 engine-timeout
      startTimer = setTimeout(() => {
        if (!started && !errored && !cancelled) {
          errored = true;
          try { recog?.abort(); } catch { /* ignore */ }
          opts.onError?.("engine-timeout");
          recog = null;
        }
      }, START_TIMEOUT_MS);
    } catch (e) {
      errored = true;
      clearStartTimer();
      opts.onError?.((e as Error).message || "start-failed");
    }
  }

  function stop() {
    if (recog) {
      try { recog.stop(); } catch { /* ignore */ }
    }
  }

  function cancel() {
    cancelled = true;
    clearStartTimer();
    if (recog) {
      try { recog.abort(); } catch { /* ignore */ }
      recog = null;
    }
  }

  return { start, stop, cancel };
}
