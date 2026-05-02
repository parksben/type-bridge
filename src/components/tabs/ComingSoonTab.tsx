import { Construction } from "lucide-react";

interface Props {
  platform: "dingtalk" | "wecom";
}

const TEXT: Record<Props["platform"], { name: string; desc: string }> = {
  dingtalk: {
    name: "钉钉",
    desc: "钉钉 Bot 接入将复用同一套 sidecar 架构（独立进程封装协议细节、stdout JSON Lines 上传消息），共用历史消息 + 注入 worker。",
  },
  wecom: {
    name: "企业微信",
    desc: "企业微信 Bot 接入将复用同一套 sidecar 架构（独立进程封装协议细节、stdout JSON Lines 上传消息），共用历史消息 + 注入 worker。",
  },
};

export default function ComingSoonTab({ platform }: Props) {
  const { name, desc } = TEXT[platform];

  return (
    <div className="h-full flex items-center justify-center px-10 py-8">
      <div className="max-w-sm flex flex-col items-center text-center gap-4">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-full"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <Construction
            size={32}
            strokeWidth={1.5}
            style={{ color: "var(--muted)" }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-[15px] font-medium text-text">
            {name} Bot 功能正在开发中
          </div>
          <div className="text-[12.5px] text-muted">敬请期待</div>
        </div>
        <div className="text-[11.5px] text-subtle leading-relaxed mt-2">
          {desc}
        </div>
      </div>
    </div>
  );
}
