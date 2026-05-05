import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { t } from "@/i18n";

type Props = {
  onSubmit: (otp: string) => Promise<void> | void;
  /** 外部错误消息触发抖动；nonce 变化时抖动一次 */
  errorNonce: number;
  errorMessage?: string | undefined;
};

const OTP_LEN = 6;

/// 6 位 OTP 输入：6 个独立数字框，自动跳格、自动提交、iOS 键盘数字模式
export default function HandshakeForm({ onSubmit, errorNonce, errorMessage }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // 首次加载自动聚焦第一格
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  // 外部错误时触发抖动 + 清空输入
  useEffect(() => {
    if (errorNonce === 0) return;
    setDigits(Array(OTP_LEN).fill(""));
    setShakeKey((k) => k + 1);
    setTimeout(() => refs.current[0]?.focus(), 100);
  }, [errorNonce]);

  const allFilled = digits.every((d) => d !== "");

  function handleChange(idx: number, raw: string) {
    const v = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
    if (v && idx < OTP_LEN - 1) {
      refs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        setDigits((prev) => {
          const next = [...prev];
          next[idx] = "";
          return next;
        });
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < OTP_LEN - 1) {
      refs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LEN);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LEN).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    const focusIdx = Math.min(text.length, OTP_LEN - 1);
    refs.current[focusIdx]?.focus();
  }

  async function submit() {
    if (!allFilled || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(digits.join(""));
    } finally {
      setSubmitting(false);
    }
  }

  // 全部填满后自动提交（去掉手动点按钮的步骤）
  useEffect(() => {
    if (allFilled && !submitting) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFilled]);

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src="/logo.png" srcSet="/logo@2x.png 2x" alt="" width={36} height={36} />
          <span className="text-[16px] font-semibold tracking-tight">TypeBridge WebChat</span>
        </div>

        <h1 className="text-[20px] font-semibold tracking-tight text-center mb-2">
          {t("handshake.title")}
        </h1>
        <p className="text-[13px] text-[var(--tb-muted)] text-center leading-relaxed mb-7">
          {t("handshake.desc")}
        </p>

        <div
          key={shakeKey}
          className={`flex items-center justify-between gap-2 mb-5 ${shakeKey ? "animate-shake" : ""}`}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              disabled={submitting}
              className="w-12 h-14 text-center text-[22px] font-semibold font-mono tabular-nums rounded-xl outline-none transition-all"
              style={{
                background: "var(--tb-surface)",
                border: `1px solid ${d ? "var(--tb-accent)" : "var(--tb-border)"}`,
                color: "var(--tb-text)",
                boxShadow: d ? "0 0 0 3px var(--tb-accent-soft)" : "none",
              }}
            />
          ))}
        </div>

        {errorMessage && (
          <p className="text-[13px] text-[var(--tb-danger)] text-center mb-4">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!allFilled || submitting}
          className="w-full h-12 rounded-xl font-medium text-[14.5px] flex items-center justify-center gap-1.5 text-white transition-all disabled:opacity-40"
          style={{ background: "var(--tb-accent)" }}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t("handshake.verifying")}
            </>
          ) : (
            <>
              {t("handshake.confirm")}
              <ArrowRight size={16} strokeWidth={2.2} />
            </>
          )}
        </button>
      </div>
    </main>
  );
}
