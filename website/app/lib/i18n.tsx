"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export type Language = "zh" | "en";

type DictValue = string | string[] | Record<string, unknown>;

type Dict = Record<string, Record<string, DictValue>>;

// ────────────────────────────────────────────
// Translation dictionary
// ────────────────────────────────────────────

const DICT = {
  // ── TopNav ─────────────────────────────────
  "nav.home": { zh: "首页", en: "Home" },
  "nav.scenes": { zh: "适用场景", en: "Use Cases" },
  "nav.flow": { zh: "使用流程", en: "How It Works" },
  "nav.download": { zh: "下载安装", en: "Download" },
  "nav.tagline": { zh: "手机即键鼠", en: "Phone as Keyboard & Mouse" },
  "nav.brandAria": { zh: "TypeBridge — 手机即键鼠", en: "TypeBridge — Phone as Keyboard & Mouse" },
  "nav.githubAria": { zh: "查看 TypeBridge GitHub 仓库", en: "View TypeBridge on GitHub" },

  // ── Hero ───────────────────────────────────
  "hero.headline": { zh: "手机即键鼠", en: "Your Phone, Keyboard & Mouse" },
  "hero.subtitle": {
    zh: "扫一下，手机变成无线键盘和触控板——打字、移动鼠标、语音输入，全部实时到达 Mac",
    en: "Scan once — your phone becomes a wireless keyboard and trackpad. Type, move the cursor, use your voice. All lands on your Mac in real time.",
  },
  "hero.ctaDownload": { zh: "免费下载", en: "Download Free" },
  "hero.ctaHowto": { zh: "如何使用", en: "How It Works" },
  "hero.desktopText": { zh: "手机即键鼠", en: "Keyboard & Mouse" },
  "hero.phoneUserMsg": { zh: "手机即键鼠", en: "Phone as Keyboard & Mouse" },
  "hero.phoneInputPlaceholder": { zh: "输入消息…", en: "Type a message…" },

  // ── Concept banner channel labels ──────────
  "channel.webchat": { zh: "WebChat", en: "WebChat" },
  "channel.feishu": { zh: "飞书", en: "Feishu" },
  "channel.dingtalk": { zh: "钉钉", en: "DingTalk" },
  "channel.wecom": { zh: "企微", en: "WeCom" },

  // ── Scenes ─────────────────────────────────
  "scenes.heading": {
    zh: "每一种姿势，都是**手机即键鼠**",
    en: "Every gesture proves: **Your Phone, Keyboard & Mouse**",
  },
  "scenes.subheading": { zh: "触控、打字、语音、快捷键——手机全都能", en: "Trackpad, typing, voice, shortcuts — your phone does it all." },
  "scenes.tipLabel": { zh: "提示：", en: "Tip: " },

  "scenes.touchpad.title": { zh: "手机屏就是你的触控板", en: "Your Phone Screen Is the Trackpad" },
  "scenes.touchpad.subtitle": { zh: "单指移鼠标，双指滚页面", en: "One finger to move. Two to scroll." },
  "scenes.touchpad.description": {
    zh: "打开触控板模式，单指移动鼠标，双指上下滚动，左键右键随手点——无需蓝牙，无需配对，扫码即用的无线触控板。",
    en: "Switch to trackpad mode. One finger moves the cursor, two fingers scroll. Left click, right click — no Bluetooth, no pairing. Just scan and use.",
  },
  "scenes.touchpad.details": {
    zh: [
      "演示 PPT 时站在台前远程控制电脑，不用走回工位",
      "躺在沙发上浏览网页，手机当遥控翻页",
      "三指左右滑，在多桌面之间自由切换",
    ],
    en: [
      "Give a presentation from the front — control your Mac without returning to your desk",
      "Browse from the couch — use your phone as a wireless scroll controller",
      "Three-finger swipe left or right to switch desktops",
    ],
  },
  "scenes.touchpad.tip": {
    zh: "三指上滑可触发 Mission Control，三指左右滑在桌面间切换。",
    en: "Three-finger swipe up for Mission Control. Left or right to switch desktops.",
  },
  "scenes.touchpad.theme": { zh: "手机就是触控板。", en: "Your phone is the trackpad." },

  "scenes.typeInput.title": { zh: "手机打字，电脑收字", en: "Type on Phone. Receive on Mac." },
  "scenes.typeInput.subtitle": { zh: "任意输入框，实时落字", en: "Any field, instant delivery." },
  "scenes.typeInput.description": {
    zh: "在手机上打字发送，文字立刻注入电脑当前光标处——任何 App、任何输入框，不需要剪贴板，不需要切换设备。",
    en: "Type and send on your phone. The text lands instantly at your Mac's cursor — any app, any input field. No clipboard. No device switching.",
  },
  "scenes.typeInput.details": {
    zh: [
      "站着开会也能向电脑输入内容，不用回工位",
      "手机收到验证码 → 直接发送 → 电脑输入框自动落字",
      "双手不离鼠标时，用手机补那几个字",
    ],
    en: [
      "Add text to your Mac while standing — no need to return to your desk",
      "Got a verification code on your phone → send it → appears in the Mac's input field",
      "Keep both hands on the mouse — let your phone handle the typing",
    ],
  },
  "scenes.typeInput.tip": {
    zh: "开启「自动提交」，发送即等于按下回车，省掉最后一步。",
    en: "Enable \"Auto-submit\" — sending the message is the same as pressing Enter.",
  },
  "scenes.typeInput.theme": { zh: "手机键盘，电脑输入。", en: "Phone keyboard. Mac input." },

  "scenes.voiceInput.title": { zh: "张嘴说话，桌面出字", en: "Speak Into Phone. Text on Mac." },
  "scenes.voiceInput.subtitle": { zh: "语音转文字，实时上屏", en: "Voice to text, in real time." },
  "scenes.voiceInput.description": {
    zh: "打开手机输入法语音功能，说完发送，文字就出现在电脑光标处。写邮件、填表单、向 AI 发指令——嘴是最快的键盘。",
    en: "Use your phone's voice input, speak, then send. The transcription lands right at your Mac's cursor. Compose emails, fill forms, prompt AI — your voice is the fastest keyboard.",
  },
  "scenes.voiceInput.details": {
    zh: [
      "写周报 → 逐条口述 → Notion / 飞书文档里实时出现",
      "向 AI 发指令 → 口述需求 → Cursor / Copilot 立刻收到",
      "填表单 → 说一段 → 字段自动落字，不用切换窗口",
    ],
    en: [
      "Weekly report → dictate line by line → appears in Notion or Docs in real time",
      "AI prompts → speak your request → Cursor or Copilot receives it instantly",
      "Fill a form → dictate a paragraph → field auto-fills, no window switching",
    ],
  },
  "scenes.voiceInput.tip": {
    zh: "中文语音识别可达 200+ 字/分钟，比键盘快一倍以上。",
    en: "Voice recognition reaches 200+ characters/minute — twice as fast as typing.",
  },
  "scenes.voiceInput.theme": { zh: "嘴比键盘快。", en: "Voice beats the keyboard." },

  "scenes.quickCommands.title": { zh: "快捷指令，一触即发", en: "Shortcuts. One Tap." },
  "scenes.quickCommands.subtitle": { zh: "方向键、复制粘贴、撤销——手不离鼠标", en: "Arrow keys, copy-paste, undo — no keyboard reach." },
  "scenes.quickCommands.description": {
    zh: "切换到「键盘」模式，方向键、行首行尾、上下翻页、复制粘贴、撤销重做——常用快捷键全在手机上，手不用离开鼠标。",
    en: "Switch to keyboard mode. Arrow keys, Home/End, Page Up/Down, Copy/Paste, Undo/Redo — all on your phone. Your hand never leaves the mouse.",
  },
  "scenes.quickCommands.details": {
    zh: [
      "翻代码时上下翻页，手不离鼠标",
      "选中文字 → 手机点复制 → 粘贴到另一个窗口",
      "写文档时撤销重做，手机上一触即发",
    ],
    en: [
      "Scroll through code — hand never leaves the mouse",
      "Select text → tap copy on phone → paste in another window",
      "Undo and redo while writing — one tap on your phone",
    ],
  },
  "scenes.quickCommands.tip": {
    zh: "支持方向键、Home/End、PageUp/Down、Cmd+↑↓ 等常用快捷键。",
    en: "Supports arrow keys, Home/End, PageUp/Down, Cmd+↑↓, and more.",
  },
  "scenes.quickCommands.theme": { zh: "快捷键，在手心里。", en: "Shortcuts in your palm." },

  // ── Flow ───────────────────────────────────
  "flow.heading": { zh: "四步，把手机变成**无线键鼠**", en: "Four steps to **wireless keyboard & mouse**" },
  "flow.subheading": { zh: "下载、授权、扫码、用——两分钟搞定", en: "Download, permit, scan, control — done in two minutes" },
  "flow.step01.title": { zh: "下载安装", en: "Download" },
  "flow.step01.subtitle": { zh: "免费下载 macOS 版，拖入应用程序文件夹", en: "Download the free macOS app, drag to Applications" },
  "flow.step02.title": { zh: "开启权限", en: "Grant Access" },
  "flow.step02.subtitle": { zh: "首次启动按提示授权辅助功能，一次永久有效", en: "Grant Accessibility permission on first launch — once and done" },
  "flow.step03.pickOne": { zh: "任选其一", en: "Pick one" },
  "flow.choice.webchat.label": { zh: "扫码即连", en: "Scan to Connect" },
  "flow.choice.webchat.desc": { zh: "手机扫 App 内二维码，同 WiFi 秒连", en: "Scan the QR in the app — same WiFi, instant connection" },
  "flow.choice.im.label": { zh: "IM 机器人", en: "IM Bot" },
  "flow.choice.im.desc": { zh: "飞书 / 钉钉 / 企微自建应用", en: "Feishu / DingTalk / WeCom" },
  "flow.step04.title": { zh: "随心控制", en: "Control Freely" },
  "flow.step04.subtitle": { zh: "打字、滑动触控板、语音——三种姿势，实时到达", en: "Type, swipe the trackpad, use your voice — all reach your Mac in real time" },

  // ── Download ───────────────────────────────
  "download.heading": { zh: "下载 & 安装", en: "Download & Install" },
  "download.appleSilicon": { zh: "苹果芯片", en: "Apple Silicon" },
  "download.appleSiliconChip": { zh: "M1 / M2 / M3 / M4", en: "M1 / M2 / M3 / M4" },
  "download.intel": { zh: "英特尔芯片", en: "Intel" },
  "download.intelChip": { zh: "x86_64", en: "x86_64" },
  "download.gatekeeperTitle": { zh: "首次安装须知", en: "First-Time Install Note" },
  "download.gatekeeperDesc": {
    zh: "应用目前**未经过 Apple 公证**，macOS 可能阻止首次打开。任选一种方法即可正常使用：",
    en: "This app is **not notarized by Apple**. macOS may block it on first launch. Pick either method below to proceed:",
  },
  "download.methodA.title": { zh: "系统设置里点「仍要打开」", en: "Click \"Open Anyway\" in System Settings" },
  "download.methodA.desc": {
    zh: "进入**系统设置 > 隐私与安全性**，找到被拦截的 TypeBridge，点击**「仍要打开」**。",
    en: "Go to **System Settings > Privacy & Security**, find the blocked TypeBridge entry, and click **\"Open Anyway\"**.",
  },
  "download.methodB.title": { zh: "终端执行一行命令", en: "Run a Terminal Command" },
  "download.methodB.desc": {
    zh: "拖入应用程序文件夹后，在终端粘贴下面这行，移除隔离标记：",
    en: "After dragging to Applications, paste this line in Terminal to remove the quarantine flag:",
  },
  "download.copyButton": { zh: "复制", en: "Copy" },
  "download.copiedButton": { zh: "已复制", en: "Copied" },
  "download.accessibilityTitle": { zh: "首次使用须开启「辅助功能」权限", en: "Enable Accessibility Permission on First Launch" },
  "download.accessibilityDesc": {
    zh: "TypeBridge 需要模拟 `Cmd+V` 粘贴和按键操作。首次启动会自动引导你到**系统设置 > 隐私与安全性 > 辅助功能**，勾选 TypeBridge 即可。",
    en: "TypeBridge needs to simulate `Cmd+V` paste and keystrokes. On first launch, it will guide you to **System Settings > Privacy & Security > Accessibility** — just enable TypeBridge.",
  },

  // ── Footer ─────────────────────────────────
  "footer.tagline": { zh: "手机即键鼠", en: "Phone as Keyboard & Mouse" },
} as const;

