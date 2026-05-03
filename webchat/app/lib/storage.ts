// Netlify Blobs 数据访问层 — 中继侧的会话 / 消息存储抽象。
//
// 两个 namespace：
//   - sessions      key: <sessionId>           value: Session
//   - messages      key: <sessionId>/<messageId>  value: Message
//   - aux-index     key: <auxCode>             value: { sessionId }
//
// 所有 endpoint 入口先调一次 inlineGc()，惰性删过期 session / 已消费 message，
// 避免依赖 cron job。

import { getStore } from "@netlify/blobs";

// ──────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────

export type Session = {
  sessionId: string;
  createdAt: number;
  expiresAt: number;                  // 握手前 TTL（默认 5 分钟）
  boundExpiresAt: number | null;      // 握手成功后 TTL（默认 24 小时）
  ownerTokenHash: string;
  userTokenHash: string | null;
  auxCode: string;                    // 8 字符 base32 friendly
  otpHash: string;                    // sha256(otp)
  otpAttempts: number;                // 0..5；5 表示已锁
  otpLocked: boolean;
  ownerLastSeenAt: number;            // heartbeat 更新；60s 无心跳即 GC
  boundDeviceUa: string | null;
  boundAt: number | null;
  /** 待裁决的握手请求 — OTP 明文短暂存于此供桌面端 poll-handshake 取走校验。
   *  会话作废 / 裁决完毕后立即清空；不进任何日志。 */
  pendingHandshake: {
    handshakeId: string;
    otp: string;
    deviceUa: string;
    submittedAt: number;
  } | null;
  /** 桌面裁决结果 */
  handshakeResult: {
    handshakeId: string;
    accepted: boolean;
    /** accepted=true 时把 userToken 临时塞这里给手机端 poll-status 取走 */
    userToken?: string;
    reason?: string;
    decidedAt: number;
  } | null;
};

export type MessageKind = "text" | "image";

export type StoredMessage = {
  messageId: string;
  clientMessageId: string;
  kind: MessageKind;
  text?: string;
  image?: { data: string; mime: string };
  ts: number;
  pulled: boolean;
  pulledAt: number | null;
  ack: { success: boolean; reason?: string; at: number } | null;
};

export type AuxIndex = { sessionId: string };

// ──────────────────────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────────────────────

export const SESSION_TTL_MS = 5 * 60 * 1000;
export const BOUND_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const OWNER_HEARTBEAT_GRACE_MS = 60 * 1000;
export const MESSAGE_PULLED_GC_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

// ──────────────────────────────────────────────────────────────
// Stores（懒初始化以方便单元测试 mock）
// ──────────────────────────────────────────────────────────────

function sessionsStore() {
  return getStore({ name: "webchat-sessions", consistency: "strong" });
}
function messagesStore() {
  return getStore({ name: "webchat-messages", consistency: "strong" });
}
function auxStore() {
  return getStore({ name: "webchat-aux", consistency: "strong" });
}

// ──────────────────────────────────────────────────────────────
// Sessions
// ──────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<Session | null> {
  const data = await sessionsStore().get(sessionId, { type: "json" });
  return (data as Session | null) ?? null;
}

export async function saveSession(session: Session): Promise<void> {
  await sessionsStore().setJSON(session.sessionId, session);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await sessionsStore().delete(sessionId);
}

export async function setAuxIndex(auxCode: string, sessionId: string): Promise<void> {
  await auxStore().setJSON(auxCode, { sessionId } satisfies AuxIndex);
}

export async function lookupAux(auxCode: string): Promise<string | null> {
  const data = (await auxStore().get(auxCode, { type: "json" })) as AuxIndex | null;
  return data?.sessionId ?? null;
}

export async function deleteAuxIndex(auxCode: string): Promise<void> {
  await auxStore().delete(auxCode);
}

// ──────────────────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────────────────

export async function saveMessage(sessionId: string, msg: StoredMessage): Promise<void> {
  await messagesStore().setJSON(`${sessionId}/${msg.messageId}`, msg);
}

export async function getMessage(sessionId: string, messageId: string): Promise<StoredMessage | null> {
  const data = await messagesStore().get(`${sessionId}/${messageId}`, { type: "json" });
  return (data as StoredMessage | null) ?? null;
}

export async function deleteMessage(sessionId: string, messageId: string): Promise<void> {
  await messagesStore().delete(`${sessionId}/${messageId}`);
}

/** 列出某个 session 的所有消息 key（不读 body）。Blobs list 是 paginated 的，
 *  我们只需一页（最多 5 条）就够了，桌面端 pull max=5。 */
export async function listSessionMessages(sessionId: string, max = 5): Promise<StoredMessage[]> {
  const store = messagesStore();
  const result = await store.list({ prefix: `${sessionId}/` });
  // result.blobs: [{ key, etag }, ...]；按 key 排序保证 FIFO
  const keys = result.blobs.map((b) => b.key).sort();
  const out: StoredMessage[] = [];
  for (const key of keys) {
    if (out.length >= max) break;
    const msg = (await store.get(key, { type: "json" })) as StoredMessage | null;
    if (msg) out.push(msg);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Inline GC — 每次 endpoint 入口惰性清理
// ──────────────────────────────────────────────────────────────

export async function gcSession(session: Session): Promise<boolean> {
  const now = Date.now();

  // owner 心跳超时
  if (now - session.ownerLastSeenAt > OWNER_HEARTBEAT_GRACE_MS) {
    await deleteSession(session.sessionId);
    await deleteAuxIndex(session.auxCode);
    return true;
  }

  // 未握手且超过 5 分钟
  if (!session.userTokenHash && now > session.expiresAt) {
    await deleteSession(session.sessionId);
    await deleteAuxIndex(session.auxCode);
    return true;
  }

  // 已握手且超过 24 小时
  if (session.boundExpiresAt && now > session.boundExpiresAt) {
    await deleteSession(session.sessionId);
    await deleteAuxIndex(session.auxCode);
    return true;
  }

  return false;
}

/** 清理已 pull 超过 5 分钟的旧消息（懒触发，由 pull / send / ack 入口调用） */
export async function gcOldMessages(sessionId: string): Promise<void> {
  const now = Date.now();
  const store = messagesStore();
  const result = await store.list({ prefix: `${sessionId}/` });
  for (const blob of result.blobs) {
    const msg = (await store.get(blob.key, { type: "json" })) as StoredMessage | null;
    if (!msg) continue;
    if (msg.pulled && msg.pulledAt && now - msg.pulledAt > MESSAGE_PULLED_GC_MS) {
      await store.delete(blob.key);
    }
  }
}
