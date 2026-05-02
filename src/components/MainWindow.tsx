import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, CHANNEL_LABEL, type ChannelId } from "../store";
import SideBar from "./SideBar";
import ErrorBoundary from "./ErrorBoundary";
import ConnectionTab from "./tabs/ConnectionTab";
import HistoryTab from "./tabs/HistoryTab";
import SystemLogTab from "./tabs/SystemLogTab";
import InputSettingsTab from "./tabs/InputSettingsTab";
import ComingSoonTab from "./tabs/ComingSoonTab";

export default function MainWindow() {
  const { activeTab, setChannelConnected, addLog } = useAppStore();

  useEffect(() => {
    const un1 = listen<{ channel: ChannelId; connected: boolean }>(
      "typebridge://status",
      (e) => {
        setChannelConnected(e.payload.channel, e.payload.connected);
        const label = CHANNEL_LABEL[e.payload.channel];
        addLog({
          kind: "connect",
          channel: e.payload.channel,
          text: e.payload.connected ? `${label}长连接已建立` : `${label}连接断开`,
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
            ? "输入成功"
            : `输入失败: ${e.payload.reason ?? "未知原因"}`,
        });
      }
    );
    const un3 = listen<{ channel: ChannelId; sender: string; text: string }>(
      "typebridge://message",
      (e) => {
        addLog({
          kind: "message",
          channel: e.payload.channel,
          text: `@${e.payload.sender}: "${e.payload.text}"`,
        });
      }
    );
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
    };
  }, []);

  return (
    <div className="h-screen w-full flex flex-row animate-enter">
      <SideBar />
      <div className="flex-1 overflow-hidden">
        {activeTab === "connection" && (
          <ErrorBoundary label="连接飞书 Bot tab">
            <ConnectionTab />
          </ErrorBoundary>
        )}
        {activeTab === "connection-dingtalk" && (
          <ErrorBoundary label="连接钉钉 Bot tab">
            <ComingSoonTab platform="dingtalk" />
          </ErrorBoundary>
        )}
        {activeTab === "connection-wecom" && (
          <ErrorBoundary label="连接企微 Bot tab">
            <ComingSoonTab platform="wecom" />
          </ErrorBoundary>
        )}
        {activeTab === "history" && (
          <ErrorBoundary label="历史消息 tab">
            <HistoryTab />
          </ErrorBoundary>
        )}
        {activeTab === "logs" && (
          <ErrorBoundary label="系统日志 tab">
            <SystemLogTab />
          </ErrorBoundary>
        )}
        {activeTab === "input" && (
          <ErrorBoundary label="输入设置 tab">
            <InputSettingsTab />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
