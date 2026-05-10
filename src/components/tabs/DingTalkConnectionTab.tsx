import { useEffect, useId, useState } from "react";
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
  Unplug,
} from "lucide-react";
import { useAppStore, type Settings } from "../../store";
import { useI18n } from "../../i18n";
import SelftestChecklist, { type SelftestResult } from "../SelftestChecklist";
import ConfirmDialog from "../ConfirmDialog";

type ConnState = "idle" | "connecting" | "connected";

interface FieldErrors {
  clientId?: string;
  clientSecret?: string;
}

export default function DingTalkConnectionTab() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [selftesting, setSelftesting] = useState(false);
  const [selftestResult, setSelftestResult] = useState<SelftestResult | null>(null);
  const clientIdInputId = useId();
  const clientSecretInputId = useId();

  const { channelConnected, addLog } = useAppStore();
  const { t } = useI18n();
  const connected = channelConnected.dingtalk === true;
  const connState: ConnState = connected ? "connected" : starting ? "connecting" : "idle";

  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      setClientId(s.dingtalk_client_id);
      setClientSecret(s.dingtalk_client_secret);
      setHydrated(true);
    });
  }, []);

  // 去抖持久化——读全量 settings 再 merge 回写，避免清空其他字段
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(async () => {
      const current = await invoke<Settings>("get_settings").catch(() => null);
      if (!current) return;
      await invoke("save_settings", {
        settings: {
          ...current,
          dingtalk_client_id: clientId.trim(),
          dingtalk_client_secret: clientSecret.trim(),
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [clientId, clientSecret, hydrated]);

  useEffect(() => {
    if (connected) setStarting(false);
  }, [connected]);

  useEffect(() => {
    if (!connected) setStopping(false);
  }, [connected]);

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!clientId.trim()) errs.clientId = t("dingtalk.clientIdEmpty");
    if (!clientSecret.trim()) errs.clientSecret = t("dingtalk.clientSecretEmpty");
    return errs;
  }

  async function handleStart() {
    const errs = validate();
    setFieldErrors(errs);
    setSelftestResult(null);
    if (Object.keys(errs).length > 0) return;

    setStarting(true);
    try {
      await invoke("start_dingtalk", {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      addLog({ kind: "connect", channel: "dingtalk", text: t("dingtalk.starting") });
    } catch (e) {
      setStarting(false);
      addLog({ kind: "error", channel: "dingtalk", text: t("dingtalk.startFailed", { error: String(e) }) });
    }
  }

  async function handleSelftest() {
    setSelftesting(true);
    setSelftestResult(null);
    try {
      const res = await invoke<SelftestResult>("run_selftest", { channel: "dingtalk" });
      setSelftestResult(res);
      addLog({
        kind: res.credentials_ok ? "connect" : "error",
        channel: "dingtalk",
        text: res.credentials_ok
          ? t("dingtalk.selftestPassed")
          : t("dingtalk.selftestFailed", { reason: res.credentials_reason ?? "" }),
      });
    } catch (e) {
      setSelftestResult({
        credentials_ok: false,
        credentials_reason: String(e),
        probes: [],
      });
      addLog({ kind: "error", channel: "dingtalk", text: t("dingtalk.selftestException", { error: String(e) }) });
    } finally {
      setSelftesting(false);
    }
  }

  function handleDisconnect() {
    if (!connected || stopping) return;
    setShowDisconnectConfirm(true);
  }

  async function doDisconnect() {
    setShowDisconnectConfirm(false);
    setStopping(true);
    try {
      await invoke("stop_channel", { channel: "dingtalk" });
      addLog({ kind: "connect", channel: "dingtalk", text: t("conn.disconnected") });
    } catch (e) {
      addLog({ kind: "error", channel: "dingtalk", text: t("conn.disconnectFailed", { error: String(e) }) });
      setStopping(false);
    }
  }

  async function openDingTalkDevPortal() {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl("https://open-dev.dingtalk.com/fe/app?hash=%23%2Fcorp%2Fapp#/corp/app").catch(() => {});
  }

  async function openUrlFromChecklist(url: string) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url).catch(() => {});
  }

  const clientIdError = fieldErrors.clientId;
  const clientSecretError = fieldErrors.clientSecret;

  const canStart = !starting && !stopping && clientId.trim().length > 0 && clientSecret.trim().length > 0;
  const canSelftest = connected && !selftesting;
  const canDisconnect = connected && !stopping && !starting;

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {/* 顶部 banner：未连接时引导去后台拿凭据；已连接时提示用户去钉钉 App 里
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
                <span className="font-medium">{t("dingtalk.bannerConnectedTitle")}</span>
                {t("dingtalk.bannerConnectedBody")}
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
                {t("dingtalk.voiceHintPrefix")}
                <span className="text-text">{t("dingtalk.voiceHintApp")}</span>
                {t("dingtalk.voiceHintSuffix")}
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
              {t("dingtalk.bannerIdleBefore")}
              <button
                type="button"
                onClick={openDingTalkDevPortal}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                {t("dingtalk.bannerIdlePortal")}
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {t("dingtalk.bannerIdleAfter")}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={clientIdInputId} className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <KeyRound size={12} strokeWidth={1.75} />
            Client ID
          </label>
          <input
            id={clientIdInputId}
            className="tb-input"
            placeholder="dingxxxxxxxxxxxxxxxx"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              if (fieldErrors.clientId) {
                setFieldErrors((prev) => ({ ...prev, clientId: undefined }));
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={clientIdError ? { borderColor: "var(--error)" } : undefined}
          />
          {clientIdError && (
            <span className="text-[11px] text-error flex items-center gap-1 mt-0.5">
              <AlertCircle size={11} strokeWidth={2} />
              {clientIdError}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={clientSecretInputId} className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Lock size={12} strokeWidth={1.75} />
            Client Secret
          </label>
          <input
            id={clientSecretInputId}
            type="password"
            className="tb-input"
            placeholder={t("dingtalk.clientSecretPlaceholder")}
            value={clientSecret}
            onChange={(e) => {
              setClientSecret(e.target.value);
              if (fieldErrors.clientSecret) {
                setFieldErrors((prev) => ({ ...prev, clientSecret: undefined }));
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={clientSecretError ? { borderColor: "var(--error)" } : undefined}
          />
          {clientSecretError && (
            <span className="text-[11px] text-error flex items-center gap-1 mt-0.5">
              <AlertCircle size={11} strokeWidth={2} />
              {clientSecretError}
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStart}
            className="tb-btn-primary flex items-center justify-center gap-1.5"
            style={{ flex: connected ? "1 1 0%" : "1" }}
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
          {connected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={!canDisconnect}
              className="tb-btn-danger-outline flex items-center justify-center gap-1.5"
              style={{ flex: "1 1 0%" }}
              title={t("conn.disconnect")}
            >
              {stopping ? (
                <>
                  <RotateCw size={13} strokeWidth={1.75} className="animate-spin" />
                  {t("conn.disconnect")}
                </>
              ) : (
                <>
                  <Unplug size={13} strokeWidth={1.75} />
                  {t("conn.disconnect")}
                </>
              )}
            </button>
          )}
        </div>

        {/* 连接状态 */}
        <div className="flex items-center justify-between gap-2.5 px-0.5 py-1">
          <div className="flex items-center gap-2.5">
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
          {connected && (
            <button
              type="button"
              onClick={handleSelftest}
              disabled={!canSelftest}
              className="tb-btn-status-action"
              title={connected ? t("dingtalk.selftestTooltip") : t("conn.testTooltipDisabled")}
            >
              {selftesting ? (
                <>
                  <RotateCw size={12} strokeWidth={1.75} className="animate-spin" />
                  {t("conn.testing")}
                </>
              ) : (
                <>
                  <Radar size={12} strokeWidth={1.75} />
                  {t("conn.test")}
                </>
              )}
            </button>
          )}
        </div>

        {/* 启动成功后：引导去后台 */}
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
              {t("dingtalk.afterStartBefore")}
              <button
                type="button"
                onClick={openDingTalkDevPortal}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                {t("dingtalk.afterStartPortal")}
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {t("dingtalk.afterStartAfter")}
            </div>
          </div>
        )}

        {/* 自检结果 */}
        {selftestResult && (
          <SelftestChecklist
            result={selftestResult}
            channel="dingtalk"
            appIdOrEquivalent={clientId.trim()}
            onOpenUrl={openUrlFromChecklist}
          />
        )}
      </div>
      <ConfirmDialog
        open={showDisconnectConfirm}
        title={t("conn.disconnect")}
        body={t("conn.disconnectConfirm", { label: t("channel.dingtalk") })}
        dangerous
        confirmLabel={t("conn.disconnect")}
        onConfirm={doDisconnect}
        onCancel={() => setShowDisconnectConfirm(false)}
      />
    </div>
  );
}
