import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store";

interface Settings {
  feishu_app_id: string;
  feishu_app_secret: string;
  confirm_before_inject: boolean;
}

export default function ConfigWindow() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const { connected, confirmBeforeInject, setConnected, setConfirmBeforeInject, addLog } =
    useAppStore();

  // Load saved settings on mount
  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      setAppId(s.feishu_app_id);
      setAppSecret(s.feishu_app_secret);
      setConfirmBeforeInject(s.confirm_before_inject);
    });
  }, []);

  // Listen for connection status from Rust
  useEffect(() => {
    const unlisten = listen<{ connected: boolean }>("feishu://status", (e) => {
      setConnected(e.payload.connected);
      addLog({
        kind: "connect",
        text: e.payload.connected ? "飞书长连接已建立" : "飞书连接断开",
      });
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Listen for inject results
  useEffect(() => {
    const unlisten = listen<{ success: boolean; reason?: string }>(
      "feishu://inject-result",
      (e) => {
        addLog({
          kind: "inject",
          text: e.payload.success
            ? "注入成功"
            : `注入失败: ${e.payload.reason ?? "未知原因"}`,
        });
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Listen for incoming messages (for log only)
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
    setTesting(true);
    try {
      await invoke("start_feishu", { appId: appId.trim(), appSecret: appSecret.trim() });
      addLog({ kind: "connect", text: "正在连接飞书..." });
    } catch (e) {
      addLog({ kind: "error", text: `连接失败: ${e}` });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    await invoke("save_settings", {
      settings: {
        feishu_app_id: appId.trim(),
        feishu_app_secret: appSecret.trim(),
        confirm_before_inject: confirmBeforeInject,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveAndHide() {
    await handleSave();
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().hide();
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 p-5 select-none">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl font-semibold text-gray-800">TypeBridge</span>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">App ID</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
            placeholder="cli_xxxxxxxxxxxxxxxx"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">App Secret</label>
          <input
            type="password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
            placeholder="••••••••••••••••"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>

        <button
          onClick={handleConnect}
          disabled={testing || !appId.trim() || !appSecret.trim()}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {testing ? "连接中..." : "测试连接"}
        </button>

        <div className="flex items-center gap-2 py-1">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <span className="text-sm text-gray-600">
            {connected ? "已连接" : "未连接"}
          </span>
        </div>

        <hr className="border-gray-200" />

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">注入前确认</span>
          <button
            onClick={() => {
              const next = !confirmBeforeInject;
              setConfirmBeforeInject(next);
              invoke("save_settings", {
                settings: {
                  feishu_app_id: appId.trim(),
                  feishu_app_secret: appSecret.trim(),
                  confirm_before_inject: next,
                },
              });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              confirmBeforeInject ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                confirmBeforeInject ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <button
        onClick={handleSaveAndHide}
        className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors mt-3"
      >
        {saved ? "已保存 ✓" : "保存并最小化到托盘"}
      </button>
    </div>
  );
}
