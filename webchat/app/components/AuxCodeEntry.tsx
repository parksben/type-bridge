"use client";

import { useState } from "react";
import { Loader2, KeyRound, AlertCircle } from "lucide-react";
import { lookupAuxCode, RelayError } from "@/app/lib/relay";

type Props = {
  onResolve: (sessionId: string) => void;
};

const CODE_LEN = 8;

/** 用户没扫码、直接打开域名 → 进这里输 8 位辅助码换 sessionId */
export default function AuxCodeEntry({ onResolve }: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LEN || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await lookupAuxCode(code.toUpperCase());
      onResolve(r.sessionId);
    } catch (err) {
      const e = err as RelayError;
      if (e.code === "NOT_FOUND") setError("没找到这个会话码，请检查是否输入正确");
      else if (e.code === "EXPIRED") setError("会话已过期，请在桌面端重启会话");
      else setError(e.message || "查询失败");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <form onSubmit={submit} className="max-w-sm w-full text-center animate-fade-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
             style={{ background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)" }}>
          <KeyRound size={28} className="text-[var(--tb-accent)]" strokeWidth={1.75} />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight mb-2">输入会话码</h1>
        <p className="text-[var(--tb-muted)] text-[14px] leading-relaxed mb-8">
          没办法扫描二维码？输入桌面端 WebChat tab 上的
          <br />
          8 位会话码（A–Z 与 2–7），等价于扫码。
        </p>

        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-7]/g, ""))}
          maxLength={CODE_LEN}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="A2K9FH3Z"
          className="w-full h-14 text-center text-xl font-mono tracking-[0.2em] rounded-xl border outline-none transition-all focus:border-[var(--tb-accent)] mb-4 disabled:opacity-60"
          style={{
            background: "var(--tb-surface)",
            borderColor: "var(--tb-border)",
            color: "var(--tb-text)",
          }}
          disabled={submitting}
        />

        <button
          type="submit"
          disabled={code.length !== CODE_LEN || submitting}
          className="w-full h-12 rounded-xl font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--tb-accent)" }}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" />
              查询中…
            </span>
          ) : (
            "下一步"
          )}
        </button>

        {error && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-sm text-[var(--tb-danger)]">
            <AlertCircle size={14} strokeWidth={2} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </main>
  );
}
