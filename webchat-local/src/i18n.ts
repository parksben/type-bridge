/// 移动端 WebChat 极简 i18n。语言决定优先级：
///   1) URL ?lang=zh|en（桌面 Rust server 根据 Settings.language 注入）
///   2) localStorage tb_webchat_lang（曾经访问过的同 host 复用）
///   3) navigator.language 启发式（zh* → zh，否则 en）
///
/// 不做响应式切换 —— 移动端进来后语言固定到页面销毁。简化心智模型。

const LS_KEY = "tb_webchat_lang";

export type Lang = "zh" | "en";

const ZH = {
  app: {
    otpInvalid: "验证码错误，请重试",
    otpLocked: "验证码已锁定",
    sessionExpired: "会话已过期",
    handshakeFailed: "握手失败",
  },

  handshake: {
    title: "输入验证码",
    desc: "在桌面 TypeBridge 的 WebChat 面板上查看 6 位数字",
    verifying: "验证中",
    confirm: "确认",
  },

  error: {
    titleNoSession: "请用桌面 App 扫码",
    titleOtpLocked: "验证码已锁定",
    titleSessionExpired: "会话已过期",
    titleServerClosed: "桌面已关闭 WebChat",
    titleUnknown: "出错了",
    bodyNoSession:
      "当前链接没有会话信息。请在 Mac 打开 TypeBridge，进入「连接 IM 应用 → WebChat」，点「启动会话」后用这台手机扫描桌面上的二维码。",
    bodyOtpLocked:
      "验证码错误次数过多，会话已锁定。请在桌面 TypeBridge 上点「重启会话」生成新的验证码。",
    bodySessionExpired:
      "5 分钟内未完成握手，会话已过期。请在桌面 TypeBridge 上点「重启会话」生成新的二维码。",
    bodyServerClosed:
      "桌面 TypeBridge 已关闭 WebChat 或应用已退出。请在桌面重新「启动会话」后再扫码。",
    bodyUnknown: "会话状态异常，请在桌面重新启动 WebChat 会话。",
  },

  chat: {
    headerHint: "消息将注入到桌面当前聚焦的输入框",
    statusConnected: "已连接",
    statusReconnecting: "重连中",
    emptyHint: "发出去的每一条消息会自动写入你\n桌面当前聚焦的输入框。",
    emptyHintTry: "可以试试发一条文本，或点图片按钮拍照 / 上传。",
  },

  composer: {
    placeholder: "输入消息…",
    placeholderImageReady: "图片已就绪，点发送",
    sendAria: "发送",
    imagePickAria: "发送图片",
    imageRemoveAria: "移除图片",
    imageProcessFail: "图片处理失败",
    shortcutsExpand: "展开快捷键",
    shortcutsCollapse: "收起快捷键",
    shortcutEnter: "回车",
    shortcutBackspace: "删除",
    shortcutSpace: "空格",
    shortcutArrowUp: "上",
    shortcutArrowDown: "下",
    shortcutArrowLeft: "左",
    shortcutArrowRight: "右",
    shortcutSendFailed: "按键发送失败",
  },

  bubble: {
    sending: "发送中",
    delivered: "已送达",
    sendFailed: "发送失败",
  },

  pcBlock: {
    title: "请用手机扫码",
    bodyPart1: "WebChat 是 ",
    bodyBold: "手机端输入桥",
    bodyPart2: " —— 在手机上发消息，桌面端自动注入到焦点输入框。",
    bodyPart3: "用电脑打开本页面没有意义，请用手机扫描桌面 TypeBridge 上的二维码。",
    howTitle: "怎么扫？",
    howStep1: "在 Mac 打开 TypeBridge，进入「连接 IM 应用 → WebChat」",
    howStep2: "点「启动会话」生成二维码",
    howStep3: "确保手机和电脑在同一个 WiFi 下，用手机相机扫码",
  },
};

type Dict = typeof ZH;

