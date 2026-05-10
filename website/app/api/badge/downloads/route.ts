import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { generateBadgeSvg, formatCount } from "../../../lib/badge";

// 直接返回渲染好的 SVG badge，无需 shields.io 中转。
// force-dynamic：避免构建期预渲染时 Blobs 无数据导致缓存 "0"。
// DOWNLOAD_BASE_COUNT：种子偏移量，用于计入上线前已存在的下载量。

export const dynamic = "force-dynamic";

// 种子偏移：部署前已有的下载量，默认 98。
// 实际显示 = DOWNLOAD_BASE_COUNT + Blobs 中追踪到的真实增量。
const BASE_COUNT = parseInt(process.env.DOWNLOAD_BASE_COUNT ?? "98", 10);

interface DownloadStats {
  total?: number;
}

export async function GET() {
  let tracked = 0;
  try {
    const store = getStore("stats");
    const data: DownloadStats | null = await store.get("download-stats", {
      type: "json",
    });
    tracked = data?.total ?? 0;
  } catch (err) {
    console.error("badge/downloads error:", err);
  }

  const svg = generateBadgeSvg(
    "downloads",
    formatCount(BASE_COUNT + tracked),
    "brightgreen",
  );
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
