import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { generateBadgeSvg, formatCount } from "../../../lib/badge";

// 直接返回渲染好的 SVG badge，无需 shields.io 中转。
// 1 小时 ISR 缓存，避免每次请求都读 Blobs。

export const revalidate = 3600;

interface DownloadStats {
  total?: number;
}

export async function GET() {
  let total = 0;
  try {
    const store = getStore("stats");
    const data: DownloadStats | null = await store.get("download-stats", {
      type: "json",
    });
    total = data?.total ?? 0;
  } catch (err) {
    console.error("badge/downloads error:", err);
  }

  const svg = generateBadgeSvg("downloads", formatCount(total), "brightgreen");
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
