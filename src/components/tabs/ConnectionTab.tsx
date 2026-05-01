import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound, Lock, Plug, RotateCw } from "lucide-react";
import { useAppStore, DEFAULT_SUBMIT_KEY, type SubmitKey } from "../../store";
import KeyBindInput from "../KeyBindInput";

interface Settings {
  feishu_app_id: string;
  feishu_app_secret: string;
  confirm_before_inject: boolean;
  auto_submit: boolean;
  submit_key: SubmitKey;
}

type ConnState = "idle" | "connecting" | "connected";

export default function ConnectionTab() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const {
    connected,
    confirmBeforeInject,
    autoSubmit,
    submitKey,
    setConfirmBeforeInject,
    setAutoSubmit,
    setSubmitKey,
    addLog,
  } = useAppStore();

  const [connecting, setConnecting] = useState(false);
  const connState: ConnState = connected ? "connected" : connecting ? "connecting" : "idle";

  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      setAppId(s.feishu_app_id);
      setAppSecret(s.feishu_app_secret);
      setConfirmBeforeInject(s.confirm_before_inject);
      setAutoSubmit(s.auto_submit);
      setSubmitKey(s.submit_key ?? DEFAULT_SUBMIT_KEY);
      setHydrated(true);
    });
  }, []);

  // 所有设置变更时，去抖持久化（500ms）
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      invoke("save_settings", {
        settings: {
          feishu_app_id: appId.trim(),
          feishu_app_secret: appSecret.trim(),
          confirm_before_inject: confirmBeforeInject,
          auto_submit: autoSubmit,
          submit_key: submitKey,
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [appId, appSecret, confirmBeforeInject, autoSubmit, submitKey, hydrated]);

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

  useEffect(() => {
    if (connected) setConnecting(false);
  }, [connected]);

  const canConnect = appId.trim().length > 0 && appSecret.trim().length > 0 && !connecting;

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <header>
          <h2 className="text-[32px] leading-[1.05] tracking-tight text-text">
            <span className="font-display">Type</span>
            <span className="font-display text-accent">Bridge</span>
          </h2>
          <p className="mt-1.5 text-[12px] text-muted font-mono tracking-wide">
            messages to keyboard
          </p>
        </header>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <KeyRound size={12} strokeWidth={1.75} />
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
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Lock size={12} strokeWidth={1.75} />
            App Secret
          </label>
          <input
            type="password"
            className="tb-input"
            placeholder="enter your secret"
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
          className="tb-btn-primary mt-1 flex items-center justify-center gap-1.5"
        >
          {connecting ? (
            <>
              <RotateCw size={14} strokeWidth={1.75} className="animate-spin" />
              连接中
            </>
          ) : (
            <>
              <Plug size={14} strokeWidth={1.75} />
              {connected ? "重新连接" : "测试连接"}
            </>
          )}
        </button>

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

        <div className="h-px bg-border my-1" />

        {/* 输入前确认 */}
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

        {/* 输入后自动提交 */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[13px] text-text">输入后自动提交</span>
            <span className="text-[11px] text-subtle mt-0.5">
              写入完成后模拟按下提交按键
            </span>
          </div>
          <button
            className="tb-toggle"
            data-on={autoSubmit}
            onClick={() => setAutoSubmit(!autoSubmit)}
            aria-label="切换输入后自动提交"
          />
        </div>

        {/* 提交按键 */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[13px] text-text">提交按键</span>
            <span className="text-[11px] text-subtle mt-0.5">
              点击录入，Escape 取消
            </span>
          </div>
          <KeyBindInput
            value={submitKey}
            onChange={setSubmitKey}
            disabled={!autoSubmit}
          />
        </div>
      </div>
    </div>
  );
}
