import { Info } from "lucide-react";
import { useI18n } from "../i18n";
import WebChatConnectionTab from "./tabs/WebChatConnectionTab";

/// 「连接 TypeBridge」tab 的壳：
///   顶部 intro 说明横条 → WebChat 扫码面板
///   v0.8 拆分：IM 渠道（飞书/钉钉/企微）移到「连接应用」tab（LinkAppsHub）
export default function ConnectionHub() {
  const { t } = useI18n();

  return (
    <div className="h-full flex flex-col">
      {/* intro 说明 banner */}
      <div
        className="flex justify-center items-center gap-2 px-6 py-2 text-[12px] shrink-0"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Info size={12} strokeWidth={1.75} className="text-accent shrink-0" />
        <span>{t("connectionHub.introWebchat")}</span>
      </div>

      {/* WebChat 面板，占据剩余高度 */}
      <div className="flex-1 overflow-hidden">
        <WebChatConnectionTab />
      </div>
    </div>
  );
}
