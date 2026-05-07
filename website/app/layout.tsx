import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

async function isEnglishRequest(): Promise<boolean> {
  try {
    const headersList = await headers();
    const acceptLang = headersList.get("accept-language") || "";
    return acceptLang.trim().toLowerCase().startsWith("en");
  } catch {
    return false;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const en = await isEnglishRequest();
  return {
    title: en ? "TypeBridge — Chat to Type" : "TypeBridge — 聊天即打字",
    description: en
      ? "Chat on your phone, type on your Mac. Speak, text, or send an image — your message lands right where your cursor is. A macOS menu bar app."
      : "聊天即打字：说话、发文字、发图片——手机聊一条消息，电脑输入框直接落字。macOS 菜单栏应用。",
    metadataBase: new URL("https://typebridge.parksben.xyz"),
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
      other: [{ rel: "icon", url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }],
    },
    openGraph: {
      title: en ? "TypeBridge — Chat to Type" : "TypeBridge — 聊天即打字",
      description: en
        ? "Chat on your phone, type on your Mac. Speak, text, or send an image — your message lands right where your cursor is."
        : "聊天即打字：说话、发文字、发图片——手机聊一条消息，电脑输入框直接落字。",
      url: "https://typebridge.parksben.xyz",
      type: "website",
    },
  };
}

/**
 * Theme flicker prevention — runs before React hydration.
 * Reads localStorage.tb-theme: "system" (default) | "light" | "dark".
 * For "system", consults prefers-color-scheme. Writes html.light-force for light.
 */
/**
 * Theme flicker prevention — runs before React hydration.
 * Reads localStorage.tb-theme: "system" (default) | "light" | "dark".
 * For "system", consults prefers-color-scheme. Writes html.light-force for light.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('tb-theme')||'system';var light=t==='light'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);if(light)document.documentElement.classList.add('light-force');}catch(e){}})()`;

/**
 * Language detection — runs before React hydration.
 * Reads localStorage.tb-lang. Falls back to navigator.language, then zh-CN.
 */
const langInit = `(function(){try{var l=localStorage.getItem('tb-lang');if(!l){var n=navigator.language||'';l=n.startsWith('en')?'en':n.startsWith('zh')?'zh':null;}if(l==='en')document.documentElement.lang='en';else document.documentElement.lang='zh-CN';}catch(e){}})()`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const en = await isEnglishRequest();
  return (
    <html lang={en ? "en" : "zh-CN"} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link
          href="https://fonts.bunny.net/css?family=geist:400,500,600,700,800|geist-mono:400,500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: langInit }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