// ────────────────────────────────────────────
// Page metadata (used for client-side <title> / <meta> updates on lang switch)
// ────────────────────────────────────────────

const META = {
  title: {
    zh: "TypeBridge — 手机即键鼠",
    en: "TypeBridge — Your Phone, Keyboard & Mouse",
  },
  description: {
    zh: "手机即键鼠：扫码连接，手机变成无线键盘和触控板。打字、移动鼠标、语音输入，全部实时到达 macOS。",
    en: "Your phone becomes a wireless keyboard and trackpad for your Mac. Type, move the cursor, use your voice — all via a simple QR scan. macOS menu bar app.",
  },
} as const;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/** Render a translation string that may contain `**bold**` markers into React nodes. */
export function renderMarked(text: string, idPrefix?: string): ReactNode {
  const parts = text.split("**");
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={`${idPrefix ?? "m"}-${i}`} className="font-semibold text-[var(--text)]">{part}</strong>;
    }
    return part;
  });
}

/** Detects the initial language: localStorage → navigator.language → fallback "zh". */
function detectLanguage(): Language {
  if (typeof window === "undefined") return "zh";
  try {
    const stored = localStorage.getItem("tb-lang");
    if (stored === "zh" || stored === "en") return stored;
  } catch {}
  const nav = navigator.language?.toLowerCase() ?? "";
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("en")) return "en";
  return "zh";
}

