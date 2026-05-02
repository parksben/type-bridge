import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  Play,
  Radar,
  RotateCw,
} from "lucide-react";
import { useAppStore, DEFAULT_SUBMIT_KEY, type SubmitKey } from "../../store";
import SelftestChecklist, { type SelftestResult } from "../SelftestChecklist";


interface Settings {
  feishu_app_id: string;
  feishu_app_secret: string;
  auto_submit: boolean;
  submit_key: SubmitKey;
}

type ConnState = "idle" | "connecting" | "connected";

interface FieldErrors {
  appId?: string;
  appSecret?: string;
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
    setAutoSubmit,
    setSubmitKey,
    addLog,
  } = useAppStore();

  const connState: ConnState = connected ? "connected" : starting ? "connecting" : "idle";

  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      setAppId(s.feishu_app_id);
      setAppSecret(s.feishu_app_secret);
      // 顺带 hydrate 输入设置到 Zustand，让 InputSettingsTab 首次打开就有值
      setAutoSubmit(s.auto_submit);
      setSubmitKey(s.submit_key ?? DEFAULT_SUBMIT_KEY);
      setHydrated(true);
    });
  }, []);

  // 凭据变更时去抖持久化（500ms）——读当前全量 settings 再合并回写，
  // 避免清空 InputSettingsTab 拥有的 auto_submit / submit_key 字段
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(async () => {
      const current = await invoke<Settings>("get_settings").catch(() => null);
      if (!current) return;
      await invoke("save_settings", {
        settings: {
          feishu_app_id: appId.trim(),
          feishu_app_secret: appSecret.trim(),
          auto_submit: current.auto_submit,
          submit_key: current.submit_key,
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [appId, appSecret, hydrated]);

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
      const allOk = res.credentials_ok && res.probes.every((p) => p.ok);
      const failedCount = res.credentials_ok
        ? res.probes.filter((p) => !p.ok).length
        : -1;
      addLog({
        kind: allOk ? "connect" : "error",
        text: allOk
          ? "连接测试通过：全部 API scope 校验成功"
          : res.credentials_ok
          ? `连接测试：${failedCount} 项 scope 缺失`
          : `连接测试失败：${res.credentials_reason}`,
      });
    } catch (e) {
      // invoke 本身抛异常（sidecar 未启动 / 超时等）→ 造一个凭据错误型结果展示
      setSelftestResult({
        credentials_ok: false,
        credentials_reason: String(e),
        probes: [],
      });
      addLog({ kind: "error", text: `连接测试异常：${e}` });
    } finally {
      setSelftesting(false);
    }
  }

  async function openFeishuDevPortal() {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl("https://open.feishu.cn/app").catch(() => {});
  }

  async function openUrlFromChecklist(url: string) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url).catch(() => {});
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

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {/* 引导 banner：降低首次配置门槛 */}
        <div
          className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <Info
            size={13}
            strokeWidth={1.75}
            className="shrink-0 mt-0.5 text-accent"
          />
          <div className="flex-1 text-text">
            还没有自建应用？先到{" "}
            <button
              onClick={openFeishuDevPortal}
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              飞书开发者后台
              <ExternalLink size={10} strokeWidth={2} />
            </button>{" "}
            创建一个，复制 App ID / Secret 到下方。
          </div>
        </div>

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
          <SelftestChecklist
            result={selftestResult}
            appId={appId.trim()}
            onOpenUrl={openUrlFromChecklist}
          />
        )}
      </div>
    </div>
  );
}
