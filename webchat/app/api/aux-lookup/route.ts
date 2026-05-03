// GET /api/aux-lookup?code=<8-char base32> — 手机相机不可用时的辅助会话码查询。
//
// 公开 endpoint（无 auth）：用户输入 8 位辅助码，换 sessionId，前端 redirect 到
// `/?s=<sessionId>` 进入正常握手流程。
//
// 安全：辅助码 ~40 bit 熵，配合 5 分钟 TTL 不可穷举。这个 endpoint 不暴露 OTP 或
// 任何凭据，只暴露 sessionId（sessionId 自身也不能直接握手，必须配 OTP）。
//
// Response data: { sessionId } 或 404

import { NextRequest } from "next/server";
import { ok, err } from "@/app/lib/auth";
import { lookupAux, getSession, gcSession } from "@/app/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") || "").toUpperCase();
  if (!/^[A-Z2-7]{8}$/.test(code)) {
    return err("BAD_REQUEST", "code must be 8-char base32", 400);
  }

  const sessionId = await lookupAux(code);
  if (!sessionId) return err("NOT_FOUND", "code not found", 404);

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (await gcSession(session)) return err("EXPIRED", "session expired", 410);

  return ok({ sessionId });
}
