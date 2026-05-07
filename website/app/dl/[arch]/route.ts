import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

// 下载 Route Handler：代理转发 GitHub Release asset 到客户端。
//
// v0.9+ 优化：不再每次调 GitHub Releases API 查 asset URL。
// 改为从 Netlify Blobs 读取 `latest-release` → 拿到对应架构的
// browser_download_url + size → fetch GitHub CDN 流式透传，
// 响应头带 Content-Length（浏览器可显示下载进度条）。
// Blobs 读取极快，函数冷启动到开始传输的延迟大幅降低。

const BLOB_KEY = "latest-release";

interface BlobReleaseData {
  download_urls: {
    aarch64?: string | null;
    x64?: string | null;
    aarch64_size?: number | null;
    x64_size?: number | null;
  };
  tag_name?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ arch: string }> },
) {
  const { arch } = await params;

  if (arch !== "arm64" && arch !== "x64") {
    return new NextResponse("Invalid architecture. Use /arm64 or /x64", {
      status: 400,
    });
  }

  try {
    // ── 从 Blobs 读取发布元数据 ──
    const store = getStore("releases");
    const data: BlobReleaseData | null = await store.get(BLOB_KEY, {
      type: "json",
    });

    if (!data?.download_urls) {
      return new NextResponse("No release published yet", { status: 404 });
    }

    const url =
      arch === "arm64"
        ? data.download_urls.aarch64
        : data.download_urls.x64;

    const size =
      arch === "arm64"
        ? data.download_urls.aarch64_size
        : data.download_urls.x64_size;

    if (!url) {
      return new NextResponse(
        `No ${arch} .dmg found (tag: ${data.tag_name ?? "unknown"})`,
        { status: 404 },
      );
    }

    // ── 从 GitHub CDN 流式拉取 ──
    const assetRes = await fetch(url, {
      headers: { Accept: "application/octet-stream" },
    });

    if (!assetRes.ok || !assetRes.body) {
      return new NextResponse("Failed to fetch download asset", {
        status: 502,
      });
    }

    const filename = url.split("/").pop() ?? `TypeBridge_${arch}.dmg`;

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, must-revalidate",
    };

    if (size) {
      headers["Content-Length"] = String(size);
    } else if (assetRes.headers.get("content-length")) {
      headers["Content-Length"] = assetRes.headers.get("content-length")!;
    }

    return new NextResponse(assetRes.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Download proxy error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
