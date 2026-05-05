import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

function isEnglishRequest(): boolean {
  try {
    const headersList = headers();
    const acceptLang = headersList.get("accept-language") || "";
    return acceptLang.trim().toLowerCase().startsWith("en");
  } catch {
    return false;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const en = isEnglishRequest();
  return {
    title: en ? "TypeBridge — Phone as Keyboard" : "TypeBridge — 手机即键盘",
    description: en
      ? "Turn your phone into a wireless keyboard for your Mac. Speak, type, or send an image — your phone message appears right where your cursor is. A macOS menu bar app."
      : "把手机变成电脑的无线键盘。说话、打字、发图片——手机发一条消息，电脑输入框直接落字。macOS 菜单栏应用。",
    metadataBase: new URL("https://typebridge.parksben.xyz"),
    openGraph: {
      title: en ? "TypeBridge — Phone as Keyboard" : "TypeBridge — 手机即键盘",
      description: en
        ? "Turn your phone into a wireless keyboard for your Mac. Speak, type, or send an image — your phone message appears right where your cursor is."
        : "把手机变成电脑的无线键盘。说话、打字、发图片——手机发一条消息，电脑输入框直接落字。",
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
  const en = isEnglishRequest();
  return (
    <html lang={en ? "en" : "zh-CN"} suppressHydrationWarning>
      <head>
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
