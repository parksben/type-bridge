import { Info } from "lucide-react";
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

  return (
    <div className="h-full flex flex-col">
      {/* 顶部 intro 说明 */}
      <div
        className="flex items-center gap-2 px-6 py-3 text-[12.5px]"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Info size={13} strokeWidth={1.75} className="text-accent shrink-0" />
        <span>
          {activeConnectionChannel === "webchat"
            ? t("connectionHub.introWebchat")
            : t("connectionHub.introIM")}
        </span>
      </div>

      {/* 横向渠道子 tab */}
      <div
        className="flex items-center px-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {CHANNELS.map((ch) => {
          const active = ch === activeConnectionChannel;
          const connected = channelConnected[ch] === true;
          return (
            <button
              key={ch}
              onClick={() => setActiveConnectionChannel(ch)}
              className={`relative flex items-center gap-1.5 px-3 h-10 text-[13px] transition-colors ${
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
                <ChannelIcon channel={ch} size={13} />
              </span>
              <span className={active ? "font-medium" : ""}>
                {t(`channel.${ch}` as any)}
              </span>
              {active && (
                <span
                  className="absolute left-2 right-2 bottom-0 h-[2px] rounded-t-sm"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
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
