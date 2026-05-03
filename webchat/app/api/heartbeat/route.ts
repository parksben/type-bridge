// POST /api/heartbeat — 桌面端续命，告诉中继"我还在"。
//
// Auth: 桌面 ownerToken
// Body: 可选 { sessionId } (也可用 query)
// Response data: {}
//
// 60 秒未收到心跳的 session 会在下次 endpoint 入口 gcSession 时被清理。
// 桌面端建议每 20 秒打一次。

import { NextRequest } from "next/server";
import {
  extractBearer,
  ok,
  err,
  tokenMatches,
} from "@/app/lib/auth";
import { getSession, saveSession, gcSession } from "@/app/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionId) {
    try {
      const body = (await req.json()) as { sessionId?: unknown };
      if (typeof body.sessionId === "string") sessionId = body.sessionId;
    } catch {
      /* body 不是 json 也不是必须 */
    }
  }
  if (!sessionId) return err("BAD_REQUEST", "sessionId required", 400);

  const token = extractBearer(req);
  if (!token) return err("BAD_TOKEN", "missing bearer token", 401);

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (!(await tokenMatches(token, session.ownerTokenHash))) {
    return err("BAD_TOKEN", "owner token mismatch", 401);
  }
  if (await gcSession(session)) return err("EXPIRED", "session expired", 410);

  session.ownerLastSeenAt = Date.now();
  await saveSession(session);
  return ok({});
}
