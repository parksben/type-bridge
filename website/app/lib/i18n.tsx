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
    zh: "打开 App、扫个码，手机立刻变成 Mac 的无线键盘和触控板——能打字、能控鼠标、能语音输入",
    en: "Open the app, scan a code — your phone instantly becomes a wireless keyboard and trackpad for your Mac. Type. Control the cursor. Use your voice.",
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
    zh: "一部手机，就是**一套键鼠**",
    en: "One phone. **So many ways to control your Mac.**",
  },
  "scenes.subheading": { zh: "触控板、打字、语音、快捷键——一部手机全搞定", en: "Trackpad, typing, voice, shortcuts — all from your phone." },
  "scenes.tipLabel": { zh: "提示：", en: "Tip: " },

  "scenes.touchpad.title": { zh: "手机屏幕，就是触控板", en: "Your Phone Becomes a Trackpad" },
  "scenes.touchpad.subtitle": { zh: "单指移鼠标，双指滚页面", en: "One finger moves. Two fingers scroll." },
  "scenes.touchpad.description": {
    zh: "切到触控板模式，单指移动光标，双指滚动页面，左键右键随手点。不用蓝牙、不用配对，扫码就能用。",
    en: "Switch to trackpad mode. Move the cursor with one finger, scroll with two, tap to click. No Bluetooth. No pairing. Scan and go.",
  },
  "scenes.touchpad.details": {
    zh: [
      "演示 PPT 时站前面也能遥控电脑，不用来回跑",
      "躺沙发刷网页，手机就是手里的遥控器",
      "三指滑动，在多个桌面之间切换",
    ],
    en: [
      "Presenting slides? Control your Mac from across the room",
      "Browsing from the couch? Your phone is the remote",
      "Three-finger swipe to jump between desktops",
    ],
  },
  "scenes.touchpad.tip": {
    zh: "三指上滑呼出调度中心，三指左右滑切换桌面。",
    en: "Swipe up with three fingers for Mission Control. Left or right to switch desktops.",
  },
  "scenes.touchpad.theme": { zh: "手机就是你的触控板。", en: "Your phone. Your trackpad." },

  "scenes.typeInput.title": { zh: "手机上打字，电脑上出字", en: "Type on Your Phone. Text on Your Mac." },
  "scenes.typeInput.subtitle": { zh: "光标在哪，字就落在哪", en: "Wherever your cursor is, that's where it goes." },
  "scenes.typeInput.description": {
    zh: "在手机上敲完发送，文字直接出现在电脑光标的位置——任何 App、任何输入框都行。不用复制粘贴，不用来回切设备。",
    en: "Type on your phone and hit send. The text appears right where your cursor is — any app, any input field. No copy-paste. No switching devices.",
  },
  "scenes.typeInput.details": {
    zh: [
      "站着开会也能往电脑里敲字——不用跑回工位",
      "手机收到验证码 → 点发送 → 电脑输入框直接填好",
      "双手忙着拖鼠标时，掏出手机打几个字就搞定",
    ],
    en: [
      "Drop text into your Mac while standing — no need to run back to your desk",
      "Got a verification code? Hit send — it fills the field on your Mac",
      "Both hands on the mouse? Pull out your phone to type a few words",
    ],
  },
  "scenes.typeInput.tip": {
    zh: "开启「自动提交」，消息发送即回车，省掉最后一步。",
    en: "Enable \"Auto-submit\" — sending the message is the same as pressing Enter.",
  },
  "scenes.typeInput.theme": { zh: "手机是你的另一把键盘。", en: "Your phone. Your second keyboard." },

  "scenes.voiceInput.title": { zh: "张嘴说，电脑写", en: "Speak. Your Mac Types." },
  "scenes.voiceInput.subtitle": { zh: "语音转文字，说完就上屏", en: "Voice to text. Speak and it's there." },
  "scenes.voiceInput.description": {
    zh: "打开手机输入法的语音键，说完点发送，文字就出现在电脑光标处。写邮件、填表单、给 AI 下指令——嘴比手快多了。",
    en: "Tap the mic on your phone's keyboard, say what you need, and hit send. The text lands at your Mac's cursor. Emails, forms, AI prompts — your voice is faster than your fingers.",
  },
  "scenes.voiceInput.details": {
    zh: [
      "写周报 → 想到什么说什么 → Notion 里一句句冒出来",
      "给 AI 派活 → 开口说需求 → Cursor 立刻收到",
      "填表单 → 说一段话 → 输入框自己就填上了",
    ],
    en: [
      "Weekly report → think out loud → lines appear in Notion or Docs",
      "AI prompt → say what you need → Cursor or Copilot gets it right away",
      "Fill a form → speak a paragraph → it fills itself in",
    ],
  },
  "scenes.voiceInput.tip": {
    zh: "中文语音输入轻松上 200 字/分钟，比打字快一倍。",
    en: "Speech recognition hits 200+ words per minute — twice as fast as typing.",
  },
  "scenes.voiceInput.theme": { zh: "嘴比键盘快。", en: "Voice beats the keyboard." },

  "scenes.quickCommands.title": { zh: "快捷指令，一触即发", en: "Shortcuts at Your Fingertips" },
  "scenes.quickCommands.subtitle": { zh: "截屏、全选、复制粘贴，一触即达", en: "Screenshot, select all, copy-paste — one tap away." },
  "scenes.quickCommands.description": {
    zh: "切到快捷键模式，常用快捷键全在手边——Cmd+Shift+4 截屏、Cmd+A 全选、Cmd+C/V 复制粘贴、Cmd+Z 撤销。手机上点一下，电脑即刻响应。",
    en: "Switch to shortcut mode and keep every daily shortcut at your fingertips — Cmd+Shift+4 to screenshot, Cmd+A to select all, Cmd+C/V to copy/paste, Cmd+Z to undo. One tap on your phone, instant action on your Mac.",
  },
  "scenes.quickCommands.details": {
    zh: [
      "编辑文档：全选 → 复制 → 粘贴，手机上三连点一气呵成",
      "随手截屏：点一下 Cmd+Shift+4，电脑秒进截图模式",
      "翻页浏览：方向键上下翻、Home/End 跳首尾，手不用碰键盘",
    ],
    en: [
      "Editing a doc? Select all → copy → paste. Three taps on your phone, done.",
      "Need a screenshot? Tap Cmd+Shift+4 — your Mac enters capture mode instantly.",
      "Browsing code or docs? Arrow keys, Home/End, Page Up/Down — no keyboard needed.",
    ],
  },
  "scenes.quickCommands.tip": {
    zh: "支持截屏、全选、复制粘贴、撤销重做、方向键、Home / End、PageUp / Down 等高频快捷键。",
    en: "Supports screenshot, select all, copy/paste, undo/redo, arrow keys, Home/End, PageUp/Down, and more.",
  },
  "scenes.quickCommands.theme": { zh: "快捷键，全在手心里。", en: "Every shortcut you use. Right in your palm." },

  // ── Flow ───────────────────────────────────
  "flow.heading": { zh: "四步，把手机变成**无线键鼠**", en: "Four steps to turn your phone into a **wireless keyboard & trackpad**" },
  "flow.subheading": { zh: "下载、授权、扫码、开用——两分钟的事", en: "Download, grant permission, scan, go — all in two minutes." },
  "flow.step01.title": { zh: "下载安装", en: "Download" },
  "flow.step01.subtitle": { zh: "免费下载 macOS 版，拖入应用程序文件夹", en: "Download the free macOS app. Drag to Applications." },
  "flow.step02.title": { zh: "开启权限", en: "Grant Access" },
  "flow.step02.subtitle": { zh: "首次启动按提示授权辅助功能，一次永久有效", en: "Grant Accessibility permission when prompted — once and done." },
  "flow.step03.pickOne": { zh: "任选其一", en: "Pick one" },
  "flow.choice.webchat.label": { zh: "扫码即连", en: "Scan to Connect" },
  "flow.choice.webchat.desc": { zh: "手机扫 App 内二维码，同 WiFi 秒连", en: "Scan the QR code in the app — same WiFi, instant connection." },
  "flow.choice.im.label": { zh: "IM 机器人", en: "IM Bot" },
  "flow.choice.im.desc": { zh: "飞书 / 钉钉 / 企微自建应用", en: "Feishu / DingTalk / WeCom" },
  "flow.step04.title": { zh: "随心控制", en: "Take Control" },
  "flow.step04.subtitle": { zh: "打字、触控、语音——三种姿势，随心切换", en: "Type, swipe, speak — three ways to control your Mac." },

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
    en: "Open **System Settings > Privacy & Security**, find the blocked TypeBridge entry, and click **\"Open Anyway\"**.",
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
    en: "TypeBridge simulates `Cmd+V` paste and keystrokes. On first launch, it will guide you to **System Settings > Privacy & Security > Accessibility** — just toggle TypeBridge on.",
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
    zh: "手机即键鼠：扫码把手机变成 Mac 的无线键盘和触控板。打字、控鼠标、语音输入，一部手机全搞定。",
    en: "Your phone becomes a wireless keyboard and trackpad for your Mac. Type, move the cursor, use your voice — all from your phone.",
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
