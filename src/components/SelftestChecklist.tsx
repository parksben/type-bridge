import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Info } from "lucide-react";
import type { ChannelId } from "../store";

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
          <div className="text-error font-medium mb-1">凭据/网络错误</div>
          <div className="text-muted text-[11.5px] font-mono break-all">
            {result.credentials_reason || "未知错误"}
          </div>
          <div className="text-text text-[11.5px] mt-1.5">
            请检查 {terms.idLabel} 是否正确，或本机网络 / 代理是否能访问 {terms.host}。
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
        label="凭据可用"
        hint={`${terms.idLabel} 能换到 ${terms.tokenName}`}
      />

      {result.probes.map((p) => (
        <ChecklistRow
          key={p.id}
          ok={p.ok}
          label={p.label}
          hint={p.scope_hint}
          failureDetail={
            !p.ok ? (
              <div className="mt-1">
                <div className="text-[11.5px] text-muted mb-1.5">
                  {p.scopes && p.scopes.length > 0 ? (
                    <>
                      缺少 scope：
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
                  去飞书开发者后台授权
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
            接收消息事件 需在飞书后台「事件配置」单独完成
          </div>
          <div className="text-muted text-[11px] mt-0.5">
            API probe 无法自动校验事件订阅状态，请按以下两步对照配置
          </div>
          <ol className="mt-1.5 flex flex-col gap-1 text-text">
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">①</span>
              <span>
                <span className="font-medium">订阅方式</span>：选择"使用长连接接收事件"并完成验证
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">②</span>
              <span>
                <span className="font-medium">添加事件</span>：搜索{" "}
                <span className="font-mono">im.message.receive_v1</span> 并勾选提交
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
              去事件配置页
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
            Stream Mode 需在钉钉开放平台完成两步配置
          </div>
          <div className="text-muted text-[11px] mt-0.5">
            API probe 无法自动校验 Stream Mode 开关，请按以下对照配置
          </div>
          <ol className="mt-1.5 flex flex-col gap-1 text-text">
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">①</span>
              <span>
                <span className="font-medium">机器人能力</span>：在「企业内部应用」中添加
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">②</span>
              <span>
                <span className="font-medium">消息接收模式</span>：选择
                "Stream 模式"
              </span>
            </li>
          </ol>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => onOpenUrl("https://open-dev.dingtalk.com")}
              className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px] font-medium"
            >
              去钉钉开发者平台
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
            长连接模式需在企业微信管理后台开启
          </div>
          <div className="text-muted text-[11px] mt-0.5">
            API probe 只能验证 WSS 握手是否通过，请按以下对照配置
          </div>
          <ol className="mt-1.5 flex flex-col gap-1 text-text">
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">①</span>
              <span>
                <span className="font-medium">API 模式</span>：管理后台 → 智能机器人 → 开启
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span className="text-accent font-mono text-[10.5px]">②</span>
              <span>
                <span className="font-medium">模式选择</span>：选择"长连接"（非"设置接收消息回调地址"）
              </span>
            </li>
          </ol>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => onOpenUrl("https://work.weixin.qq.com")}
              className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px] font-medium"
            >
              去企业微信管理后台
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

/// 凭据文案按渠道走：飞书用 App ID / tenant_access_token，钉钉用 Client ID / access_token，
/// 否则会和表单里的字段名对不上，用户一眼看就觉得假。
function credentialTerms(channel: ChannelId): { idLabel: string; tokenName: string; host: string } {
  switch (channel) {
    case "feishu":
      return {
        idLabel: "App ID / App Secret",
        tokenName: "tenant_access_token",
        host: "open.feishu.cn",
      };
    case "dingtalk":
      return {
        idLabel: "Client ID / Client Secret",
        tokenName: "access_token",
        host: "api.dingtalk.com",
      };
    case "wecom":
      return {
        idLabel: "Bot ID / Secret",
        tokenName: "WSS 订阅",
        host: "openws.work.weixin.qq.com",
      };
    default:
      return {
        idLabel: "凭据",
        tokenName: "access_token",
        host: "开放平台",
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