// ────────────────────────────────────────────
// Context & Provider
// ────────────────────────────────────────────

type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  tStrings: (key: string) => string[];
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children, initialLang }: { children: ReactNode; initialLang?: Language }) {
  const [lang, setLangState] = useState<Language>(initialLang ?? "zh");
  const [ready, setReady] = useState(!!initialLang);

  useEffect(() => {
    const detected = detectLanguage();
    if (detected !== lang) {
      setLangState(detected);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try { localStorage.setItem("tb-lang", newLang); } catch {}
    document.documentElement.lang = newLang === "zh" ? "zh-CN" : "en";

    // Update <title> and <meta> tags so browser tab / social previews reflect current language
    document.title = META.title[newLang];
    const setMeta = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute("content", content);
    };
    setMeta('meta[name="description"]', META.description[newLang]);
    setMeta('meta[property="og:title"]', META.title[newLang]);
    setMeta('meta[property="og:description"]', META.description[newLang]);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const entry = (DICT as Record<string, Record<string, unknown>>)[key];
      if (!entry) {
        console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return (entry[lang] as string) ?? (entry["zh"] as string) ?? key;
    },
    [lang],
  );

  const tStrings = useCallback(
    (key: string): string[] => {
      const entry = (DICT as Record<string, Record<string, unknown>>)[key];
      if (!entry) {
        console.warn(`[i18n] missing key: ${key}`);
        return [];
      }
      const val = entry[lang];
      if (Array.isArray(val)) return val;
      if (Array.isArray(entry["zh"])) return entry["zh"];
      return [];
    },
    [lang],
  );

  if (!ready) {
    // Render nothing only when no initialLang was passed (prevents flash of wrong language)
    return null;
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t, tStrings }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx;
}
