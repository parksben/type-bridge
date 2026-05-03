// GET /api/pull — 桌面端拉取未消费的消息。
//
// Auth: 桌面 ownerToken
// Query: ?max=<int>  (default 5, max 5)
// Response data:
//   { messages: [{ messageId, clientMessageId, kind, text?, image?, ts }] }
//
// 行为：把符合条件的消息标记 pulled=true，pulledAt=now。
// 桌面端拿到后自行入注入队列；ack 通过 /api/ack 单独回写。

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
  saveMessage,
  listSessionMessages,
  gcSession,
} from "@/app/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  const max = Math.min(5, Math.max(1, Number(req.nextUrl.searchParams.get("max") || "5")));
  if (!sessionId) return err("BAD_REQUEST", "sessionId required", 400);

  const token = extractBearer(req);
  if (!token) return err("BAD_TOKEN", "missing bearer token", 401);

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (!(await tokenMatches(token, session.ownerTokenHash))) {
    return err("BAD_TOKEN", "owner token mismatch", 401);
  }
  if (await gcSession(session)) return err("EXPIRED", "session expired", 410);

  // 顺带续命 owner 心跳
  session.ownerLastSeenAt = Date.now();
  await saveSession(session);

  const all = await listSessionMessages(sessionId, 50);
  const fresh = all.filter((m) => !m.pulled).slice(0, max);

  // 标记 pulled
  const now = Date.now();
  for (const m of fresh) {
    m.pulled = true;
    m.pulledAt = now;
    await saveMessage(sessionId, m);
  }

  return ok({
    messages: fresh.map((m) => ({
      messageId: m.messageId,
      clientMessageId: m.clientMessageId,
      kind: m.kind,
      text: m.text,
      image: m.image,
      ts: m.ts,
    })),
  });
}
