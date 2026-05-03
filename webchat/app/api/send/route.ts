// POST /api/send — 手机端上行消息（文本 / 图片）。
//
// Auth: 手机 userToken
// Request body:
//   { clientMessageId, kind: "text" | "image", text?, image?: { data: <base64>, mime } }
// Response data:
//   { messageId, ts }

import { NextRequest } from "next/server";
import {
  extractBearer,
  ok,
  err,
  tokenMatches,
  newMessageId,
} from "@/app/lib/auth";
import {
  getSession,
  saveMessage,
  gcSession,
  gcOldMessages,
  type StoredMessage,
} from "@/app/lib/storage";

export const runtime = "nodejs";

// Netlify Functions 单请求 body 限 6 MB；图片 base64 后约增 33%，
// 因此原图限 ~4 MB。客户端会压到 ≤2 MB，留足余量。
const MAX_BODY_BYTES = 6 * 1024 * 1024;

type Body = {
  sessionId?: unknown;
  clientMessageId?: unknown;
  kind?: unknown;
  text?: unknown;
  image?: unknown;
};

export async function POST(req: NextRequest) {
  // 防御：基于 Content-Length 提早拒绝超大 body
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return err("BAD_REQUEST", "payload too large", 400);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("BAD_REQUEST", "invalid json", 400);
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const clientMessageId = typeof body.clientMessageId === "string" ? body.clientMessageId : "";
  const kind = body.kind === "text" || body.kind === "image" ? body.kind : null;
  if (!sessionId || !clientMessageId || !kind) {
    return err("BAD_REQUEST", "sessionId + clientMessageId + kind required", 400);
  }

  const token = extractBearer(req);
  if (!token) return err("BAD_TOKEN", "missing user token", 401);

  const session = await getSession(sessionId);
  if (!session) return err("NOT_FOUND", "session not found", 404);
  if (await gcSession(session)) return err("EXPIRED", "session expired", 410);
  if (!(await tokenMatches(token, session.userTokenHash))) {
    return err("BAD_TOKEN", "user token mismatch", 401);
  }

  const msg: StoredMessage = {
    messageId: newMessageId(),
    clientMessageId,
    kind,
    ts: Date.now(),
    pulled: false,
    pulledAt: null,
    ack: null,
  };

  if (kind === "text") {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return err("BAD_REQUEST", "text required", 400);
    if (text.length > 50_000) return err("BAD_REQUEST", "text too long", 400);
    msg.text = text;
  } else {
    const image = body.image as { data?: unknown; mime?: unknown } | null;
    const data = image && typeof image.data === "string" ? image.data : "";
    const mime = image && typeof image.mime === "string" ? image.mime : "";
    if (!data || !mime) return err("BAD_REQUEST", "image.data + image.mime required", 400);
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
      return err("BAD_REQUEST", "unsupported image mime", 400);
    }
    msg.image = { data, mime };
  }

  await saveMessage(sessionId, msg);

  // 惰性 GC 已 pull 的旧消息（不阻塞主请求）— fire and forget
  void gcOldMessages(sessionId).catch(() => {});

  return ok({ messageId: msg.messageId, ts: msg.ts });
}
