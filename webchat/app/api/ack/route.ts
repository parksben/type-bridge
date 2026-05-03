// POST /api/ack — 桌面端回写消息注入结果。
//
// Auth: 桌面 ownerToken
// Request body:
//   { sessionId, messageId, success: bool, reason?: string }
// Response data: {}

import { NextRequest } from "next/server";
import {
  extractBearer,
  ok,
  err,
  tokenMatches,
} from "@/app/lib/auth";
import {
  getSession,
  saveSession,
  getMessage,
  saveMessage,
  gcSession,
  gcOldMessages,
} from "@/app/lib/storage";

export const runtime = "nodejs";

type Body = {
  sessionId?: unknown;
  messageId?: unknown;
  success?: unknown;
  reason?: unknown;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("BAD_REQUEST", "invalid json", 400);
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const success = body.success === true;
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  if (!sessionId || !messageId) {
    return err("BAD_REQUEST", "sessionId + messageId required", 400);
  }

  const token = extractBearer(req);
  if (!token) return err("BAD_TOKEN", "missing bearer token", 401);

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (!(await tokenMatches(token, session.ownerTokenHash))) {
    return err("BAD_TOKEN", "owner token mismatch", 401);
  }
  if (await gcSession(session)) return err("EXPIRED", "session expired", 410);

  // 续命心跳（ack 比 heartbeat 更频繁；省一次单独心跳调用）
  session.ownerLastSeenAt = Date.now();
  await saveSession(session);

  const msg = await getMessage(sessionId, messageId);
  if (!msg) return err("NOT_FOUND", "message not found", 404);

  msg.ack = {
    success,
    reason,
    at: Date.now(),
  };
  await saveMessage(sessionId, msg);

  void gcOldMessages(sessionId).catch(() => {});

  return ok({});
}
