import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Info } from "lucide-react";
import type { ChannelId } from "../store";
import { t } from "../i18n";
import { localizeRuntime } from "../i18n/runtime";

export interface ProbeResult {
  id: string;
  label: string;
  scope_hint: string;
  ok: boolean;
  code: number;
  msg: string;
  scopes?: string[];
  help_url?: string;
}

export interface SelftestResult {
  credentials_ok: boolean;
  credentials_reason?: string;
  probes: ProbeResult[];
}

interface Props {
  result: SelftestResult;
  /// 渠道。P1 前是 feishu 默认；加进参数以支持钉钉 / 企微
  channel: ChannelId;
  /// 飞书：用 App ID 构造 help_url；钉钉：Client ID；企微：Bot ID
  appIdOrEquivalent: string;
  onOpenUrl: (url: string) => void;
}

/// 连接测试清单卡片：凭据 + N 行 probe（按 channel 差异化）+ 渠道特定的静态引导。
/// 凭据失败时整块标红、不渲染 probe 行。
export default function SelftestChecklist({ result, channel, appIdOrEquivalent, onOpenUrl }: Props) {
  // 按渠道差异化的凭据文案（避免飞书术语泄漏到钉钉 / 企微面板）
  const terms = credentialTerms(channel);

  if (!result.credentials_ok) {
    return (
      <div
        className="flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
        style={{
          background: "var(--error-soft)",
          border: "1px solid var(--error)",
        }}
      >
        <XCircle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5 text-error" />
        <div className="flex-1">
          <div className="text-error font-medium mb-1">{t("selftest.credentialError")}</div>
          <div className="text-muted text-[11.5px] font-mono break-all">
            {localizeRuntime(result.credentials_reason) || t("selftest.unknownError")}
          </div>
          <div className="text-text text-[11.5px] mt-1.5">
            {t("selftest.pleaseCheck", { idLabel: terms.idLabel, host: terms.host })}
          </div>
        </div>
      </div>
    );
  }

  const defaultHelpURL = `https://open.feishu.cn/app/${appIdOrEquivalent}/auth`;
  const allProbesOk = result.probes.every((p) => p.ok);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--surface-2)",
        border: `1px solid ${allProbesOk ? "var(--border)" : "var(--border-strong)"}`,
      }}
    >
      <ChecklistRow
        ok={true}
        label={t("selftest.credentialAvailable")}
        hint={t("selftest.credentialAvailableHint", { idLabel: terms.idLabel, tokenName: terms.tokenName })}
      />

      {result.probes.map((p) => (
        <ChecklistRow
          key={p.id}
          ok={p.ok}
          label={localizedProbeLabel(p)}
          hint={p.scope_hint}
          failureDetail={
            !p.ok ? (
              <div className="mt-1">
                <div className="text-[11.5px] text-muted mb-1.5">
                  {p.scopes && p.scopes.length > 0 ? (
                    <>
                      {t("selftest.missingScope")}
                      <span className="font-mono text-text">{p.scopes.join(" / ")}</span>
                    </>
                  ) : (
                    <span className="font-mono break-all">
                      code={p.code} {p.msg}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onOpenUrl(p.help_url || defaultHelpURL)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                >
                  {t("selftest.openFeishuAuth")}
                  <ExternalLink size={10} strokeWidth={2} />
                </button>
              </div>
            ) : null
          }
        />
      ))}

      <FooterGuide
        channel={channel}
        appIdOrEquivalent={appIdOrEquivalent}
        onOpenUrl={onOpenUrl}
      />
    </div>
  );
}

