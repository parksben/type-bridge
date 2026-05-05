import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TypeBridge — 手机即键盘",
  description:
    "让手机成为桌面的输入设备。通过飞书 / 钉钉 / 企业微信 / 本地 WebChat，把手机说出的每一句话变成桌面当前输入框里的字。macOS 菜单栏应用。",
  metadataBase: new URL("https://typebridge.parksben.xyz"),
  openGraph: {
    title: "TypeBridge — 手机即键盘",
    description:
      "让手机成为桌面的输入设备。飞书 / 钉钉 / 企微 / 本地 WebChat 作为桥梁，手机说一句，桌面就写一句。",
    url: "https://typebridge.parksben.xyz",
    type: "website",
  },
};

/**
 * Theme flicker prevention — runs before React hydration.
 * Reads localStorage.tb-theme: "system" (default) | "light" | "dark".
 * For "system", consults prefers-color-scheme. Writes html.light-force for light.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('tb-theme')||'system';var light=t==='light'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);if(light)document.documentElement.classList.add('light-force');}catch(e){}})()`;

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
          href="https://fonts.bunny.net/css?family=geist:400,500,600,700,800|geist-mono:400,500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
