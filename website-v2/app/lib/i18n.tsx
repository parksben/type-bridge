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
  "nav.tagline": { zh: "手机即键盘", en: "Phone as Keyboard" },
  "nav.brandAria": { zh: "TypeBridge — 手机即键盘", en: "TypeBridge — Phone as Keyboard" },
  "nav.githubAria": { zh: "查看 TypeBridge GitHub 仓库", en: "View TypeBridge on GitHub" },

  // ── Hero ───────────────────────────────────
  "hero.headline": { zh: "手机即键盘", en: "Your Phone Is the Keyboard" },
  "hero.subtitle": {
    zh: "把你的**手机**变成电脑的**无线键盘**。说话、打字、发图片——手机发一条消息，电脑输入框直接落字。",
    en: "Turn your **phone** into a **wireless keyboard** for your Mac. Speak, type, or send an image — your phone message appears right where your cursor is.",
  },
  "hero.ctaDownload": { zh: "免费下载", en: "Download Free" },
  "hero.ctaHowto": { zh: "如何使用", en: "How It Works" },
  "hero.desktopText": { zh: "手机即键盘", en: "Phone as Keyboard" },
  "hero.phoneUserMsg": { zh: "手机及键盘", en: "Phone & Keyboard" },

  // ── Concept banner channel labels ──────────
  "channel.webchat": { zh: "WebChat", en: "WebChat" },
  "channel.feishu": { zh: "飞书", en: "Feishu" },
  "channel.dingtalk": { zh: "钉钉", en: "DingTalk" },
  "channel.wecom": { zh: "企微", en: "WeCom" },

  // ── Scenes ─────────────────────────────────
  "scenes.heading": {
    zh: "每一个场景，都在验证**手机即键盘**",
    en: "Every use case proves: **Your Phone Is the Keyboard**",
  },
  "scenes.subheading": { zh: "5 个典型用法，找到你的那个", en: "Five ways to use it. Pick yours." },
  "scenes.tipLabel": { zh: "提示：", en: "Tip: " },
  "scenes.voiceToText.title": { zh: "语音输入，桌面直达", en: "Speak, and It Appears on Your Mac" },
  "scenes.voiceToText.subtitle": { zh: "说一句话，就出现在电脑上", en: "Say it on your phone. See it on your desktop." },
  "scenes.voiceToText.description": {
    zh: "对着手机说话，飞书、钉钉、企微帮你转成文字，再自动送进电脑当前输入框。写邮件、回消息、填表单——嘴就是键盘。",
    en: "Speak into your phone — Feishu, DingTalk, or WeCom transcribes it and sends it straight to your Mac's active input field. Compose emails, reply to messages, fill forms — your voice is the keyboard.",
  },
  "scenes.voiceToText.details": {
    zh: [
      "微信回消息 → 手机说一句 → 电脑聊天框直接出现文字",
      "VSCode 写注释 → 手机口述 → 编辑器里实时落字",
      "Slack / Teams 回复 → 不想切窗口打字 → 手机一句话搞定",
    ],
    en: [
      "Reply on WeChat → speak once → text lands in the chat box on your Mac",
      "Write a comment in VSCode → dictate on your phone → appears inline in the editor",
      "Answer in Slack / Teams → no need to switch windows → one spoken sentence does it",
    ],
  },
  "scenes.voiceToText.tip": {
    zh: "打开「自动提交」开关，说完话连回车都不用按。",
    en: "Turn on \"Auto-submit\" and you won't even need to press Enter.",
  },
  "scenes.voiceToText.theme": { zh: "把嘴变成键盘。", en: "Your voice is the keyboard." },

  "scenes.aiCoding.title": { zh: "AI 编程，动口不动手", en: "Code with AI — Just Speak" },
  "scenes.aiCoding.subtitle": { zh: "说一句指令，AI 就开始写代码", en: "Say a command. AI starts coding." },
  "scenes.aiCoding.description": {
    zh: "在 Cursor、Copilot Chat 里，用手机说出你的需求——「帮我重构这个函数」「加一个错误处理」——AI 收到完整指令立刻执行，你甚至不用碰键盘。",
    en: "In Cursor or Copilot Chat, speak your request — \"Refactor this function\" or \"Add error handling\" — and the AI gets the full instruction instantly. You never touch the keyboard.",
  },
  "scenes.aiCoding.details": {
    zh: [
      "手机说「给这段代码写单测」→ Cursor 对话栏收到指令 → AI 自动生成",
      "重构时不想打断思路 → 手机口述需求 → AI 继续干活",
      "开会时想到一个 bug → 手机说给 AI → 回来代码已修好",
    ],
    en: [
      "Say \"Write unit tests for this\" → appears in Cursor chat → AI generates them",
      "Don't break your flow during a refactor → describe the change on your phone → AI keeps working",
      "Spot a bug during a meeting → tell AI on your phone → come back to fixed code",
    ],
  },
  "scenes.aiCoding.tip": {
    zh: "口头描述往往比打字更准确——尤其是复杂的重构需求。",
    en: "Speaking is often more precise than typing — especially for complex refactoring instructions.",
  },
  "scenes.aiCoding.theme": { zh: "给 AI 配一个声音遥控器。", en: "A voice remote for your AI." },

  "scenes.docProduction.title": { zh: "写文档，边说边出稿", en: "Write Docs by Speaking" },
  "scenes.docProduction.subtitle": { zh: "说话就是写作，不敲一个字", en: "Talk it out. Zero typing." },
  "scenes.docProduction.description": {
    zh: "写周报、技术文档、会议纪要——对着手机边想边说，文字实时流进电脑上的编辑器。说完就是草稿，不用事后整理。",
    en: "Weekly reports, technical docs, meeting notes — think out loud into your phone, and the text streams into your Mac's editor in real time. What you say is your first draft.",
  },
  "scenes.docProduction.details": {
    zh: [
      "写周报 → 手机逐条口述 → Notion / 飞书文档里逐行出现",
      "写技术文档 → 手机描述思路 → Markdown 编辑器实时生成段落",
      "会议刚结束 → 趁记忆新鲜口述纪要 → 电脑上直接有文字",
    ],
    en: [
      "Weekly report → dictate bullet by bullet → appears in Notion or Feishu Docs",
      "Technical doc → describe your thinking → Markdown editor fills in real time",
      "Meeting just ended → capture notes while fresh → text is already on your Mac",
    ],
  },
  "scenes.docProduction.tip": {
    zh: "中文语音转文字可达 200+ 字/分钟，比键盘快一倍以上。",
    en: "Speech-to-text reaches 200+ characters/minute — over twice as fast as typing.",
  },
  "scenes.docProduction.theme": { zh: "让文档以说话的速度产出。", en: "Docs at the speed of speech." },

  "scenes.crossDevice.title": { zh: "跨设备粘贴，一步到位", en: "Cross-Device Paste, One Step" },
  "scenes.crossDevice.subtitle": { zh: "手机上看到什么，电脑上就有什么", en: "See it on your phone. Have it on your Mac." },
  "scenes.crossDevice.description": {
    zh: "手机上看到一个网址、一段代码、一个地址——发给 IM 机器人，电脑输入框里直接出现。不用「复制→发给自己→再复制→粘贴」那套老流程。",
    en: "See a URL, code snippet, or address on your phone — send it to the bot, and it lands right in your Mac's input field. Skip the old \"copy → send to self → copy again → paste\" routine.",
  },
  "scenes.crossDevice.details": {
    zh: [
      "手机浏览器看到网址 → 复制发给机器人 → 电脑地址栏直接出现",
      "手机收到一段 SQL → 转发给机器人 → 终端 / 编辑器里直接到位",
      "截图发给机器人 → 自动存到电脑剪贴板 → 一键粘贴",
    ],
    en: [
      "See a URL in your phone browser → send to bot → appears in your Mac's address bar",
      "Receive a SQL snippet on your phone → forward to bot → lands in your terminal or editor",
      "Send a screenshot to the bot → auto-saved to Mac clipboard → paste anywhere",
    ],
  },
  "scenes.crossDevice.tip": {
    zh: "比 Airdrop 快，比微信文件传输更方便。",
    en: "Faster than AirDrop. Simpler than messaging yourself.",
  },
  "scenes.crossDevice.theme": { zh: "手机就是电脑的剪贴板。", en: "Your phone is your Mac's clipboard." },

  "scenes.teamCollab.title": { zh: "团队共享键盘", en: "A Shared Keyboard for Your Team" },
  "scenes.teamCollab.subtitle": { zh: "群聊发一条，全队电脑同时落字", en: "One message in the group chat. Every team member's Mac gets it." },
  "scenes.teamCollab.description": {
    zh: "团队群聊里 @ 机器人发指令或数据——IP 地址、配置参数、部署命令——所有在线成员的电脑输入框同步收到。运维、开发、测试，一个群搞定。",
    en: "In a team chat, @ the bot with a command or data — an IP address, config value, deploy command — and every online team member's Mac receives it simultaneously. Ops, dev, QA — one group chat rules them all.",
  },
  "scenes.teamCollab.details": {
    zh: [
      "运维发「ssh deploy@10.0.1.5」→ 同事终端直接出现",
      "群里贴一段 JSON 配置 → 开发者编辑器里同步到位",
      "发布前发「确认上线」→ 全队电脑同时弹出提示",
    ],
    en: [
      "Ops sends \"ssh deploy@10.0.1.5\" → appears in a teammate's terminal",
      "Post a JSON config in the group → lands in developers' editors simultaneously",
      "Before a release, send \"Confirm deploy\" → everyone's Mac shows it at once",
    ],
  },
  "scenes.teamCollab.tip": {
    zh: "群聊消息是广播模式——一条消息，全队同步。",
    en: "Group messages broadcast to everyone — one message, your whole team in sync.",
  },
  "scenes.teamCollab.theme": { zh: "一条消息，全队同步。", en: "One message. Whole team in sync." },

  // ── Flow ───────────────────────────────────
  "flow.heading": { zh: "把**手机**变成**键盘**，只需四步", en: "Turn your **phone** into a **keyboard** in four steps" },
  "flow.subheading": { zh: "下载、打开、连接、落字——两分钟搞定", en: "Download, launch, connect, type — done in two minutes" },
  "flow.step01.title": { zh: "下载 App", en: "Download" },
  "flow.step01.subtitle": { zh: "下载 macOS 版，免费安装", en: "Download the macOS app — free" },
  "flow.step02.title": { zh: "打开 App", en: "Launch" },
  "flow.step02.subtitle": { zh: "按提示开启系统授权", en: "Grant permissions when prompted" },
  "flow.step03.pickOne": { zh: "任选其一", en: "Pick one" },
  "flow.choice.webchat.label": { zh: "扫码 WebChat", en: "Scan QR (WebChat)" },
  "flow.choice.webchat.desc": { zh: "同 WiFi 手机扫码即连", en: "Same WiFi, scan to connect" },
  "flow.choice.im.label": { zh: "连接 IM 机器人", en: "Connect IM Bot" },
  "flow.choice.im.desc": { zh: "飞书 / 钉钉 / 企微自建应用", en: "Feishu / DingTalk / WeCom" },
  "flow.step04.title": { zh: "桌面落字", en: "Type on Desktop" },
  "flow.step04.subtitle": { zh: "文字、图片、语音转写，直达输入框", en: "Text, images, voice — all land in your input field" },

  // ── Download ───────────────────────────────
  "download.heading": { zh: "下载 & 安装", en: "Download & Install" },
  "download.appleSilicon": { zh: "Apple Silicon", en: "Apple Silicon" },
  "download.appleSiliconChip": { zh: "M1 / M2 / M3 / M4", en: "M1 / M2 / M3 / M4" },
  "download.intel": { zh: "Intel", en: "Intel" },
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
  "footer.tagline": { zh: "手机即键盘", en: "Phone as Keyboard" },
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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("zh");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLangState(detectLanguage());
    setReady(true);
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try { localStorage.setItem("tb-lang", newLang); } catch {}
    document.documentElement.lang = newLang === "zh" ? "zh-CN" : "en";
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
    // Render nothing until we've read localStorage to avoid flash of wrong language
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
