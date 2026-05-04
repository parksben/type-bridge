// localStorage 持久化：
// - 持久 clientId（每台设备首次访问生成一个 UUID，之后保持不变，让 server 能区分同一手机的重复扫码）
// - sessionId + userToken（握手成功后，刷新页面尝试复用）

const KEY_CLIENT_ID = "tb_webchat_client_id";
const KEY_BINDING = "tb_webchat_binding";

interface Binding {
  /** server 会话 id（ses_xxx），刷新时和 URL 的 ?s= 比对 */
  sessionId: string;
  userToken: string;
  /** 签发时间戳 ms */
  issuedAt: number;
}

export function getOrCreateClientId(): string {
  try {
    const existing = localStorage.getItem(KEY_CLIENT_ID);
    if (existing) return existing;
    const newId = `cli_${randHex(16)}`;
    localStorage.setItem(KEY_CLIENT_ID, newId);
    return newId;
  } catch {
    // localStorage 不可用（无痕模式）时退化为 session-scoped id
    return `cli_${randHex(16)}`;
  }
}

export function getBinding(): Binding | null {
  try {
    const raw = localStorage.getItem(KEY_BINDING);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Binding;
    if (!parsed.sessionId || !parsed.userToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBinding(b: Binding) {
  try {
    localStorage.setItem(KEY_BINDING, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

export function clearBinding() {
  try {
    localStorage.removeItem(KEY_BINDING);
  } catch {
    /* ignore */
  }
}

function randHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  (crypto || (globalThis as unknown as { crypto: Crypto }).crypto).getRandomValues(
    buf,
  );
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newClientMessageId(): string {
  return `cm_${Date.now().toString(36)}${randHex(4)}`;
}
