// POST /api/handshake — 手机端扫码进入聊天页后输入 OTP，提交握手请求。
//
// OTP 校验**不在中继**做（中继只存哈希），中继把 OTP 转发到桌面端 poll-handshake，
// 由桌面端本地校验并通过 /api/handshake-result 回写裁决。
//
// 这种设计的好处：
//   - OTP 明文不出桌面，杜绝中继侧穿透攻击
//   - "未上线的桌面 = 不能握手"，session 即使泄露也跟没人拿到 OTP 一样
//
// Request body:
//   { sessionId, otp: "<6 digits>" }
//
// Response data:
//   { handshakeId, status: "pending" }

import { NextRequest } from "next/server";
import { ok, err, newHandshakeId } from "@/app/lib/auth";
import {
  getSession,
  saveSession,
  gcSession,
} from "@/app/lib/storage";

export const runtime = "nodejs";

type HandshakeBody = {
  sessionId?: unknown;
  otp?: unknown;
};

export async function POST(req: NextRequest) {
  let body: HandshakeBody;
  try {
    body = (await req.json()) as HandshakeBody;
  } catch {
    return err("BAD_REQUEST", "invalid json", 400);
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const otp = typeof body.otp === "string" ? body.otp : "";
  if (!sessionId || !/^\d{6}$/.test(otp)) {
    return err("BAD_REQUEST", "sessionId + 6-digit otp required", 400);
  }

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (await gcSession(session)) {
    return err("EXPIRED", "session expired", 410);
  }

  if (session.otpLocked) {
    return err("OTP_LOCKED", "otp attempts exhausted", 423);
  }
  if (session.userTokenHash) {
    return err("ALREADY_BOUND", "session already bound to a device", 409);
  }

  const handshakeId = newHandshakeId();
  const deviceUa = req.headers.get("user-agent") || "unknown";

  // 把 OTP 暂存到 pendingHandshake；桌面端 poll-handshake 取走并裁决。
  // 注意：Blobs 是私有的，仅 Netlify Functions 可读；OTP 不通过任何
  // endpoint 暴露给手机或桌面以外的方。裁决完毕立即清空 pendingHandshake。
  session.pendingHandshake = {
    handshakeId,
    otp,
    deviceUa,
    submittedAt: Date.now(),
  };

  await saveSession(session);

  return ok({ handshakeId, status: "pending" });
}
