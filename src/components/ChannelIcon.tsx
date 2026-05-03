import type { ChannelId } from "../store";
import FeishuIcon from "../assets/icons/feishu.svg?react";
import DingTalkIcon from "../assets/icons/dingtalk.svg?react";
import WeComIcon from "../assets/icons/wecom.svg?react";

/// 三家 IM 的品牌 icon。所有 SVG 用 `fill="currentColor"`，由外层 CSS
/// （`color: var(--brand-feishu)` 等）决定实际渲染颜色。
///
/// 来源（都是各自母公司 / 关联设计系统开源的 icon 集）：
///   - 飞书：icon-park（字节跳动 IconPark）
///   - 钉钉：ant-design icons（阿里 Ant Design）
///   - 企微：tdesign icons（腾讯 TDesign）

const ICONS: Record<ChannelId, React.FC<React.SVGProps<SVGSVGElement>>> = {
  feishu: FeishuIcon,
  dingtalk: DingTalkIcon,
  wecom: WeComIcon,
};

interface Props {
  channel: ChannelId;
  size?: number;
  className?: string;
}

export default function ChannelIcon({ channel, size = 14, className }: Props) {
  const Icon = ICONS[channel];
  return (
    <Icon
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
