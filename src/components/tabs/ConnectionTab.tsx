import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  Play,
  Radar,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { useAppStore, DEFAULT_SUBMIT_KEY, type Settings } from "../../store";
import { useI18n } from "../../i18n";
import SelftestChecklist, { type SelftestResult } from "../SelftestChecklist";

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
    channelConnected,
    setAutoSubmit,
    setSubmitKey,
    addLog,
  } = useAppStore();
  const { t } = useI18n();

  const connected = channelConnected.feishu === true;
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
          ...current,
          feishu_app_id: appId.trim(),
          feishu_app_secret: appSecret.trim(),
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
    if (!id) errs.appId = t("feishu.appIdEmpty");
    else if (!id.startsWith("cli_")) errs.appId = t("feishu.appIdPrefix");
    if (!secret) errs.appSecret = t("feishu.appSecretEmpty");
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
      addLog({ kind: "connect", channel: "feishu", text: t("feishu.starting") });
    } catch (e) {
      setStarting(false);
      addLog({ kind: "error", channel: "feishu", text: t("feishu.startFailed", { error: String(e) }) });
    }
  }

  async function handleSelftest() {
    setSelftesting(true);
    setSelftestResult(null);
    try {
      const res = await invoke<SelftestResult>("run_selftest", { channel: "feishu" });
      setSelftestResult(res);
      const allOk = res.credentials_ok && res.probes.every((p) => p.ok);
      const failedCount = res.credentials_ok
        ? res.probes.filter((p) => !p.ok).length
        : -1;
      addLog({
        kind: allOk ? "connect" : "error",
        channel: "feishu",
        text: allOk
          ? t("feishu.selftestPassed")
          : res.credentials_ok
          ? t("feishu.selftestPartial", { count: failedCount })
          : t("feishu.selftestFailed", { reason: res.credentials_reason ?? "" }),
      });
    } catch (e) {
      // invoke 本身抛异常（sidecar 未启动 / 超时等）→ 造一个凭据错误型结果展示
      setSelftestResult({
        credentials_ok: false,
        credentials_reason: String(e),
        probes: [],
      });
      addLog({ kind: "error", channel: "feishu", text: t("feishu.selftestException", { error: String(e) }) });
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
        {/* 顶部 banner：未连接时引导去后台拿凭据；已连接时提示用户去飞书 App 里
            找到机器人发消息，并提前告知 TypeBridge 不接收语音，给出语音输入替代路径 */}
        {connected ? (
          <div
            className="flex flex-col gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2
                size={13}
                strokeWidth={1.75}
                className="shrink-0 mt-0.5 text-accent"
              />
              <div className="flex-1 text-text">
                <span className="font-medium">{t("feishu.bannerConnectedTitle")}</span>
                {t("feishu.bannerConnectedBody")}
              </div>
            </div>
            <div
              className="flex items-start gap-2 pt-2 text-[11.5px]"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Sparkles
                size={12}
                strokeWidth={1.75}
                className="shrink-0 mt-0.5 text-accent"
              />
              <div className="flex-1 text-muted">
                {t("feishu.voiceHintPrefix")}
                <span className="text-text">{t("feishu.voiceHintApp")}</span>
                {t("feishu.voiceHintSuffix")}
              </div>
            </div>
          </div>
        ) : (
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
              {t("feishu.bannerIdleBefore")}
              <button
                onClick={openFeishuDevPortal}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                {t("feishu.bannerIdlePortal")}
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {t("feishu.bannerIdleAfter")}
            </div>
          </div>
        )}

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
            placeholder={t("feishu.appSecretPlaceholder")}
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
                {t("conn.starting")}
              </>
            ) : (
              <>
                <Play size={14} strokeWidth={1.75} />
                {connected ? t("conn.restart") : t("conn.start")}
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
            title={connected ? t("feishu.selftestTooltip") : t("conn.testTooltipDisabled")}
          >
            {selftesting ? (
              <>
                <RotateCw size={13} strokeWidth={1.75} className="animate-spin" />
                {t("conn.testing")}
              </>
            ) : (
              <>
                <Radar size={13} strokeWidth={1.75} />
                {t("conn.test")}
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
            {connState === "connected" ? t("conn.statusConnected") : connState === "connecting" ? t("conn.statusConnecting") : t("conn.statusIdle")}
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
              {t("feishu.afterStartBefore")}
              <button
                onClick={openFeishuDevPortal}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                {t("feishu.afterStartPortal")}
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {t("feishu.afterStartAfter")}
            </div>
          </div>
        )}

        {/* 自检结果 */}
        {selftestResult && (
          <SelftestChecklist
            result={selftestResult}
            channel="feishu"
            appIdOrEquivalent={appId.trim()}
            onOpenUrl={openUrlFromChecklist}
          />
        )}
      </div>
    </div>
  );
}
