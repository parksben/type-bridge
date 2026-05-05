import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  useAppStore,
  type ChannelId,
  type Settings,
} from "../store";
import { useI18n } from "../i18n";
import SideBar from "./SideBar";
import ErrorBoundary from "./ErrorBoundary";
import ConnectionHub from "./ConnectionHub";
import HistoryTab from "./tabs/HistoryTab";
import SystemLogTab from "./tabs/SystemLogTab";
import InputSettingsTab from "./tabs/InputSettingsTab";
import AboutTab from "./tabs/AboutTab";

export default function MainWindow() {
  const { activeTab, setChannelConnected, addLog } = useAppStore();
  const { t } = useI18n();

  // 启动时拉一次 settings，把已配置凭据的渠道注册到 channelConnected
  // （初始都是 false）。这样 sidebar 底部能立刻显示对应渠道行，而不是"尚未配置"。
  // 后续 typebridge://status 事件会按实际连接状态更新该行。
  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => {
      if (s.feishu_app_id.trim() && s.feishu_app_secret.trim()) {
        setChannelConnected("feishu", false);
      }
      if (s.dingtalk_client_id.trim() && s.dingtalk_client_secret.trim()) {
        setChannelConnected("dingtalk", false);
      }
    }).catch(() => {});
  }, []);

  // WebChat 是零配置渠道，"连接"语义是 phase === "bound"（至少一台手机绑定）。
  // 初始拉一次 snapshot 同步当前状态；后续由 typebridge://webchat-session-update
  // 事件实时维护（下面 un4 订阅）。把 webchat 的 key 初始化进 channelConnected
  // 后，ConnectionHub 横向子 tab 的小绿点才会正确亮起。
  useEffect(() => {
    invoke<{ phase: { kind: string } }>("webchat_snapshot")
      .then((snap) => {
        setChannelConnected("webchat", snap?.phase?.kind === "bound");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const un1 = listen<{ channel: ChannelId; connected: boolean }>(
      "typebridge://status",
      (e) => {
        setChannelConnected(e.payload.channel, e.payload.connected);
        const label = t(`channel.${e.payload.channel}` as any);
        addLog({
          kind: "connect",
          channel: e.payload.channel,
          text: e.payload.connected
            ? t("log.connectEstablished", { label })
            : t("log.connectDropped", { label }),
        });
      }
    );
    const un2 = listen<{ channel: ChannelId; success: boolean; reason?: string }>(
      "typebridge://inject-result",
      (e) => {
        addLog({
          kind: "inject",
          channel: e.payload.channel,
          text: e.payload.success
            ? t("log.injectSuccess")
            : t("log.injectFailed", {
                reason: e.payload.reason ?? t("log.injectFailedUnknown"),
              }),
        });
      }
    );
    const un3 = listen<{ channel: ChannelId; sender: string; text: string }>(
      "typebridge://message",
      (e) => {
        addLog({
          kind: "message",
          channel: e.payload.channel,
          text: t("log.messageReceived", {
            sender: e.payload.sender,
            text: e.payload.text,
          }),
        });
      }
    );
    // WebChat phase 变化实时映射到 channelConnected.webchat（bound → true，其余 → false）
    const un4 = listen<{ phase: { kind: string } }>(
      "typebridge://webchat-session-update",
      (e) => {
        setChannelConnected("webchat", e.payload?.phase?.kind === "bound");
      }
    );
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      un4.then((f) => f());
    };
  }, []);

  return (
    <div className="h-screen w-full flex flex-row animate-enter">
      <SideBar />
      <div className="flex-1 overflow-hidden">
        {activeTab === "connection" && (
          <ErrorBoundary label={t("sidebar.connection")}>
            <ConnectionHub />
          </ErrorBoundary>
        )}
        {activeTab === "history" && (
          <ErrorBoundary label={t("sidebar.history")}>
            <HistoryTab />
          </ErrorBoundary>
        )}
        {activeTab === "logs" && (
          <ErrorBoundary label={t("sidebar.logs")}>
            <SystemLogTab />
          </ErrorBoundary>
        )}
        {activeTab === "input" && (
          <ErrorBoundary label={t("sidebar.input")}>
            <InputSettingsTab />
          </ErrorBoundary>
        )}
        {activeTab === "about" && (
          <ErrorBoundary label={t("sidebar.about")}>
            <AboutTab />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
