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
import { useAppStore, type Settings } from "../../store";
import SelftestChecklist, { type SelftestResult } from "../SelftestChecklist";

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
  const [selftesting, setSelftesting] = useState(false);
  const [selftestResult, setSelftestResult] = useState<SelftestResult | null>(null);

  const { channelConnected, addLog } = useAppStore();
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

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!clientId.trim()) errs.clientId = "Client ID 不能为空";
    if (!clientSecret.trim()) errs.clientSecret = "Client Secret 不能为空";
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
      addLog({ kind: "connect", channel: "dingtalk", text: "正在启动长连接..." });
    } catch (e) {
      setStarting(false);
      addLog({ kind: "error", channel: "dingtalk", text: `启动失败: ${e}` });
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
          ? "连接测试通过：凭据已通过 WSS 鉴权"
          : `连接测试失败：${res.credentials_reason}`,
      });
    } catch (e) {
      setSelftestResult({
        credentials_ok: false,
        credentials_reason: String(e),
        probes: [],
      });
      addLog({ kind: "error", channel: "dingtalk", text: `连接测试异常：${e}` });
    } finally {
      setSelftesting(false);
    }
  }

  async function openDingTalkDevPortal() {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl("https://open-dev.dingtalk.com").catch(() => {});
  }

  async function openUrlFromChecklist(url: string) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url).catch(() => {});
  }

  const clientIdError = fieldErrors.clientId;
  const clientSecretError = fieldErrors.clientSecret;
  useEffect(() => {
    if (clientIdError) setFieldErrors((e) => ({ ...e, clientId: undefined }));
  }, [clientId]);
  useEffect(() => {
    if (clientSecretError) setFieldErrors((e) => ({ ...e, clientSecret: undefined }));
  }, [clientSecret]);

  const canStart = !starting && clientId.trim().length > 0 && clientSecret.trim().length > 0;
  const canSelftest = connected && !selftesting;

  return (
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        {/* 引导 banner */}
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
            还没有钉钉应用？先到{" "}
            <button
              onClick={openDingTalkDevPortal}
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              钉钉开发者平台
              <ExternalLink size={10} strokeWidth={2} />
            </button>{" "}
            创建「企业内部应用」，加机器人能力 + 选 Stream 模式后复制 Client ID / Secret 到下方。
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <KeyRound size={12} strokeWidth={1.75} />
            Client ID
          </label>
          <input
            className="tb-input"
            placeholder="dingxxxxxxxxxxxxxxxx"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
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
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Lock size={12} strokeWidth={1.75} />
            Client Secret
          </label>
          <input
            type="password"
            className="tb-input"
            placeholder="请输入 Client Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
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
              background: "var(--surface-2)",
              border: `1px solid ${canSelftest ? "var(--border-strong)" : "var(--border)"}`,
              color: canSelftest ? "var(--text)" : "var(--subtle)",
              cursor: canSelftest ? "pointer" : "not-allowed",
            }}
            title={connected ? "验证 WSS 鉴权通过情况" : "请先启动长连接"}
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
              长连接已启动。若没收到消息，去{" "}
              <button
                onClick={openDingTalkDevPortal}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                钉钉开发者平台
                <ExternalLink size={10} strokeWidth={2} />
              </button>{" "}
              确认「消息接收模式」已选 Stream 模式；或点「测试连接」验证凭据可用。
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
    </div>
  );
}
