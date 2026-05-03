// Web Speech API 封装。SpeechRecognition 跨浏览器命名不一致：
//   - 标准: window.SpeechRecognition
//   - WebKit (iOS Safari / Chrome): window.webkitSpeechRecognition
//
// iOS Safari 的实现有些 quirk：
//   - 必须每次重新 new，不能复用实例
//   - continuous=true 不稳定，建议用 false + 短时多次
//   - 结果触发顺序：onresult (interim) → onresult (final) → onend

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

export function createSpeech(opts: Options): SpeechController | null {
  if (!isSpeechSupported()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  let recog: AnyRecog | null = null;
  let lastInterim = "";
  let cancelled = false;

  function start() {
    cancelled = false;
    lastInterim = "";
    recog = new Ctor();
    recog.lang = opts.lang || "zh-CN";
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.onresult = (e: AnyRecog) => {
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
      if (cancelled) return;
      opts.onError?.(e.error || "unknown error");
    };
    recog.onend = () => {
      if (!cancelled) {
        // 如果没有 final 但有 interim，也作为 final 上送（用户说完了）
        if (lastInterim) opts.onFinal?.(lastInterim);
        opts.onEnd?.();
      }
      recog = null;
    };
    try {
      recog.start();
    } catch (e) {
      opts.onError?.((e as Error).message);
    }
  }

  function stop() {
    if (recog) {
      try { recog.stop(); } catch { /* ignore */ }
    }
  }

  function cancel() {
    cancelled = true;
    if (recog) {
      try { recog.abort(); } catch { /* ignore */ }
      recog = null;
    }
  }

  return { start, stop, cancel };
}
