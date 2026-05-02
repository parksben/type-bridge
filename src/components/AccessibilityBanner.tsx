import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, ExternalLink } from "lucide-react";

/// 辅助功能权限状态 banner —— 未授予时展示，授予后自动隐藏。
/// 启动时 Rust 会 emit 一次 typebridge://accessibility {granted}，
/// 此后前端每 3s 主动 check_accessibility 轮询，直到 granted 才停止。
export default function AccessibilityBanner() {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    // 首次立即拉一次（覆盖 emit 晚于 mount 的情况）
    invoke<boolean>("check_accessibility")
      .then(setGranted)
      .catch(() => setGranted(false));

    // 监听 Rust 启动时的一次性广播
    const un = listen<{ granted: boolean }>("typebridge://accessibility", (e) => {
      setGranted(e.payload.granted);
    });

    return () => {
      un.then((f) => f());
    };
  }, []);

  // 未授予时轮询；授予后停止
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
      className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
      style={{
        background: "rgba(251, 146, 60, 0.10)",
        border: "1px solid rgba(251, 146, 60, 0.35)",
        color: "var(--text)",
      }}
    >
      <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
      <div className="flex-1">
        <div className="font-medium mb-0.5">辅助功能权限未授予</div>
        <div className="text-muted text-[11.5px] mb-1.5">
          没有此权限，应用无法模拟 Cmd+V 把消息粘贴到前台应用。授予后应用会自动检测，无需手动刷新。
        </div>
        <button
          onClick={openPrefs}
          className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px]"
        >
          打开系统设置
          <ExternalLink size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
