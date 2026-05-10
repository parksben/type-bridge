import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore, type ChannelId } from "../store";
import { useI18n, type TKey } from "../i18n";
import ConnectionTab from "./tabs/ConnectionTab";
import DingTalkConnectionTab from "./tabs/DingTalkConnectionTab";
import WeComConnectionTab from "./tabs/WeComConnectionTab";
import ChannelIcon from "./ChannelIcon";

// 仅 IM 渠道——WebChat 已移至「连接 TypeBridge」tab（ConnectionHub）
const IM_CHANNELS: ChannelId[] = ["feishu", "dingtalk", "wecom"];

const CHANNEL_BRAND_COLOR: Record<ChannelId, string> = {
  webchat: "#7c3aed",
  feishu: "#3370FF",
  dingtalk: "#1677ff",
  wecom: "#07c160",
};

/// 「连接应用」(Link Chat Apps) tab 的壳：
///   顶部 intro 说明横条（在 tab 上方） → 横向 IM 渠道子 tab → 渠道配置面板（独立滚动）
///
/// 子 tab 选中状态存 Zustand（activeConnectionChannel）——切走 sidebar tab
/// 再回来保留上下文；默认飞书。
export default function LinkAppsHub() {
  const { activeConnectionChannel, setActiveConnectionChannel, channelConnected } =
    useAppStore();
  const { t } = useI18n();

  // 如果当前选中的是 webchat（不属于此 hub），自动回落到飞书
  const activeChannel =
    activeConnectionChannel === "webchat" ? "feishu" : activeConnectionChannel;

  // 用于计算下划线动效的位置和宽度
  const tabRefs = useRef<Partial<Record<ChannelId, HTMLButtonElement | null>>>({});
  const [underlineStyle, setUnderlineStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  useEffect(() => {
    const activeButton = tabRefs.current[activeChannel];
    if (activeButton) {
      const rect = activeButton.getBoundingClientRect();
      const parentRect = activeButton.parentElement?.getBoundingClientRect();
      if (parentRect) {
        setUnderlineStyle({
          left: rect.left - parentRect.left,
          width: rect.width,
        });
      }
    }
  }, [activeChannel]);

  return (
    <div className="h-full flex flex-col">
      {/* intro 说明 banner，置于横向子 tab 上方 */}
      <div
        className="flex justify-center items-center gap-2 px-6 py-2 text-[12px] shrink-0"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Info size={12} strokeWidth={1.75} className="text-accent shrink-0" />
        <span>{t("connectionHub.introIM")}</span>
      </div>

      {/* 横向 IM 渠道子 tab */}
      <div
        className="flex justify-center items-center relative"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {IM_CHANNELS.map((ch) => {
          const active = ch === activeChannel;
          const connected = channelConnected[ch] === true;
          return (
            <button
              type="button"
              key={ch}
              ref={(el) => {
                tabRefs.current[ch] = el;
              }}
              onClick={() => setActiveConnectionChannel(ch)}
              className={`relative flex items-center gap-2 px-5 h-12 text-[14px] transition-colors ${
                active ? "text-text" : "text-muted hover:text-text"
              }`}
            >
              {/* 渠道已连接时加个小绿点 */}
              {connected && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--success)" }}
                />
              )}
              <span
                className="inline-flex items-center"
                style={{ color: CHANNEL_BRAND_COLOR[ch] }}
              >
                <ChannelIcon channel={ch} size={15} />
              </span>
              <span>{t(`channel.${ch}` as TKey)}</span>
            </button>
          );
        })}
        {/* 动画下划线 */}
        <div
          className="absolute bottom-0 h-[2px] rounded-t-sm transition-all duration-300"
          style={{
            background: "var(--accent)",
            left: `${underlineStyle.left}px`,
            width: `${underlineStyle.width}px`,
          }}
        />
      </div>

      {/* 当前 IM 渠道面板，占据剩余高度独立滚动 */}
      <div className="flex-1 overflow-hidden">
        {activeChannel === "feishu" && <ConnectionTab />}
        {activeChannel === "dingtalk" && <DingTalkConnectionTab />}
        {activeChannel === "wecom" && <WeComConnectionTab />}
      </div>
    </div>
  );
}
