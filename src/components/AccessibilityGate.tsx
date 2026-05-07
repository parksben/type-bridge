import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ShieldAlert, Loader2 } from "lucide-react";
import { useI18n } from "../i18n";

/// 辅助功能权限启动模态（blocking gate）
///
/// 首次启动未授权时覆盖主窗口，阻止操作。
/// • "已授权"按钮：用户手动勾选后点击，主动校验权限，通过即消失
/// • "跳过"按钮：临时关闭弹层；若后续注入因权限失败，弹层会再次出现
/// • hint 文案中嵌入"前往系统设置"内联链接，保留一键直达系统设置入口
export default function AccessibilityGate() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  // ── 挂载：初始查询 + 事件订阅 ──
  useEffect(() => {
    invoke<boolean>("check_accessibility")
      .then(setGranted)
      .catch(() => setGranted(false));

    const un1 = listen<{ granted: boolean }>("typebridge://accessibility", (e) => {
      setGranted(e.payload.granted);
    });

    // 注入失败且原因明确为"辅助功能权限未授予"时，重新弹出 gate
    const un2 = listen<{ success: boolean; reason?: string }>(
      "typebridge://inject-result",
      (e) => {
        if (!e.payload.success && e.payload.reason?.includes("辅助功能权限未授予")) {
          setGranted(false);
          setDismissed(false);
          setError(null);
        }
      },
    );

    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, []);

  // ── 3 秒轮询：后台静默检测，授权后自动消失 ──
  useEffect(() => {
    if (granted === true) return;
    const id = setInterval(() => {
      invoke<boolean>("check_accessibility")
        .then((ok) => {
          setGranted(ok);
          if (ok) {
            setError(null);
            setDismissed(false);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [granted]);

  // ── 操作回调 ──
  const handleGrantedCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const ok = await invoke<boolean>("check_accessibility");
      if (ok) {
        setGranted(true);
        setDismissed(false);
      } else {
        setError(t("accessibility.notGranted"));
        setGranted(false);
      }
    } catch {
      setError(t("accessibility.notGranted"));
      setGranted(false);
    } finally {
      setChecking(false);
    }
  }, [t]);

  const openPrefs = useCallback(async () => {
    await invoke("request_accessibility").catch(() => {});
  }, []);

  const handleSkip = useCallback(() => {
    setDismissed(true);
    setError(null);
  }, []);

  // ── 显示判断 ──
  if (granted === true) return null;
  if (dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        className="w-full max-w-[460px] rounded-[14px] p-6 animate-enter"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <ShieldAlert
            size={24}
            strokeWidth={1.75}
            className="shrink-0 mt-0.5 text-accent"
          />
          <div className="flex-1">
            <div className="text-[15px] font-medium text-text leading-tight mb-1">
              {t("accessibility.title")}
            </div>
            <div className="text-[12px] text-muted leading-relaxed">
              {t("accessibility.body")}
            </div>
          </div>
        </div>

        <div
          className="rounded-md px-3 py-2.5 text-[12px] leading-relaxed mb-5"
          style={{
            background: "var(--surface-2)",
            color: "var(--muted)",
          }}
        >
          {t("accessibility.hint")}
          <button
            onClick={openPrefs}
            className="tb-btn-link-inline mx-0.5"
          >
            {t("accessibility.hintLink")}
          </button>
          {t("accessibility.hintSuffix")}
        </div>

        {/* 错误反馈 */}
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12px] leading-relaxed mb-4"
            style={{
              background: "rgba(220, 38, 38, 0.08)",
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        {/* 按钮行："已授权"（primary）+ "跳过"（ghost） */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGrantedCheck}
            disabled={checking}
            className="tb-btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
          >
            {checking && <Loader2 size={14} strokeWidth={2} className="animate-spin" />}
            {checking ? t("accessibility.checking") : t("accessibility.granted")}
          </button>
          <button
            onClick={handleSkip}
            className="tb-btn-ghost shrink-0 px-3 py-2.5"
          >
            {t("accessibility.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
