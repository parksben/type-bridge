import type { ChannelId } from "../store";
import feishuPng from "../assets/icons/feishu.png";
import DingTalkIcon from "../assets/icons/dingtalk.svg?react";
import WeComIcon from "../assets/icons/wecom.svg?react";

/// 三家 IM 的品牌 icon。
///   - 飞书：官方 favicon PNG（sf/p1-hera.feishucdn.com），蓝+青+深蓝三色鸟形
///     原色保留（不走 currentColor，因为品牌多色不能被单色覆盖）
///   - 钉钉：ant-design icons（阿里 Ant Design），单色 SVG，currentColor 着色
///   - 企微：tdesign icons（腾讯 TDesign），单色 SVG，currentColor 着色

interface Props {
  channel: ChannelId;
  size?: number;
  className?: string;
}

export default function ChannelIcon({ channel, size = 14, className }: Props) {
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
