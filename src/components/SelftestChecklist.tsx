import { CheckCircle2, XCircle, AlertCircle, ExternalLink, Info } from "lucide-react";

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
  appId: string;
  onOpenUrl: (url: string) => void;
}

/// 连接测试清单卡片：凭据 + 3 行 probe + 1 行事件订阅静态提示。
/// 凭据失败时整块标红、不渲染 probe 行。
export default function SelftestChecklist({ result, appId, onOpenUrl }: Props) {
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
            请检查 App ID / App Secret 是否正确，或本机网络 / 代理是否能访问 open.feishu.cn。
          </div>
        </div>
      </div>
    );
  }

  const defaultHelpURL = `https://open.feishu.cn/app/${appId}/auth`;
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
        hint="App ID / App Secret 能换到 tenant_access_token"
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
                  `https://open.feishu.cn/app/${appId}/event`
                )
              }
              className="inline-flex items-center gap-1 text-accent hover:underline text-[11.5px] font-medium"
            >
              去事件配置页
              <ExternalLink size={10} strokeWidth={2} />
            </button>
            <button
              onClick={() =>
                onOpenUrl(
                  "https://open.feishu.cn/document/server-docs/im-v1/message/events/receive"
                )
              }
              className="inline-flex items-center gap-1 text-muted hover:text-text hover:underline text-[11px]"
            >
              查看文档
              <ExternalLink size={9} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  ok: boolean;
  label: string;
  hint: string;
  failureDetail?: React.ReactNode;
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
