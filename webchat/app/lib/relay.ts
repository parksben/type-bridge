// 前端 fetch 封装：处理 Bearer token / JSON 解析 / 错误归类。
//
// 所有中继 endpoint 都返回 `{ ok, data | error }`；这里把它转成 Promise reject
// 携带具体 ApiErrorCode，方便上层 switch 处理。

export type ApiErrorCode =
  | "EXPIRED"
  | "INVALID_OTP"
  | "OTP_LOCKED"
  | "ALREADY_BOUND"
  | "OWNER_LOST"
  | "BAD_TOKEN"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "NETWORK"
  | "UNKNOWN";

export class RelayError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
    this.name = "RelayError";
  }
}

type Init = RequestInit & { token?: string | null };

async function call<T>(path: string, init: Init = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch (e) {
    throw new RelayError("NETWORK", (e as Error).message || "network error");
  }

  if (res.status === 204) {
    // long-poll timeout
    return null as T;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new RelayError("UNKNOWN", `non-json response (status ${res.status})`);
  }

  const body = json as
    | { ok: true; data: T }
    | { ok: false; error: { code: ApiErrorCode; message: string } };

  if (body.ok) return body.data;
  throw new RelayError(body.error.code, body.error.message);
}

// ──────────────────────────────────────────────────────────────
// 各 endpoint 包装
// ──────────────────────────────────────────────────────────────

export type HandshakeStatus = {
  handshakeId: string;
  status: "pending";
};

export type HandshakeResult = {
  handshakeResult: {
    handshakeId: string;
    accepted: boolean;
    userToken?: string;
    reason?: string;
  };
};

export type AckEvent = {
  messageId: string;
  clientMessageId: string;
  success: boolean;
  reason?: string;
  at: number;
};

export type AckList = {
  acks: AckEvent[];
};

/** 手机端：提交 OTP 等待桌面裁决 */
export function submitHandshake(sessionId: string, otp: string): Promise<HandshakeStatus> {
  return call("/api/handshake", {
    method: "POST",
    body: JSON.stringify({ sessionId, otp }),
  });
}

/** 手机端：long-poll 握手裁决；返回 null 表示 timeout，需重发 */
export async function pollHandshake(
  sessionId: string,
): Promise<HandshakeResult | null> {
  return call(`/api/poll-status?sessionId=${encodeURIComponent(sessionId)}`);
}

/** 手机端：long-poll ack 列表 */
export async function pollAcks(
  sessionId: string,
  userToken: string,
  since: number,
): Promise<AckList | null> {
  return call(
    `/api/poll-status?sessionId=${encodeURIComponent(sessionId)}&since=${since}`,
    { token: userToken },
  );
}

/** 手机端：发送文本 */
export function sendText(
  sessionId: string,
  userToken: string,
  clientMessageId: string,
  text: string,
): Promise<{ messageId: string; ts: number }> {
  return call("/api/send", {
    method: "POST",
    token: userToken,
    body: JSON.stringify({
      sessionId,
      clientMessageId,
      kind: "text",
      text,
    }),
  });
}

/** 手机端：发送图片 */
export function sendImage(
  sessionId: string,
  userToken: string,
  clientMessageId: string,
  image: { data: string; mime: string },
): Promise<{ messageId: string; ts: number }> {
  return call("/api/send", {
    method: "POST",
    token: userToken,
    body: JSON.stringify({
      sessionId,
      clientMessageId,
      kind: "image",
      image,
    }),
  });
}
