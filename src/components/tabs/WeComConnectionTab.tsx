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

type ConnState = "idle" | "connecting" | "connected";

interface FieldErrors {
  botId?: string;
  secret?: string;
}

export default function WeComConnectionTab() {
  const [botId, setBotId] = useState("");
  const [secret, setSecret] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [selftesting, setSelftesting] = useState(false);
  const [selftestResult, setSelftestResult] = useState<SelftestResult | null>(null);
  const botIdInputId = useId();
  const secretInputId = useId();

  const { channelConnected, addLog } = useAppStore();
  const { t } = useI18n();
  const connected = channelConnected.wecom === true;
  const connState: ConnState = connected ? "connected" : starting ? "connecting" : "idle";

  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      setBotId(s.wecom_bot_id);
      setSecret(s.wecom_secret);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(async () => {
      const current = await invoke<Settings>("get_settings").catch(() => null);
      if (!current) return;
      await invoke("save_settings", {
        settings: {
          ...current,
          wecom_bot_id: botId.trim(),
          wecom_secret: secret.trim(),
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [botId, secret, hydrated]);

  useEffect(() => {
    if (connected) setStarting(false);
  }, [connected]);

  useEffect(() => {
    if (!connected) setStopping(false);
  }, [connected]);

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!botId.trim()) errs.botId = t("wecom.botIdEmpty");
    if (!secret.trim()) errs.secret = t("wecom.secretEmpty");
    return errs;
  }

  async function handleStart() {
    const errs = validate();
    setFieldErrors(errs);
    setSelftestResult(null);
    if (Object.keys(errs).length > 0) return;

    setStarting(true);
    try {
      await invoke("start_wecom", {
        botId: botId.trim(),
        secret: secret.trim(),
      });
      addLog({ kind: "connect", channel: "wecom", text: t("wecom.starting") });
    } catch (e) {
      setStarting(false);
      addLog({ kind: "error", channel: "wecom", text: t("wecom.startFailed", { error: String(e) }) });
    }
  }

  async function handleSelftest() {
    setSelftesting(true);
    setSelftestResult(null);
    try {
      const res = await invoke<SelftestResult>("run_selftest", { channel: "wecom" });
      setSelftestResult(res);
      addLog({
        kind: res.credentials_ok ? "connect" : "error",
        channel: "wecom",
        text: res.credentials_ok
          ? t("wecom.selftestPassed")
          : t("wecom.selftestFailed", { reason: res.credentials_reason ?? "" }),
      });
    } catch (e) {
      setSelftestResult({
        credentials_ok: false,
        credentials_reason: String(e),
        probes: [],
      });
      addLog({ kind: "error", channel: "wecom", text: t("wecom.selftestException", { error: String(e) }) });
    } finally {
      setSelftesting(false);
    }
  }

  async function handleDisconnect() {
    if (!connected || stopping) return;
    const label = t("channel.wecom");
    if (!window.confirm(t("conn.disconnectConfirm", { label }))) return;

    setStopping(true);
    try {
      await invoke("stop_channel", { channel: "wecom" });
      addLog({ kind: "connect", channel: "wecom", text: t("conn.disconnected") });
    } catch (e) {
      addLog({ kind: "error", channel: "wecom", text: t("conn.disconnectFailed", { error: String(e) }) });
      setStopping(false);
    }
  }

  async function openWeComAdmin() {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl("https://work.weixin.qq.com/wework_admin/frame#/aiHelper/list?tab=manage").catch(() => {});
  }

  async function openUrlFromChecklist(url: string) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url).catch(() => {});
  }

  const botIdError = fieldErrors.botId;
  const secretError = fieldErrors.secret;

  const canStart = !starting && !stopping && botId.trim().length > 0 && secret.trim().length > 0;
  const canSelftest = connected && !selftesting;
  const canDisconnect = connected && !stopping && !starting;

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {/* 顶部 banner：未连接时引导去后台拿凭据；已连接时提示用户去企微 App 里
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
                <span className="font-medium">{t("wecom.bannerConnectedTitle")}</span>
                {t("wecom.bannerConnectedBody")}
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
                {t("wecom.voiceHintPrefix")}
                <span className="text-text">{t("wecom.voiceHintApp")}</span>
                {t("wecom.voiceHintSuffix")}
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
            <Info size={13} strokeWidth={1.75} className="shrink-0 mt-0.5 text-accent" />
            <div className="flex-1 text-text">
              {t("wecom.bannerIdleBefore")}
              <button
                type="button"
                onClick={openWeComAdmin}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                {t("wecom.bannerIdlePortal")}
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {t("wecom.bannerIdleAfter")}
            </div>
          </div>
        )}

        {/* 单连接互斥提示 */}
        <div
          className="flex items-start gap-2 rounded-md px-3 py-2 text-[11.5px] leading-relaxed"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--muted)",
          }}
        >
          <AlertCircle size={12} strokeWidth={1.75} className="shrink-0 mt-0.5" />
          <span>{t("wecom.singleConnHint")}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={botIdInputId} className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <KeyRound size={12} strokeWidth={1.75} />
            Bot ID
          </label>
          <input
            id={botIdInputId}
            className="tb-input"
            placeholder="ww_xxxxxxxxxxxxxxxxxx"
            value={botId}
            onChange={(e) => {
              setBotId(e.target.value);
              if (fieldErrors.botId) {
                setFieldErrors((prev) => ({ ...prev, botId: undefined }));
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={botIdError ? { borderColor: "var(--error)" } : undefined}
          />
          {botIdError && (
            <span className="text-[11px] text-error flex items-center gap-1 mt-0.5">
              <AlertCircle size={11} strokeWidth={2} />
              {botIdError}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={secretInputId} className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Lock size={12} strokeWidth={1.75} />
            Secret
          </label>
          <input
            id={secretInputId}
            type="password"
            className="tb-input"
            placeholder={t("wecom.secretPlaceholder")}
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              if (fieldErrors.secret) {
                setFieldErrors((prev) => ({ ...prev, secret: undefined }));
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={secretError ? { borderColor: "var(--error)" } : undefined}
          />
          {secretError && (
            <span className="text-[11px] text-error flex items-center gap-1 mt-0.5">
              <AlertCircle size={11} strokeWidth={2} />
              {secretError}
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
              className="tb-btn-danger-outline min-w-[132px] flex items-center justify-center gap-1.5"
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
              title={connected ? t("wecom.selftestTooltip") : t("conn.testTooltipDisabled")}
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

        {/* 启动成功后：引导去管理后台 */}
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
              {t("wecom.afterStartBefore")}
              <button
                type="button"
                onClick={openWeComAdmin}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                {t("wecom.afterStartPortal")}
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {t("wecom.afterStartAfter")}
            </div>
          </div>
        )}

        {/* 自检结果 */}
        {selftestResult && (
          <SelftestChecklist
            result={selftestResult}
            channel="wecom"
            appIdOrEquivalent={botId.trim()}
            onOpenUrl={openUrlFromChecklist}
          />
        )}
      </div>
    </div>
  );
}
