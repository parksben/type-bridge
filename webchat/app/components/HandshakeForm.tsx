"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

type Props = {
  sessionId: string;
  onSubmit: (otp: string) => Promise<void>;
  /** 父级注入错误，组件触发抖动反馈 */
  errorNonce?: number;
  errorMessage?: string;
};

const OTP_LEN = 6;

export default function HandshakeForm({ onSubmit, errorNonce, errorMessage }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // 父级 nonce 变化 → 抖动 + 清空
  useEffect(() => {
    if (errorNonce && errorNonce > 0) {
      setDigits(Array(OTP_LEN).fill(""));
      setShakeKey((k) => k + 1);
      setSubmitting(false);
      inputs.current[0]?.focus();
    }
  }, [errorNonce]);

  // 自动聚焦第一格
  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  function handleInput(idx: number, v: string) {
    // 仅保留数字，最多取 OTP_LEN 位（粘贴整串 OTP 也支持）
    const cleaned = v.replace(/\D/g, "");
    if (!cleaned) {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = "";
        setDigits(next);
      }
      return;
    }
    if (cleaned.length > 1) {
      // 粘贴整串
      const arr = cleaned.slice(0, OTP_LEN).split("");
      const next = Array(OTP_LEN).fill("");
      arr.forEach((d, i) => (next[i] = d));
      setDigits(next);
      const nextIdx = Math.min(arr.length, OTP_LEN - 1);
      inputs.current[nextIdx]?.focus();
      if (arr.length === OTP_LEN) doSubmit(next.join(""));
      return;
    }
    const next = [...digits];
    next[idx] = cleaned[0];
    setDigits(next);
    if (idx < OTP_LEN - 1) inputs.current[idx + 1]?.focus();
    if (next.every((d) => d !== "")) doSubmit(next.join(""));
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = "";
      setDigits(next);
      inputs.current[idx - 1]?.focus();
      e.preventDefault();
    }
  }

  async function doSubmit(otp: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(otp);
    } finally {
      // submitting 状态由父级通过 errorNonce 复位 / 自动跳到 chat 页
    }
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full text-center animate-fade-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
             style={{ background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)" }}>
          <ShieldCheck size={28} className="text-[var(--tb-accent)]" strokeWidth={1.75} />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          输入桌面屏幕上的验证码
        </h1>
        <p className="text-[var(--tb-muted)] text-[14px] leading-relaxed mb-8">
          打开你 Mac 上的 TypeBridge App，
          <br />
          切到 WebChat tab，输入屏幕显示的 6 位 OTP。
        </p>

        <div
          key={shakeKey}
          className={`flex items-center justify-center gap-2 mb-6 ${
            shakeKey > 0 ? "animate-shake" : ""
          }`}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={submitting}
              className="w-11 h-14 text-center text-2xl font-semibold rounded-xl border outline-none transition-all focus:border-[var(--tb-accent)] disabled:opacity-60"
              style={{
                background: "var(--tb-surface)",
                borderColor: "var(--tb-border)",
                color: "var(--tb-text)",
              }}
            />
          ))}
        </div>

        {submitting && (
          <div className="flex items-center justify-center gap-2 text-[var(--tb-muted)] text-sm">
            <Loader2 size={14} className="animate-spin" />
            <span>正在与桌面端校验…</span>
          </div>
        )}

        {errorMessage && !submitting && (
          <div className="flex items-center justify-center gap-1.5 text-sm text-[var(--tb-danger)]">
            <AlertCircle size={14} strokeWidth={2} />
            <span>{errorMessage}</span>
          </div>
        )}

        <p className="text-xs text-[var(--tb-muted)] mt-8 leading-relaxed">
          会话 5 分钟内未握手会自动作废。
          <br />
          OTP 错误 5 次将锁定本会话。
        </p>
      </div>
    </main>
  );
}
