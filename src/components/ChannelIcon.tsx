import type { ChannelId } from "../store";
import { Globe } from "lucide-react";
import feishuPng from "../assets/icons/feishu.png";
import DingTalkIcon from "../assets/icons/dingtalk.svg?react";
import WeComIcon from "../assets/icons/wecom.svg?react";

/// 四家渠道的品牌 icon。
///   - WebChat：lucide Globe 单色 SVG，紫色品牌色（与 docs sidebar 一致）
///   - 飞书：官方 favicon PNG，原色多色保留
///   - 钉钉：ant-design icons，单色 SVG
///   - 企微：tdesign icons，单色 SVG

interface Props {
  channel: ChannelId;
  size?: number;
  className?: string;
}

export default function ChannelIcon({ channel, size = 14, className }: Props) {
  if (channel === "webchat") {
    return <Globe size={size} className={className} aria-hidden="true" strokeWidth={2} />;
  }
  if (channel === "feishu") {
    return (
      <img
        src={feishuPng}
        width={size}
        height={size}
        className={className}
        alt=""
        aria-hidden="true"
        style={{ display: "inline-block", objectFit: "contain" }}
      />
    );
  }
  const Icon = channel === "dingtalk" ? DingTalkIcon : WeComIcon;
  return <Icon width={size} height={size} className={className} aria-hidden="true" />;
}
