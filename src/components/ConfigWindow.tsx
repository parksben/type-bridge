import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store";

interface Settings {
  feishu_app_id: string;
  feishu_app_secret: string;
  confirm_before_inject: boolean;
}

type ConnState = "idle" | "connecting" | "connected";

export default function ConfigWindow() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const { connected, confirmBeforeInject, setConnected, setConfirmBeforeInject, addLog } =
    useAppStore();

  const [connecting, setConnecting] = useState(false);
  const connState: ConnState = connected ? "connected" : connecting ? "connecting" : "idle";

  // Load saved settings on mount
  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      setAppId(s.feishu_app_id);
      setAppSecret(s.feishu_app_secret);
      setConfirmBeforeInject(s.confirm_before_inject);
      setHydrated(true);
    });
  }, []);

  // 凭据变更时，去抖持久化（500ms）
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      invoke("save_settings", {
        settings: {
          feishu_app_id: appId.trim(),
          feishu_app_secret: appSecret.trim(),
          confirm_before_inject: confirmBeforeInject,
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [appId, appSecret, confirmBeforeInject, hydrated]);

  // Connection status
  useEffect(() => {
    const unlisten = listen<{ connected: boolean }>("feishu://status", (e) => {
      setConnected(e.payload.connected);
      setConnecting(false);
      addLog({
        kind: "connect",
        text: e.payload.connected ? "飞书长连接已建立" : "飞书连接断开",
      });
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Inject results
  useEffect(() => {
    const unlisten = listen<{ success: boolean; reason?: string }>(
      "feishu://inject-result",
      (e) => {
        addLog({
          kind: "inject",
          text: e.payload.success ? "输入成功" : `输入失败: ${e.payload.reason ?? "未知原因"}`,
        });
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Incoming messages → log
  useEffect(() => {
    const unlisten = listen<{ sender: string; text: string }>(
      "feishu://message",
      (e) => {
        addLog({ kind: "message", text: `@${e.payload.sender}: "${e.payload.text}"` });
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, []);

  async function handleConnect() {
    if (!appId.trim() || !appSecret.trim()) return;
    setConnecting(true);
    try {
      await invoke("start_feishu", { appId: appId.trim(), appSecret: appSecret.trim() });
      addLog({ kind: "connect", text: "正在连接飞书..." });
    } catch (e) {
      setConnecting(false);
      addLog({ kind: "error", text: `连接失败: ${e}` });
    }
  }

  const canConnect = appId.trim().length > 0 && appSecret.trim().length > 0 && !connecting;

  return (
    <div className="relative h-screen w-full flex flex-col px-7 py-6 select-none animate-enter">
      {/* Brand 区 */}
      <header className="relative z-10 mb-7">
        <h1 className="text-[40px] leading-[1.05] tracking-tight text-text">
          <span className="font-display">Type</span>
          <span className="font-display text-accent">Bridge</span>
        </h1>
        <p className="mt-1.5 text-[12px] text-muted font-mono tracking-wide">
          messages → keyboard
        </p>
      </header>

      {/* Form */}
      <div className="relative z-10 flex flex-col gap-4 flex-1">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            App ID
          </label>
          <input
            className="tb-input"
            placeholder="cli_xxxxxxxxxxxxxxxx"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            App Secret
          </label>
          <input
            type="password"
            className="tb-input"
            placeholder="••••••••••••••••••••"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        <button
          onClick={handleConnect}
          disabled={!canConnect}
          className="tb-btn-primary mt-1"
        >
          {connecting ? "连接中…" : connected ? "重新连接" : "测试连接"}
        </button>

        {/* 连接状态 */}
        <div className="flex items-center gap-2.5 px-0.5 py-1">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              connState === "connected"
                ? "dot-connected"
                : connState === "connecting"
                ? "dot-connecting"
                : "dot-idle"
            }`}
          />
          <span className="text-[12.5px] text-muted">
            {connState === "connected" ? "已连接" : connState === "connecting" ? "连接中" : "未连接"}
          </span>
        </div>

        {/* 分隔线 */}
        <div className="h-px bg-border my-1" />

        {/* 输入前确认 toggle */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[13px] text-text">输入前确认</span>
            <span className="text-[11px] text-subtle mt-0.5">
              开启后，每条消息先弹浮层确认
            </span>
          </div>
          <button
            className="tb-toggle"
            data-on={confirmBeforeInject}
            onClick={() => setConfirmBeforeInject(!confirmBeforeInject)}
            aria-label="切换输入前确认"
          />
        </div>
      </div>

      {/* 底部 */}
      <footer className="relative z-10 mt-5 flex items-center justify-between text-[10.5px] text-subtle font-mono">
        <span>v0.1.0</span>
        <span>关闭即最小化到托盘</span>
      </footer>
    </div>
  );
}
