// POST /api/handshake-result — 桌面端把 OTP 校验结果回写给中继。
//
// 桌面端从 poll-handshake 拿到 OTP 后做本地 sha256 比对：
//   - 通过 → POST { accepted: true, userToken: <newly issued> }
//     中继签发 userTokenHash，写到 session；同时把明文 userToken 临时存进
//     handshakeResult，让手机端 poll-status 取走（取走后立即清空）
//   - 不通过 → POST { accepted: false, reason: "INVALID_OTP" | "OTP_LOCKED" }
//     中继 incrementOtpAttempts；5 次后锁
//
// Auth: 桌面 ownerToken
// Request body:
//   { handshakeId, accepted: bool, userToken?: string, reason?: string }
// Response data: {}

import { NextRequest } from "next/server";
import {
  extractBearer,
  ok,
  err,
  tokenMatches,
  sha256Hex,
} from "@/app/lib/auth";
import {
  getSession,
  saveSession,
  gcSession,
  MAX_OTP_ATTEMPTS,
  BOUND_SESSION_TTL_MS,
} from "@/app/lib/storage";

export const runtime = "nodejs";

type Body = {
  sessionId?: unknown;
  handshakeId?: unknown;
  accepted?: unknown;
  userToken?: unknown;
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
  const handshakeId = typeof body.handshakeId === "string" ? body.handshakeId : "";
  const accepted = body.accepted === true;
  const userToken = typeof body.userToken === "string" ? body.userToken : null;
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  if (!sessionId || !handshakeId) {
    return err("BAD_REQUEST", "sessionId + handshakeId required", 400);
  }

  const token = extractBearer(req);
  if (!token) return err("BAD_TOKEN", "missing bearer token", 401);

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (!(await tokenMatches(token, session.ownerTokenHash))) {
    return err("BAD_TOKEN", "owner token mismatch", 401);
  }
  if (await gcSession(session)) return err("EXPIRED", "session expired", 410);

  if (!session.pendingHandshake || session.pendingHandshake.handshakeId !== handshakeId) {
    // 可能是手机端取消重新提交了；桌面端基于过时数据回的，忽略
    return ok({});
  }

  const now = Date.now();
  const deviceUa = session.pendingHandshake.deviceUa;

  if (accepted) {
    if (!userToken) {
      return err("BAD_REQUEST", "userToken required when accepted", 400);
    }
    session.userTokenHash = await sha256Hex(userToken);
    session.boundDeviceUa = deviceUa;
    session.boundAt = now;
    session.boundExpiresAt = now + BOUND_SESSION_TTL_MS;
    session.handshakeResult = {
      handshakeId,
      accepted: true,
      userToken,           // 明文临时存这里，poll-status 取走后清空
      decidedAt: now,
    };
    session.pendingHandshake = null;
    session.otpAttempts = 0;
  } else {
    session.otpAttempts += 1;
    const locked = session.otpAttempts >= MAX_OTP_ATTEMPTS;
    if (locked) session.otpLocked = true;
    session.handshakeResult = {
      handshakeId,
      accepted: false,
      reason: locked ? "OTP_LOCKED" : reason ?? "INVALID_OTP",
      decidedAt: now,
    };
    session.pendingHandshake = null;
  }

  await saveSession(session);
  return ok({});
}
