import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { useI18n } from "../i18n";

/// 辅助功能权限启动模态（blocking gate）
///
/// 未授予时覆盖整个主窗口，用户无法操作其他 tab。
/// 授予后自动消失（3s 轮询 + Rust 启动广播事件）。
/// macOS 限制：没有任何 API 能应用自己给自己授权，也没有"同意即开"的
/// 系统确认框。能做的最短路径就是一键深链到"系统设置 → 隐私与安全性
/// → 辅助功能"，配合启动时已调过 AXIsProcessTrusted 把 TypeBridge
/// 自动登记到列表里，用户到了设置页直接勾开关即可。
export default function AccessibilityGate() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    invoke<boolean>("check_accessibility")
      .then(setGranted)
      .catch(() => setGranted(false));

    const un = listen<{ granted: boolean }>("typebridge://accessibility", (e) => {
      setGranted(e.payload.granted);
    });

    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (granted === true) return;
    const id = setInterval(() => {
      invoke<boolean>("check_accessibility")
        .then(setGranted)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [granted]);

  if (granted !== false) return null;

  async function openPrefs() {
    await invoke("request_accessibility").catch(() => {});
  }

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
          {t("accessibility.hintBefore")}
          <span className="text-text font-medium">{t("accessibility.hintToggle")}</span>{t("accessibility.hintAfter")}
        </div>

        <button
          onClick={openPrefs}
          className="tb-btn-primary inline-flex items-center justify-center gap-1.5"
        >
          {t("accessibility.cta")}
          <ExternalLink size={14} strokeWidth={2} />
        </button>

        <div className="text-[11px] text-muted text-center mt-3">
          {t("accessibility.autoDetect")}
        </div>
      </div>
    </div>
  );
}
