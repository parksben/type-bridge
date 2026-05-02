import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store";
import SideBar from "./SideBar";
import ErrorBoundary from "./ErrorBoundary";
import ConnectionTab from "./tabs/ConnectionTab";
import HistoryTab from "./tabs/HistoryTab";
import SystemLogTab from "./tabs/SystemLogTab";
import InputSettingsTab from "./tabs/InputSettingsTab";
import ComingSoonTab from "./tabs/ComingSoonTab";

export default function MainWindow() {
  const { activeTab, setConnected, addLog } = useAppStore();

  useEffect(() => {
    const un1 = listen<{ connected: boolean }>("feishu://status", (e) => {
      setConnected(e.payload.connected);
      addLog({
        kind: "connect",
        text: e.payload.connected ? "飞书长连接已建立" : "飞书连接断开",
      });
    });
    const un2 = listen<{ success: boolean; reason?: string }>(
      "feishu://inject-result",
      (e) => {
        addLog({
          kind: "inject",
          text: e.payload.success ? "输入成功" : `输入失败: ${e.payload.reason ?? "未知原因"}`,
        });
      }
    );
    const un3 = listen<{ sender: string; text: string }>("feishu://message", (e) => {
      addLog({ kind: "message", text: `@${e.payload.sender}: "${e.payload.text}"` });
    });
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
