import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TypeBridge WebChat",
  description: "TypeBridge 官方 WebChat 渠道 — 扫码即用的输入桥",
  metadataBase: new URL("https://webchat-typebridge.parksben.xyz"),
  openGraph: {
    title: "TypeBridge WebChat",
    description: "扫码即用的桌面输入桥，无需任何 IM 账号",
    url: "https://webchat-typebridge.parksben.xyz",
    type: "website",
  },
  // PWA-lite：让 iOS 添加到主屏后无浏览器边栏
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TypeBridge",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const buildRef = process.env.NEXT_PUBLIC_BUILD_REF || "dev";
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        {/* 固定右下角的 build 标识，帮助排查缓存 / 部署问题。
            pointer-events: none 避免挡住任何按钮交互。 */}
        <div
          aria-hidden="true"
          className="fixed bottom-0 right-0 z-0 pointer-events-none select-none font-mono"
          style={{
            padding: "2px 6px",
            fontSize: 9,
            color: "var(--tb-muted)",
            opacity: 0.35,
            paddingRight: "max(6px, env(safe-area-inset-right))",
            paddingBottom: "max(2px, env(safe-area-inset-bottom))",
          }}
        >
          build {buildRef}
        </div>
      </body>
    </html>
  );
}
