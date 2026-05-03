// GET /api/poll-status — 手机端长轮询，拿握手裁决结果 / 后续消息 ack。
//
// 用同一 endpoint 复用 long-poll 通道，避免手机端开两条连接。
//
// 阶段一（握手前）：手机刚提交 OTP，等桌面裁决
//   返回 { handshakeResult: { accepted, userToken?, reason? } }
//
// 阶段二（握手后）：手机已拿到 userToken，靠 send 上行；用此 endpoint 拿 ack
//   Auth: 手机 userToken
//   返回 { acks: [{ messageId, success, reason? }] }
//
// 实现：
//   - 没 userToken 时，只校验 sessionId（公开 endpoint，但只暴露公开字段）
//   - 有 userToken 时，校验 token + 拉取自上次 since 之后的 ack

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
  listSessionMessages,
  gcSession,
} from "@/app/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 15;

const POLL_TIMEOUT_MS = 6000;
const POLL_INTERVAL_MS = 300;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  const sinceStr = req.nextUrl.searchParams.get("since") || "0";
  const since = Number.isFinite(Number(sinceStr)) ? Number(sinceStr) : 0;
  if (!sessionId) return err("BAD_REQUEST", "sessionId required", 400);

  const token = extractBearer(req);

  const initial = await getSession(sessionId);
  if (!initial) return err("NOT_FOUND", "session not found", 404);
  if (await gcSession(initial)) return err("EXPIRED", "session expired", 410);

  // 阶段一：未握手 — 只看 handshakeResult
  if (!initial.userTokenHash) {
    // 立即查
    const r = await checkHandshake(sessionId);
    if (r) return ok(r);

    // long poll
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((rs) => setTimeout(rs, POLL_INTERVAL_MS));
      // 循环内也检查 session 是否已因 owner 心跳超时被 GC
      const cur = await getSession(sessionId);
      if (!cur) return err("NOT_FOUND", "session vanished", 404);
      if (await gcSession(cur)) return err("EXPIRED", "session expired", 410);
      const r2 = await checkHandshake(sessionId);
      if (r2) return ok(r2);
    }
    return new Response(null, { status: 204 });
  }

  // 阶段二：已握手 — 校验 userToken，返回 ack 列表
  if (!token) return err("BAD_TOKEN", "missing user token", 401);
  if (!(await tokenMatches(token, initial.userTokenHash))) {
    return err("BAD_TOKEN", "user token mismatch", 401);
  }

  const r = await checkAcks(sessionId, since);
  if (r.acks.length > 0) return ok(r);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((rs) => setTimeout(rs, POLL_INTERVAL_MS));
    // 循环内也检查 session 健康：桌面端心跳缺失即立刻通知手机
    const cur = await getSession(sessionId);
    if (!cur) return err("NOT_FOUND", "session vanished", 404);
    if (await gcSession(cur)) return err("EXPIRED", "session expired", 410);
    const r2 = await checkAcks(sessionId, since);
    if (r2.acks.length > 0) return ok(r2);
  }
  return new Response(null, { status: 204 });
}

async function checkHandshake(sessionId: string) {
  const cur = await getSession(sessionId);
  if (!cur) return null;
  const r = cur.handshakeResult;
  if (!r) return null;

  // 取走 userToken：让手机拿到后立即清空
  const out = {
    handshakeResult: {
      handshakeId: r.handshakeId,
      accepted: r.accepted,
      userToken: r.userToken,
      reason: r.reason,
    },
  };
  if (r.accepted && r.userToken) {
    cur.handshakeResult = {
      ...r,
      userToken: undefined, // 已取走
    };
    await saveSession(cur);
  }
  return out;
}

async function checkAcks(sessionId: string, since: number) {
  const messages = await listSessionMessages(sessionId, 50);
  const acks = messages
    .filter((m) => m.ack && m.ack.at > since)
    .map((m) => ({
      messageId: m.messageId,
      clientMessageId: m.clientMessageId,
      success: m.ack!.success,
      reason: m.ack!.reason,
      at: m.ack!.at,
    }));
  return { acks };
}
