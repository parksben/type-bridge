import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

// 桌面 App「关于 TypeBridge」tab 的检查更新接口。
// v0.9+ 优化：不再每次调 GitHub API，改为从 Netlify Blobs 读取 CI publish 的元数据。
// 响应时间从 ~300ms 降到 ~50ms，且不受 GitHub rate limit 限制。
// 与 src-tauri/src/about.rs 的 LatestVersionResp 协议对齐。

const BLOB_KEY = "latest-release";

interface BlobReleaseData {
  version: string;
  tag_name: string;
  name: string;
  notes: string | null;
  published_at: string | null;
  download_urls: {
    aarch64: string | null;
    x64: string | null;
    aarch64_size?: number | null;
    x64_size?: number | null;
  };
}

interface DownloadUrls {
  aarch64: string | null;
  x64: string | null;
}

interface ResponsePayload {
  version: string;
  tag_name: string;
  name: string;
  notes: string | null;
  published_at: string | null;
  download_urls: DownloadUrls;
}

export async function GET() {
  try {
    const store = getStore("releases");
    const data: BlobReleaseData | null = await store.get(BLOB_KEY, {
      type: "json",
    });

    if (!data) {
      return NextResponse.json(
        { error: "no release published yet" },
        { status: 404 },
      );
    }

    // 下载链接改为走 Netlify 代理（/dl/arm64、/dl/x64），
    // 避免桌面 App 直连 GitHub CDN（国内网络访问不稳定）。
    // 代理 URL 指向最新发布版本，与 blob 内存储的版本一致。
    const BASE_URL = "https://typebridge.parksben.xyz";
    const payload: ResponsePayload = {
      version: data.version,
      tag_name: data.tag_name,
      name: data.name,
      notes: data.notes ?? null,
      published_at: data.published_at ?? null,
      download_urls: {
        aarch64: data.download_urls.aarch64 ? `${BASE_URL}/dl/arm64` : null,
        x64: data.download_urls.x64 ? `${BASE_URL}/dl/x64` : null,
      },
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}
