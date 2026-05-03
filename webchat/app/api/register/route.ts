// POST /api/register — 桌面端启动会话时调用，注册 sessionId / OTP / auxCode。
//
// 桌面侧本地随机生成 OTP 和 auxCode，明文 OTP **不上送中继**，只送 sha256；
// 中继签发 ownerToken，桌面侧拿来作为后续所有 endpoint 的 Bearer。
//
// Request body:
//   { otpHash: <sha256 hex>, auxCode: <8-char base32> }
//
// Response data:
//   { sessionId, ownerToken, expiresAt }

import { NextRequest } from "next/server";
import {
  newSessionId,
  newToken,
  ok,
  err,
  sha256Hex,
} from "@/app/lib/auth";
import {
  saveSession,
  setAuxIndex,
  SESSION_TTL_MS,
  type Session,
} from "@/app/lib/storage";

export const runtime = "nodejs"; // Blobs 需要 Node runtime

type RegisterBody = {
  otpHash?: unknown;
  auxCode?: unknown;
};

export async function POST(req: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return err("BAD_REQUEST", "invalid json", 400);
  }

  const otpHash = typeof body.otpHash === "string" ? body.otpHash : "";
  const auxCode = typeof body.auxCode === "string" ? body.auxCode : "";

  if (!/^[0-9a-f]{64}$/.test(otpHash)) {
    return err("BAD_REQUEST", "otpHash must be 64-char hex sha256", 400);
  }
  if (!/^[A-Z2-7]{8}$/.test(auxCode)) {
    return err("BAD_REQUEST", "auxCode must be 8-char base32", 400);
  }

  const now = Date.now();
  const sessionId = newSessionId();
  const ownerToken = newToken();
  const ownerTokenHash = await sha256Hex(ownerToken);

  const session: Session = {
    sessionId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    boundExpiresAt: null,
    ownerTokenHash,
    userTokenHash: null,
    auxCode,
    otpHash,
    otpAttempts: 0,
    otpLocked: false,
    ownerLastSeenAt: now,
    boundDeviceUa: null,
    boundAt: null,
    pendingHandshake: null,
    handshakeResult: null,
  };

  await saveSession(session);
  await setAuxIndex(auxCode, sessionId);

  return ok({
    sessionId,
    ownerToken,
    expiresAt: session.expiresAt,
  });
}
