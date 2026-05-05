import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TypeBridge — 手机即键盘",
  description:
    "把手机变成电脑的无线键盘。说话、打字、发图片——手机发一条消息，电脑输入框直接落字。macOS 菜单栏应用。",
  metadataBase: new URL("https://typebridge.parksben.xyz"),
  openGraph: {
    title: "TypeBridge — 手机即键盘",
    description:
      "把手机变成电脑的无线键盘。说话、打字、发图片——手机发一条消息，电脑输入框直接落字。",
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