const EN: Dict = {
  app: {
    otpInvalid: "Wrong code, please try again",
    otpLocked: "Code locked",
    sessionExpired: "Session expired",
    handshakeFailed: "Handshake failed",
  },

  handshake: {
    title: "Enter the code",
    desc: "Find the 6-digit code in the desktop TypeBridge WebChat panel",
    verifying: "Verifying",
    confirm: "Confirm",
  },

  error: {
    titleNoSession: "Scan from desktop app",
    titleOtpLocked: "Code locked",
    titleSessionExpired: "Session expired",
    titleServerClosed: "Desktop WebChat closed",
    titleUnknown: "Something went wrong",
    bodyNoSession:
      "No session info in this link. Open TypeBridge on your Mac, go to \"Connect → WebChat\", click \"Start session\", and scan the QR with this phone.",
    bodyOtpLocked:
      "Too many wrong codes — the session is locked. Click \"Restart session\" in desktop TypeBridge to generate a new code.",
    bodySessionExpired:
      "Handshake not completed within 5 minutes — the session expired. Click \"Restart session\" in desktop TypeBridge for a new QR.",
    bodyServerClosed:
      "Desktop TypeBridge has closed WebChat or the app has quit. Restart the session on the desktop and scan again.",
    bodyUnknown: "Session in an unexpected state — restart the WebChat session on the desktop.",
  },

  chat: {
    headerHint: "Messages are injected into your focused desktop input",
    statusConnected: "Connected",
    statusReconnecting: "Reconnecting",
    emptyHint: "Every message you send is auto-written into\nyour focused desktop input.",
    emptyHintTry: "Try sending a text, or tap the image button to capture / upload a photo.",
  },

  composer: {
    placeholder: "Type a message…",
    placeholderImageReady: "Image ready — tap send",
    sendAria: "Send",
    imagePickAria: "Send image",
    imageRemoveAria: "Remove image",
    imageProcessFail: "Image processing failed",
    shortcutsExpand: "Show shortcuts",
    shortcutsCollapse: "Hide shortcuts",
    shortcutEnter: "Enter",
    shortcutBackspace: "Backspace",
    shortcutSpace: "Space",
    shortcutArrowUp: "Up",
    shortcutArrowDown: "Down",
    shortcutArrowLeft: "Left",
    shortcutArrowRight: "Right",
    shortcutSendFailed: "Key send failed",
  },

  bubble: {
    sending: "Sending",
    delivered: "Delivered",
    sendFailed: "Send failed",
  },

  pcBlock: {
    title: "Open on your phone",
    bodyPart1: "WebChat is a ",
    bodyBold: "phone-side input bridge",
    bodyPart2: " — type on your phone and it auto-injects into your focused desktop input.",
    bodyPart3: "Opening this page on a computer doesn't help. Scan the QR shown in desktop TypeBridge with your phone.",
    howTitle: "How to scan?",
    howStep1: "Open TypeBridge on your Mac, go to \"Connect → WebChat\"",
    howStep2: "Click \"Start session\" to generate a QR",
    howStep3: "Make sure phone & computer are on the same WiFi, then scan with your phone camera",
  },
};

function detectLang(): Lang {
  if (typeof window === "undefined") return "zh";

  // 1) URL query
  const params = new URLSearchParams(window.location.search);
  const q = params.get("lang");
  if (q === "zh" || q === "en") {
    try {
      window.localStorage.setItem(LS_KEY, q);
    } catch {}
    return q;
  }

  // 2) localStorage
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {}

  // 3) navigator.language
  const nav = (navigator.language || "").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

const CURRENT_LANG: Lang = detectLang();
const DICT: Dict = CURRENT_LANG === "en" ? EN : ZH;

type Leaves<T> = T extends string
  ? ""
  : { [K in keyof T]: K extends string ? `${K}` | `${K}.${Leaves<T[K]>}` : never }[keyof T];

type Trim<S extends string> = S extends `${infer X}.` ? X : S;
export type TKey = Trim<Leaves<Dict>>;

function lookup(key: string): string {
  const parts = key.split(".");
  let cur: any = DICT;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = cur[p];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}

export function t(key: TKey): string {
  return lookup(key);
}

export function getLang(): Lang {
  return CURRENT_LANG;
}
