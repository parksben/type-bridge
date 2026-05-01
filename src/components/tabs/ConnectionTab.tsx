import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  Play,
  Radar,
  RotateCw,
} from "lucide-react";
import { useAppStore, DEFAULT_SUBMIT_KEY, type SubmitKey } from "../../store";
import KeyBindInput from "../KeyBindInput";
import AccessibilityBanner from "../AccessibilityBanner";

interface Settings {
  feishu_app_id: string;
  feishu_app_secret: string;
  confirm_before_inject: boolean;
  auto_submit: boolean;
  submit_key: SubmitKey;
}

interface SelftestResult {
  ok: boolean;
  reason: string;
}

type ConnState = "idle" | "connecting" | "connected";

interface FieldErrors {
  appId?: string;
  appSecret?: string;
}

// 把 Go/飞书的失败 reason 翻译为更友好的诊断建议
function diagnoseSelftest(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("invalid app_id") || r.includes("99991663")) {
    return "App ID 无效，请确认是否填写了正确的自建应用 App ID（cli_ 开头）。";
  }
  if (r.includes("invalid app_secret") || r.includes("app_secret") && r.includes("error")) {
    return "App Secret 不匹配，请到飞书开发者后台重新复制。";
  }
  if (r.includes("permission") || r.includes("scope") || r.includes("access denied")) {
    return "应用权限不足，请到开发者后台「权限管理」中勾选 im:chat 权限，并发布新版本。";
  }
  if (r.includes("网络请求失败") || r.includes("timeout") || r.includes("no such host")) {
    return "网络不通，请检查本机网络、代理，或稍后重试。";
  }
  return "请确认已在开发者后台「事件订阅」中完成长连接验证，再重试自检。";
}

