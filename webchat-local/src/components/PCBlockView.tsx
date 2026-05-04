import { QrCode, Smartphone } from "lucide-react";

/// PC 浏览器访问时的引导页。WebChat 是手机端输入桥，桌面用 PC 自己给自己发没意义，
/// 直接挡住让用户改用手机扫码。
export default function PCBlockView() {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6 py-10 safe-area-top safe-area-bottom">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "color-mix(in srgb, var(--tb-accent) 12%, transparent)" }}
          >
            <Smartphone size={20} strokeWidth={2} className="text-[var(--tb-accent)]" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight">TypeBridge WebChat</span>
        </div>

        <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "var(--tb-accent-soft)" }}
        >
          <QrCode size={36} strokeWidth={1.8} className="text-[var(--tb-accent)]" />
        </div>

        <h1 className="text-[20px] font-semibold tracking-tight mb-3">请用手机扫码</h1>
        <p className="text-[14px] leading-relaxed text-[var(--tb-muted)] max-w-sm mx-auto">
          WebChat 是 <strong className="text-[var(--tb-text)]">手机端输入桥</strong> ——
          在手机上发消息，桌面端自动注入到焦点输入框。
          <br />
          用电脑打开本页面没有意义，请用手机扫描桌面 TypeBridge 上的二维码。
        </p>

        <div
          className="mt-6 mx-auto max-w-sm rounded-xl p-4 text-left text-[12.5px] leading-relaxed"
          style={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
            color: "var(--tb-muted)",
          }}
        >
          <p className="font-medium text-[var(--tb-text)] mb-1">怎么扫？</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>在 Mac 打开 TypeBridge，进入「连接IM应用 → WebChat」</li>
            <li>点「启动会话」生成二维码</li>
            <li>确保手机和电脑在同一个 WiFi 下，用手机相机扫码</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
