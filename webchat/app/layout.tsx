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
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
