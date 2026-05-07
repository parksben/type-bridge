import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

// CI 完成 GitHub Release 后调用此接口，将最新版本元数据写入 Netlify Blobs。
//
// 安全控制：
//   - 请求必须带 `Authorization: Bearer <UPLOAD_SECRET>` 头
//   - UPLOAD_SECRET 仅存在于 Netlify 环境变量和 GitHub Secrets
//   - 外部请求不带正确 secret 返回 401
//
// 请求体 (JSON):
//   {
//     "version": "0.2.0",
//     "tag_name": "v0.2.0",
//     "name": "TypeBridge v0.2.0",
//     "notes": "...",
//     "published_at": "2026-05-08T...",
//     "download_urls": {
//       "aarch64": "https://github.com/.../TypeBridge_0.2.0_aarch64.dmg",
//       "x64":     "https://github.com/.../TypeBridge_0.2.0_x64.dmg",
//       "aarch64_size": 123456789,
//       "x64_size":     123456790
//     }
//   }

const BLOB_KEY = "latest-release";

interface PublishPayload {
  version: string;
  tag_name: string;
  name: string;
  notes: string | null;
  published_at: string | null;
  download_urls: {
    aarch64: string | null;
    x64: string | null;
    aarch64_size: number | null;
    x64_size: number | null;
  };
}

export async function POST(request: NextRequest) {
  // ── 鉴权：Bearer token 必须匹配 UPLOAD_SECRET ──
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.UPLOAD_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "UPLOAD_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 解析 & 校验请求体 ──
  let body: PublishPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.version || !body.tag_name || !body.download_urls) {
    return NextResponse.json(
      { error: "missing required fields: version, tag_name, download_urls" },
      { status: 400 },
    );
  }

  // ── 写入 Netlify Blobs ──
  try {
    const store = getStore("releases");
    await store.setJSON(BLOB_KEY, {
      version: body.version,
      tag_name: body.tag_name,
      name: body.name || body.tag_name,
      notes: body.notes ?? null,
      published_at: body.published_at ?? null,
      download_urls: {
        aarch64: body.download_urls.aarch64 ?? null,
        x64: body.download_urls.x64 ?? null,
        aarch64_size: body.download_urls.aarch64_size ?? null,
        x64_size: body.download_urls.x64_size ?? null,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        version: body.version,
        stored_key: BLOB_KEY,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("Blobs write error:", e);
    return NextResponse.json(
      { error: "failed to write to Blobs store" },
      { status: 500 },
    );
  }
}

// 其他方法拒绝
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
