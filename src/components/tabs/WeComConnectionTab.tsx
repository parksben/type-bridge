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
import { useAppStore, type Settings } from "../../store";
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
  const [selftesting, setSelftesting] = useState(false);
  const [selftestResult, setSelftestResult] = useState<SelftestResult | null>(null);

  const { channelConnected, addLog } = useAppStore();
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

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!botId.trim()) errs.botId = "Bot ID 不能为空";
    if (!secret.trim()) errs.secret = "Secret 不能为空";
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
      addLog({ kind: "connect", channel: "wecom", text: "正在启动长连接..." });
    } catch (e) {
      setStarting(false);
      addLog({ kind: "error", channel: "wecom", text: `启动失败: ${e}` });
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
          ? "连接测试通过：WSS 订阅已完成"
          : `连接测试失败：${res.credentials_reason}`,
      });
    } catch (e) {
      setSelftestResult({
        credentials_ok: false,
        credentials_reason: String(e),
        probes: [],
      });
      addLog({ kind: "error", channel: "wecom", text: `连接测试异常：${e}` });
    } finally {
      setSelftesting(false);
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
  useEffect(() => {
    if (botIdError) setFieldErrors((e) => ({ ...e, botId: undefined }));
  }, [botId]);
  useEffect(() => {
    if (secretError) setFieldErrors((e) => ({ ...e, secret: undefined }));
  }, [secret]);

  const canStart = !starting && botId.trim().length > 0 && secret.trim().length > 0;
  const canSelftest = connected && !selftesting;

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
                <span className="font-medium">企微机器人已就绪。</span>
                打开企业微信 App 找到你配置的机器人，发消息即自动注入到桌面当前焦点输入框。
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
                TypeBridge 不接收语音消息。想用语音输入，请使用
                <span className="text-text">企业微信</span>
                的「语音转文字」功能或手机输入法的「语音输入」功能。
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
              还没有企微机器人？先到{" "}
              <button
                onClick={openWeComAdmin}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                企微机器人管理后台
                <ExternalLink size={10} strokeWidth={2} />
              </button>{" "}
              创建智能机器人，开启「API 模式」→「长连接」，复制 Bot ID / Secret 到下方。
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
          <span>同一个企微机器人同时只能一台设备使用，多设备登录会互相挤掉。</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <KeyRound size={12} strokeWidth={1.75} />
            Bot ID
          </label>
          <input
            className="tb-input"
            placeholder="ww_xxxxxxxxxxxxxxxxxx"
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
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
          <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Lock size={12} strokeWidth={1.75} />
            Secret
          </label>
          <input
            type="password"
            className="tb-input"
            placeholder="请输入长连接专用 Secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
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
            title={connected ? "验证 WSS 订阅是否已就绪" : "请先启动长连接"}
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
              长连接已启动。若没收到消息，去{" "}
              <button
                onClick={openWeComAdmin}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                企微机器人管理后台
                <ExternalLink size={10} strokeWidth={2} />
              </button>{" "}
              确认智能机器人的「API 模式」已选「长连接」；或点「测试连接」验证凭据可用。
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
