/// 运行时错误字符串本地化。
///
/// Rust / Go 后端在错误返回里直接拼中文（保持源代码简洁、避免给 sidecar 也搬一套
/// dict），前端 UI 在显示这些字符串前过一层 `localizeRuntime`：
///
/// - 命中已知 zh 模板（精确匹配 / 前缀匹配 / 正则捕获）→ 按当前语言返回翻译
/// - 不命中 → 原样返回（向后兼容；未知错误总比"找不到 key"显示更有帮助）
///
/// 当后端新增错误字符串时，需要在下面 PATTERNS 里追加一条；忘记追加只会让
/// 英文 UI 显示中文原文，不会崩。
///
/// 同步必读：dict.ts 是 t() 的字典；这里是 backend → 前端的字符串映射，
/// 两者职责不同。
import { useAppStore } from "../store";
import type { Lang } from "../store";

interface Translation {
  zh: string;
  en: string;
}

interface Pattern {
  /// 精确匹配 / 前缀匹配 / 正则捕获其一
  match: (s: string) => Record<string, string> | null;
  /// 模板字符串。`{0}/{1}/...` 走 capture，`{tail}` 走 prefix 剩余
  out: Translation;
}

function exact(zh: string, t: Translation): Pattern {
  return {
    match: (s) => (s === zh ? {} : null),
    out: t,
  };
}

function prefix(zhPrefix: string, enPrefix: string, separator = ""): Pattern {
  return {
    match: (s) => (s.startsWith(zhPrefix) ? { tail: s.slice(zhPrefix.length) } : null),
    out: {
      zh: `${zhPrefix}${separator}{tail}`,
      en: `${enPrefix}${separator}{tail}`,
    },
  };
}

function regex(re: RegExp, t: Translation): Pattern {
  return {
    match: (s) => {
      const m = re.exec(s);
      if (!m) return null;
      const params: Record<string, string> = {};
      for (let i = 1; i < m.length; i++) params[String(i - 1)] = m[i] ?? "";
      return params;
    },
    out: t,
  };
}

function fmt(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
}

const PATTERNS: Pattern[] = [
  // injector.rs
  exact("当前前台是 TypeBridge 自己，请先切换到目标应用窗口", {
    zh: "当前前台是 TypeBridge 自己，请先切换到目标应用窗口",
    en: "TypeBridge itself is in the foreground — switch to your target app's window first",
  }),
  exact("NSPasteboard 写入文本失败", {
    zh: "NSPasteboard 写入文本失败",
    en: "Failed to write text to NSPasteboard",
  }),
  exact("NSPasteboard 写入图片失败", {
    zh: "NSPasteboard 写入图片失败",
    en: "Failed to write image to NSPasteboard",
  }),

  // queue.rs
  exact("已取消", { zh: "已取消", en: "Cancelled" }),
  exact("辅助功能权限未授予", {
    zh: "辅助功能权限未授予",
    en: "Accessibility permission not granted",
  }),
  prefix("读取图片失败: ", "Failed to read image: "),

  // about.rs
  prefix("初始化 HTTP client 失败：", "Failed to init HTTP client: "),
  prefix("请求最新版本接口失败：", "Latest-version request failed: "),
  regex(/^接口返回 (.+)$/, {
    zh: "接口返回 {0}",
    en: "API returned {0}",
  }),
  prefix("解析最新版本响应失败：", "Failed to parse latest-version response: "),
  exact("dev 构建不支持自动更新", {
    zh: "dev 构建不支持自动更新",
    en: "Dev builds do not support auto-update",
  }),
  exact("无法定位 ~/Downloads 目录", {
    zh: "无法定位 ~/Downloads 目录",
    en: "Could not locate ~/Downloads directory",
  }),
  prefix("创建 Downloads 目录失败：", "Failed to create Downloads directory: "),
  prefix("打开 .dmg 失败：", "Failed to open .dmg: "),
  prefix("发起下载请求失败：", "Failed to issue download request: "),
  regex(/^下载失败：HTTP (.+)$/, {
    zh: "下载失败：HTTP {0}",
    en: "Download failed: HTTP {0}",
  }),
  prefix("创建下载文件失败：", "Failed to create download file: "),
  prefix("下载流中断：", "Download stream interrupted: "),
  prefix("写入下载文件失败：", "Failed to write download file: "),

  // sidecar.rs
  exact("selftest 通道被释放", {
    zh: "selftest 通道被释放",
    en: "Selftest channel was released",
  }),
  exact("selftest 超时（10s），请检查网络或 sidecar 进程状态", {
    zh: "selftest 超时（10s），请检查网络或 sidecar 进程状态",
    en: "Selftest timed out (10s) — check your network or the sidecar process",
  }),

  // webchat_server.rs
  exact("未检测到可用的局域网 IP（请先连接 WiFi 或以太网）", {
    zh: "未检测到可用的局域网 IP（请先连接 WiFi 或以太网）",
    en: "No usable LAN IP detected — connect to WiFi or Ethernet first",
  }),
  exact("server 已停止", {
    zh: "server 已停止",
    en: "Server has stopped",
  }),
  exact("端口 8723-8732 全部被占用，请关闭占用这些端口的其他应用后重试", {
    zh: "端口 8723-8732 全部被占用，请关闭占用这些端口的其他应用后重试",
    en: "Ports 8723–8732 are all in use — close the apps holding them and retry",
  }),

  // feishu-bridge/commands.go
  regex(/^App ID 无效（code=(\d+)）：(.*)$/, {
    zh: "App ID 无效（code={0}）：{1}",
    en: "Invalid App ID (code={0}): {1}",
  }),
  regex(/^App Secret 不匹配（code=(\d+)）：(.*)$/, {
    zh: "App Secret 不匹配（code={0}）：{1}",
    en: "App Secret mismatch (code={0}): {1}",
  }),
  prefix("网络不通：", "Network unreachable: "),

  // wecom-bridge/commands.go
  exact("长连接尚未完成订阅（aibot_subscribe 鉴权未通过或连接已断）", {
    zh: "长连接尚未完成订阅（aibot_subscribe 鉴权未通过或连接已断）",
    en: "Long-connection subscription not ready (aibot_subscribe auth failed or connection dropped)",
  }),
];

function pickLang(): Lang {
  return useAppStore.getState().language || "zh";
}

/// 把 backend 给的 zh 错误字符串映射到当前语言。未命中模板则原样返回。
export function localizeRuntime(msg: string | null | undefined): string {
  if (!msg) return msg ?? "";
  const lang = pickLang();
  if (lang === "zh") return msg; // 走 fast path，避免无谓匹配
  for (const p of PATTERNS) {
    const params = p.match(msg);
    if (params) return fmt(p.out[lang], params);
  }
  return msg;
}