export default function ConnectionTab() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [starting, setStarting] = useState(false);
  const [selftesting, setSelftesting] = useState(false);
  const [selftestResult, setSelftestResult] = useState<SelftestResult | null>(null);

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

  const connState: ConnState = connected ? "connected" : starting ? "connecting" : "idle";

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

  useEffect(() => {
    if (connected) setStarting(false);
  }, [connected]);

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    const id = appId.trim();
    const secret = appSecret.trim();
    if (!id) errs.appId = "App ID 不能为空";
    else if (!id.startsWith("cli_")) errs.appId = "App ID 应以 cli_ 开头";
    if (!secret) errs.appSecret = "App Secret 不能为空";
    return errs;
  }

  async function handleStart() {
    const errs = validate();
    setFieldErrors(errs);
    setSelftestResult(null); // 重新启动时清掉旧的自检结果
    if (Object.keys(errs).length > 0) return;

    setStarting(true);
    try {
      await invoke("start_feishu", {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      addLog({ kind: "connect", text: "正在启动长连接..." });
    } catch (e) {
      setStarting(false);
      addLog({ kind: "error", text: `启动失败: ${e}` });
    }
  }

  async function handleSelftest() {
    setSelftesting(true);
    setSelftestResult(null);
    try {
      const res = await invoke<SelftestResult>("run_selftest");
      setSelftestResult(res);
      addLog({
        kind: res.ok ? "connect" : "error",
        text: res.ok ? "自检通过：双向通信正常" : `自检失败：${res.reason}`,
      });
    } catch (e) {
      setSelftestResult({ ok: false, reason: String(e) });
      addLog({ kind: "error", text: `自检异常：${e}` });
    } finally {
      setSelftesting(false);
    }
  }

  async function openFeishuDevPortal() {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl("https://open.feishu.cn/app").catch(() => {});
  }

  // 校验错误清空时机：输入变化时清除对应错误
  const appIdError = fieldErrors.appId;
  const appSecretError = fieldErrors.appSecret;
  useEffect(() => {
    if (appIdError) setFieldErrors((e) => ({ ...e, appId: undefined }));
  }, [appId]);
  useEffect(() => {
    if (appSecretError) setFieldErrors((e) => ({ ...e, appSecret: undefined }));
  }, [appSecret]);

  const canStart = !starting && appId.trim().length > 0 && appSecret.trim().length > 0;
  const canSelftest = connected && !selftesting;
  const diagnose = useMemo(
    () => (selftestResult && !selftestResult.ok ? diagnoseSelftest(selftestResult.reason) : ""),
    [selftestResult]
  );

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <AccessibilityBanner />

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
            style={appIdError ? { borderColor: "var(--error)" } : undefined}
          />
          {appIdError && (
            <span className="text-[11px] text-error flex items-center gap-1 mt-0.5">
              <AlertCircle size={11} strokeWidth={2} />
              {appIdError}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Lock size={12} strokeWidth={1.75} />
            App Secret
          </label>
          <input
            type="password"
            className="tb-input"
            placeholder="请输入 App Secret"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={appSecretError ? { borderColor: "var(--error)" } : undefined}
          />
          {appSecretError && (
            <span className="text-[11px] text-error flex items-center gap-1 mt-0.5">
              <AlertCircle size={11} strokeWidth={2} />
              {appSecretError}
            </span>
          )}
        </div>

        {/* 两个按钮 */}
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="tb-btn-primary flex-1 flex items-center justify-center gap-1.5"
          >
            {starting ? (
              <>
                <RotateCw size={14} strokeWidth={1.75} className="animate-spin" />
                启动中
              </>
            ) : (
              <>
                <Play size={14} strokeWidth={1.75} />
                {connected ? "重启长连接" : "启动长连接"}
              </>
            )}
          </button>
          <button
            onClick={handleSelftest}
            disabled={!canSelftest}
            className="flex-1 flex items-center justify-center gap-1.5 text-[13px] rounded-lg py-[10px] transition-colors"
            style={{
              background: canSelftest ? "var(--surface-2)" : "var(--surface-2)",
              border: `1px solid ${canSelftest ? "var(--border-strong)" : "var(--border)"}`,
              color: canSelftest ? "var(--text)" : "var(--subtle)",
              cursor: canSelftest ? "pointer" : "not-allowed",
            }}
            title={connected ? "向飞书发一次 ping 请求以验证凭据和网络" : "请先启动长连接"}
          >
            {selftesting ? (
              <>
                <RotateCw size={13} strokeWidth={1.75} className="animate-spin" />
                测试中
              </>
            ) : (
              <>
                <Radar size={13} strokeWidth={1.75} />
                测试连接
              </>
            )}
          </button>
        </div>

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
            {connState === "connected" ? "已连接" : connState === "connecting" ? "启动中" : "未连接"}
          </span>
        </div>

        {/* 启动成功后：引导去后台验证 */}
        {connected && !selftestResult && (
          <div
            className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <AlertCircle size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
            <div className="flex-1">
              长连接已启动。请前往{" "}
              <button
                onClick={openFeishuDevPortal}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                飞书开发者后台
                <ExternalLink size={10} strokeWidth={2} />
              </button>{" "}
              的「事件订阅」里完成长连接验证，再点「测试连接」验证双向通信。
            </div>
          </div>
        )}

        {/* 自检结果 */}
        {selftestResult && (
          <div
            className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
            style={{
              background: selftestResult.ok ? "var(--success-soft)" : "var(--accent-soft)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            {selftestResult.ok ? (
              <CheckCircle2 size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-success" />
            ) : (
              <AlertCircle size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-error" />
            )}
            <div className="flex-1">
              {selftestResult.ok ? (
                <span>双向通信正常，可以开始使用。</span>
              ) : (
                <>
                  <div className="text-error font-medium mb-1">自检失败</div>
                  <div className="text-muted text-[11.5px] mb-1 font-mono break-all">
                    {selftestResult.reason}
                  </div>
                  <div className="text-text">{diagnose}</div>
                </>
              )}
            </div>
          </div>
        )}

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
