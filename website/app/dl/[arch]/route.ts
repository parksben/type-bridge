import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

// 下载 Route Handler：读取 Netlify Blobs 中的发布元数据 → 302 重定向到 GitHub CDN。
//
// 为什么用重定向而非流式代理：
// 流式代理（ReadableStream body）会触发 chunked transfer encoding，
// 导致 Content-Length 被 HTTP 层丢弃，浏览器无法显示总文件大小/进度条。
// 重定向后浏览器直接连 GitHub CDN，Content-Length 由 GitHub 正常返回。

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

    if (!url) {
      return new NextResponse(
        `No ${arch} .dmg found (tag: ${data.tag_name ?? "unknown"})`,
        { status: 404 },
      );
    }

    // ── 302 重定向到 GitHub CDN，让浏览器直接下载 ──
    // 原因：流式代理（ReadableStream body）会触发 chunked transfer encoding，
    // 导致 Content-Length 在传输层被丢弃，浏览器无法显示总文件大小/进度条。
    // 重定向后浏览器直接连 GitHub CDN，Content-Length 由 GitHub 正常返回。
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    console.error("Download proxy error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