/// 渠道特定的底部静态引导——API probe 无法覆盖的"平台后台手动操作"。
function FooterGuide({
  channel,
  appIdOrEquivalent,
  onOpenUrl,
}: {
  channel: ChannelId;
  appIdOrEquivalent: string;
  onOpenUrl: (url: string) => void;
}) {
  if (channel === "feishu") {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2.5 text-[11.5px] leading-relaxed"
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <Info size={12} strokeWidth={1.75} className="shrink-0 mt-0.5 text-muted" />
        <div className="flex-1">
          <div className="text-text font-medium">
            {t("selftest.feishuFooterTitle")}
          </div>
          <div className="text-muted text-[11px] mt-0.5">
            {t("selftest.feishuFooterDesc")}
          </div>
          <ol className="mt-1.5 flex flex-col gap-1 text-text">
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">①</span>
              <span>
                <span className="font-medium">{t("selftest.feishuStep1Title")}</span>：{t("selftest.feishuStep1Body")}
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">②</span>
              <span>
                <span className="font-medium">{t("selftest.feishuStep2Title")}</span>：{t("selftest.feishuStep2BodyPrefix")}
                <span className="font-mono">im.message.receive_v1</span>{t("selftest.feishuStep2BodySuffix")}
              </span>
            </li>
          </ol>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() =>
                onOpenUrl(
                  `https://open.feishu.cn/app/${appIdOrEquivalent}/event`
                )
              }
              className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px] font-medium"
            >
              {t("selftest.feishuFooterCta")}
              <ExternalLink size={10} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (channel === "dingtalk") {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2.5 text-[11.5px] leading-relaxed"
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <Info size={12} strokeWidth={1.75} className="shrink-0 mt-0.5 text-muted" />
        <div className="flex-1">
          <div className="text-text font-medium">
            {t("selftest.dingFooterTitle")}
          </div>
          <div className="text-muted text-[11px] mt-0.5">
            {t("selftest.dingFooterDesc")}
          </div>
          <ol className="mt-1.5 flex flex-col gap-1 text-text">
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">①</span>
              <span>
                <span className="font-medium">{t("selftest.dingStep1Title")}</span>：{t("selftest.dingStep1Body")}
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">②</span>
              <span>
                <span className="font-medium">{t("selftest.dingStep2Title")}</span>：{t("selftest.dingStep2Body")}
              </span>
            </li>
          </ol>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => onOpenUrl("https://open-dev.dingtalk.com/fe/app?hash=%23%2Fcorp%2Fapp#/corp/app")}
              className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px] font-medium"
            >
              {t("selftest.dingFooterCta")}
              <ExternalLink size={10} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (channel === "wecom") {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2.5 text-[11.5px] leading-relaxed"
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <Info size={12} strokeWidth={1.75} className="shrink-0 mt-0.5 text-muted" />
        <div className="flex-1">
          <div className="text-text font-medium">
            {t("selftest.wecomFooterTitle")}
          </div>
          <div className="text-muted text-[11px] mt-0.5">
            {t("selftest.wecomFooterDesc")}
          </div>
          <ol className="mt-1.5 flex flex-col gap-1 text-text">
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">①</span>
              <span>
                <span className="font-medium">{t("selftest.wecomStep1Title")}</span>：{t("selftest.wecomStep1Body")}
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">②</span>
              <span>
                <span className="font-medium">{t("selftest.wecomStep2Title")}</span>：{t("selftest.wecomStep2Body")}
              </span>
            </li>
          </ol>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => onOpenUrl("https://work.weixin.qq.com/wework_admin/frame#/aiHelper/list?tab=manage")}
              className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px] font-medium"
            >
              {t("selftest.wecomFooterCta")}
              <ExternalLink size={10} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

interface RowProps {
  ok: boolean;
  label: string;
  hint: string;
  failureDetail?: React.ReactNode;
}

/// Probe 的 label 是 Go sidecar 直接返回的中文字符串。这里按 probe id 做一次本地化映射，
/// 命中就用 dict 里的翻译，未命中（未来新增的 probe id）回落到 sidecar 给的 label，
/// 保证向后兼容。
const KNOWN_PROBE_IDS = new Set(["download_image", "reaction", "reply"]);
function localizedProbeLabel(p: ProbeResult): string {
  if (KNOWN_PROBE_IDS.has(p.id)) {
    return t(`selftest.probeLabel.${p.id}` as any);
  }
  return p.label;
}

/// 凭据文案按渠道走：飞书用 App ID / tenant_access_token，钉钉用 Client ID / access_token，
/// 否则会和表单里的字段名对不上，用户一眼看就觉得假。
function credentialTerms(channel: ChannelId): { idLabel: string; tokenName: string; host: string } {
  switch (channel) {
    case "feishu":
      return {
        idLabel: t("selftest.termsFeishuId"),
        tokenName: "tenant_access_token",
        host: "open.feishu.cn",
      };
    case "dingtalk":
      return {
        idLabel: t("selftest.termsDingId"),
        tokenName: "access_token",
        host: "api.dingtalk.com",
      };
    case "wecom":
      return {
        idLabel: t("selftest.termsWecomId"),
        tokenName: t("selftest.termsWecomToken"),
        host: "openws.work.weixin.qq.com",
      };
    default:
      return {
        idLabel: t("selftest.termsCredFallback"),
        tokenName: t("selftest.termsTokenFallback"),
        host: t("selftest.termsHostFallback"),
      };
  }
}

function ChecklistRow({ ok, label, hint, failureDetail }: RowProps) {
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5"
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      {ok ? (
        <CheckCircle2
          size={13}
          strokeWidth={1.75}
          className="shrink-0 mt-[3px] text-success"
        />
      ) : (
        <AlertCircle
          size={13}
          strokeWidth={1.75}
          className="shrink-0 mt-[3px] text-accent"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-text">{label}</span>
          <span className="text-[10.5px] font-mono text-muted truncate ml-2">
            {hint}
          </span>
        </div>
        {failureDetail}
      </div>
    </div>
  );
}
