// UA 检测：区分 PC 桌面浏览器 / 移动端浏览器（含 IM 内置浏览器）
//
// v2 不再拦截 IM 内置浏览器（微信 / 钉钉 / 飞书 / QQ），因为新架构不依赖
// getUserMedia。UA 检测只做一件事：如果是 PC 桌面浏览器，显示"请用手机"
// 引导页；其他情况直接进入聊天流程。

export type DeviceKind = "pc" | "mobile";

export function detectDevice(ua?: string | null): DeviceKind {
  const u = (ua ?? navigator.userAgent ?? "").toLowerCase();
  if (!u) return "mobile"; // 保守：无 UA 默认当移动端

  // 典型移动端标识
  const mobileMarkers = [
    "android",
    "iphone",
    "ipad",
    "ipod",
    "harmonyos",
    "mobile",
    "micromessenger", // WeChat
    "dingtalk",
    "lark",
    "feishu",
    "wework",
    "qq/",
    " qq",
  ];
  for (const m of mobileMarkers) {
    if (u.includes(m)) return "mobile";
  }

  // 明确的桌面标识
  const desktopMarkers = ["windows nt", "macintosh", "linux x86_64", "cros"];
  for (const m of desktopMarkers) {
    if (u.includes(m)) return "pc";
  }

  // 兜底 mobile
  return "mobile";
}

/** 极简设备名推断，用于握手时告诉 server 这台设备大概是什么 */
export function simplifyDeviceLabel(ua?: string | null): string {
  const u = ua ?? navigator.userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(u)) return "iPhone";
  if (/Android/i.test(u)) return "Android";
  if (/Windows/i.test(u)) return "Windows";
  if (/Mac/i.test(u)) return "Mac";
  return "Unknown";
}
