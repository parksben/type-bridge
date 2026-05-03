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

// 3s 内引擎未启动（未收到 onaudiostart / onspeechstart / onresult）→ 认定缺引擎。
// 正常浏览器一般在 500ms-1.5s 内 onaudiostart；3s 已足够保守。
const START_TIMEOUT_MS = 3000;

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
  // 标志：引擎**真正**在工作（不只是接口调用成功 = onstart，而是音频采集启动 /
  // 开始拾音 / 已出结果）。
  // 华为 / MIUI 浏览器的 quirk：缺 Google 语音服务时会 fire onstart 但之后
  // 永远没 onaudiostart / onresult / onerror / onend。所以 onstart 不算
  // "started"，否则超时 timer 会被 onstart 提前清掉，导致 fallback 失效。
  let started = false;
  let gotResult = false;
  // 超时 timer：start() 后 START_TIMEOUT_MS 内未 started 就主动兜底
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
    gotResult = false;
    lastInterim = "";
    recog = new Ctor();
    recog.lang = opts.lang || "zh-CN";
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    // 注意：onstart 故意不设 started=true —— 见上方注释
    recog.onstart = () => { /* noop */ };
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
      gotResult = true;
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
      if (cancelled || errored) {
        recog = null;
        return;
      }
      // onend 触发但既没 started 也没 result —— 引擎啥都没干就结束了
      // （某些 Android ROM 的另一种失败模式）
      if (!started && !gotResult) {
        errored = true;
        opts.onError?.("engine-silent");
        recog = null;
        return;
      }
      // 正常：把最后一段 interim 作为 final（用户说完了但引擎未标记 isFinal）
      if (lastInterim && !gotResult) {
        opts.onFinal?.(lastInterim);
      }
      opts.onEnd?.();
      recog = null;
    };

    try {
      recog.start();
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
