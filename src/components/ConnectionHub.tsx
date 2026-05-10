import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore, type ChannelId } from "../store";
import { useI18n } from "../i18n";
import ConnectionTab from "./tabs/ConnectionTab";
import DingTalkConnectionTab from "./tabs/DingTalkConnectionTab";
import WeComConnectionTab from "./tabs/WeComConnectionTab";
import WebChatConnectionTab from "./tabs/WebChatConnectionTab";
import ChannelIcon from "./ChannelIcon";

// WebChat 在最左侧（默认 tab）— TypeBridge 官方渠道，零配置可用
const CHANNELS: ChannelId[] = ["webchat", "feishu", "dingtalk", "wecom"];

const CHANNEL_BRAND_COLOR: Record<ChannelId, string> = {
  webchat: "#7c3aed",
  feishu: "#3370FF",
  dingtalk: "#1677ff",
  wecom: "#07c160",
};

/// 「连接 TypeBridge」tab 的壳：
///   顶部 intro 说明 → 横向渠道子 tab → 当前渠道的配置面板（独立滚动）
///
/// 子 tab 选中状态存 Zustand（activeConnectionChannel）——切走 sidebar tab
/// 再回来保留上下文；默认 WebChat（零配置即用）。
export default function ConnectionHub() {
  const { activeConnectionChannel, setActiveConnectionChannel, channelConnected } =
    useAppStore();
  const { t } = useI18n();

  // 用于计算下划线动效的位置和宽度
  const tabRefs = useRef<Record<ChannelId, HTMLButtonElement | null>>({
    webchat: null,
    feishu: null,
    dingtalk: null,
    wecom: null,
  });
  const [underlineStyle, setUnderlineStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  useEffect(() => {
    const activeButton = tabRefs.current[activeConnectionChannel];
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
  }, [activeConnectionChannel]);

  return (
    <div className="h-full flex flex-col">
      {/* 横向渠道子 tab */}
      <div
        className="flex justify-center items-center relative"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {CHANNELS.map((ch) => {
          const active = ch === activeConnectionChannel;
          const connected = channelConnected[ch] === true;
          return (
            <button
              type="button"
              key={ch}
              ref={(el) => {
                if (el) tabRefs.current[ch] = el;
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
              <span>{t(`channel.${ch}` as any)}</span>
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

      {/* intro 说明 banner，置于 tab 下方全宽 */}
      <div
        className="flex items-center gap-2 px-6 py-2 text-[12px] shrink-0"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Info size={12} strokeWidth={1.75} className="text-accent shrink-0" />
        <span>
          {activeConnectionChannel === "webchat"
            ? t("connectionHub.introWebchat")
            : t("connectionHub.introIM")}
        </span>
      </div>

      {/* 当前渠道面板，占据剩余高度独立滚动 */}
      <div className="flex-1 overflow-hidden">
        {activeConnectionChannel === "webchat" && <WebChatConnectionTab />}
        {activeConnectionChannel === "feishu" && <ConnectionTab />}
        {activeConnectionChannel === "dingtalk" && <DingTalkConnectionTab />}
        {activeConnectionChannel === "wecom" && <WeComConnectionTab />}
      </div>
    </div>
  );
}
