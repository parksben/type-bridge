import type { Metadata } from "next";
import "./globals.css";
import { ClientShell } from "./client-shell";

export const metadata: Metadata = {
  title: "TypeBridge — 通过 IM 消息，向任意位置输入",
  description:
    "macOS 菜单栏应用。接收飞书 / 钉钉 / 企业微信机器人的消息，自动粘贴到你当前聚焦的输入框。",
  metadataBase: new URL("https://typebridge.parksben.xyz"),
  openGraph: {
    title: "TypeBridge — IM 消息注入工具",
    description:
      "通过飞书 / 钉钉 / 企微机器人消息，向 macOS 任意输入框注入内容。",
    url: "https://typebridge.parksben.xyz",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link
          href="https://fonts.bunny.net/css?family=geist:400,500,600,700|instrument-serif:400i&display=swap"
          rel="stylesheet"
        />
        {/* Theme flicker prevention — inline blocking script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.add('light-force')})()`,
          }}
        />
      </head>
      <body className="antialiased">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
