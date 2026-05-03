// GET /api/poll-handshake — 桌面端长轮询，等待手机端提交 OTP。
//
// Auth: 桌面 ownerToken
// Query: 无
// Response data:
//   { handshakeId, otp, deviceUa }   — 有 pending 握手
//   或 204 No Content                 — 超时无握手
//
// 实现细节：Netlify Functions 单请求最多 26s（background）/ 10s（synchronous），
// 我们用同步 function，最长 hold ~8s 然后返回 204，由桌面端立即重发。
// 这样既避免超时挂起，又不会把网络打爆（高频空轮询）。

import { NextRequest } from "next/server";
import { extractBearer, ok, err, tokenMatches } from "@/app/lib/auth";
import { getSession, gcSession } from "@/app/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 15;

const POLL_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 250;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionId) return err("BAD_REQUEST", "sessionId required", 400);

  const token = extractBearer(req);
  if (!token) return err("BAD_TOKEN", "missing bearer token", 401);

  const initial = await getSession(sessionId);
  if (!initial) return err("NOT_FOUND", "session not found", 404);
  if (!(await tokenMatches(token, initial.ownerTokenHash))) {
    return err("BAD_TOKEN", "owner token mismatch", 401);
  }
  if (await gcSession(initial)) return err("EXPIRED", "session expired", 410);

  // 立即查一次
  if (initial.pendingHandshake) {
    return ok({
      handshakeId: initial.pendingHandshake.handshakeId,
      otp: initial.pendingHandshake.otp,
      deviceUa: initial.pendingHandshake.deviceUa,
    });
  }

  // Long poll：每 250ms 重读一次 session，直到有 pending 或超时
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const cur = await getSession(sessionId);
    if (!cur) return err("NOT_FOUND", "session vanished mid-poll", 404);
    if (cur.pendingHandshake) {
      return ok({
        handshakeId: cur.pendingHandshake.handshakeId,
        otp: cur.pendingHandshake.otp,
        deviceUa: cur.pendingHandshake.deviceUa,
      });
    }
  }

  // 无握手 → 204，桌面端立即再 poll
  return new Response(null, { status: 204 });
}
