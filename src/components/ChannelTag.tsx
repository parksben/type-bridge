import { type ChannelId } from "../store";
import { t } from "../i18n";
import ChannelIcon from "./ChannelIcon";

interface Props {
  channel: ChannelId;
}

/// 历史消息卡片右上角显示的渠道标签。每个渠道用独立配色 + 官方 icon 一眼区分。
const CHANNEL_COLOR: Record<ChannelId, { fg: string; bg: string }> = {
  webchat: { fg: "#7c3aed", bg: "rgba(124, 58, 237, 0.12)" },
  feishu: { fg: "#3370FF", bg: "rgba(51, 112, 255, 0.12)" },
  dingtalk: { fg: "#1677ff", bg: "rgba(22, 119, 255, 0.12)" },
  wecom: { fg: "#07c160", bg: "rgba(7, 193, 96, 0.12)" },
};

export default function ChannelTag({ channel }: Props) {
  const color = CHANNEL_COLOR[channel];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono"
      style={{ color: color.fg, background: color.bg }}
    >
      <ChannelIcon channel={channel} size={10} />
      {t(`channel.${channel}` as any)}
    </span>
  );
}
