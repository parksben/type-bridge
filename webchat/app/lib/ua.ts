// UA 检测：识别 PC 浏览器 / 微信内置 / 其他 IM 内置浏览器
//
// 设计原则：从严判定，假阴性宽容（少数极端 UA 没识别出来用户能正常进入聊天页），
// 假阳性零容忍（被错判进拦截页很糟糕）。
//
// 这个文件**纯函数 + 无副作用**，被 middleware.ts（Edge Runtime）和客户端
// 一起复用。不要 import 任何 Next.js / Node.js 专属模块。

export type DeviceCategory = "mobile" | "pc" | "wechat" | "im-browser";

const MOBILE_RE = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;
// 微信内置 WebView：iOS 和 Android 都带 "MicroMessenger"。WeChat 也有 "WeChat" 关键字（部分版本）
const WECHAT_RE = /MicroMessenger|WeChat\//i;
// 其他 IM 内置浏览器：钉钉 / 飞书 / QQ / 企微
const IM_BROWSER_RE = /DingTalk|Lark|Feishu|QQ\/|wxwork|MQQBrowser/i;

export function detectDevice(userAgent: string | null | undefined): DeviceCategory {
  const ua = userAgent || "";

  // 优先级：微信 > 其他 IM 内置 > 移动 > 桌面
  // 因为微信 UA 里同时带 MicroMessenger 和 Mobile，先判它
  if (WECHAT_RE.test(ua)) return "wechat";
  if (IM_BROWSER_RE.test(ua)) return "im-browser";
  if (MOBILE_RE.test(ua)) return "mobile";
  return "pc";
}

export function isMobileLike(category: DeviceCategory): boolean {
  return category === "mobile";
}

export function shouldBlock(category: DeviceCategory): boolean {
  return category === "pc" || category === "wechat" || category === "im-browser";
}
