// 中继侧通用工具：随机 ID 生成 / sha256 哈希 / token 提取与校验 / 标准 JSON 响应壳。
//
// 全部用 Web Crypto API（Edge Runtime / Node 18+ 都内置），不引第三方库。

import { NextRequest, NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────────
// Random ID / Token
// ──────────────────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase32(bytes: Uint8Array, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBytes(len: number): Uint8Array {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

/** 24 字符 base32 sessionId（约 120 bit 熵） */
export function newSessionId(): string {
  return "ses_" + bytesToBase32(randomBytes(24), 24);
}

/** 16 字符 base32 messageId */
export function newMessageId(): string {
  return "wc_" + bytesToBase32(randomBytes(16), 16);
}

/** 16 字符 base32 handshakeId */
export function newHandshakeId(): string {
  return "hs_" + bytesToBase32(randomBytes(16), 16);
}

/** 32 字节 random → base64url，~256 bit 熵 */
export function newToken(): string {
  return bytesToBase64Url(randomBytes(32));
}

/** 6 位数字 OTP */
export function newOtp(): string {
  const arr = randomBytes(4);
  const n =
    (arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3];
  // 右移再取模避免有效负数
  const positive = (n >>> 0) % 1_000_000;
  return positive.toString().padStart(6, "0");
}

// ──────────────────────────────────────────────────────────────
// SHA-256
// ──────────────────────────────────────────────────────────────

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ──────────────────────────────────────────────────────────────
// Auth: Bearer token 提取与校验
// ──────────────────────────────────────────────────────────────

export function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function tokenMatches(token: string | null, hashOnFile: string | null): Promise<boolean> {
  if (!token || !hashOnFile) return false;
  const incoming = await sha256Hex(token);
  // constant-time 等价：长度先比，逐字符 XOR
  if (incoming.length !== hashOnFile.length) return false;
  let diff = 0;
  for (let i = 0; i < incoming.length; i++) {
    diff |= incoming.charCodeAt(i) ^ hashOnFile.charCodeAt(i);
  }
  return diff === 0;
}

// ──────────────────────────────────────────────────────────────
// 标准响应壳
// ──────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | "EXPIRED"
  | "INVALID_OTP"
  | "OTP_LOCKED"
  | "ALREADY_BOUND"
  | "OWNER_LOST"
  | "BAD_TOKEN"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "NOT_FOUND";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function err(code: ApiErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export const ERR_STATUS: Record<ApiErrorCode, number> = {
  EXPIRED: 410,
  INVALID_OTP: 401,
  OTP_LOCKED: 423,
  ALREADY_BOUND: 409,
  OWNER_LOST: 410,
  BAD_TOKEN: 401,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
};
