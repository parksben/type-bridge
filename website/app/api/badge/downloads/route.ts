import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

// shields.io endpoint badge：返回总下载量。
// 文档：https://shields.io/badges/endpoint-badge

export const revalidate = 3600; // 1 小时 ISR

interface DownloadStats {
  total?: number;
}

// 将数字格式化为带千位分隔符的字符串，超过 1k 显示 "1.2k" 等简写。
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export async function GET() {
  try {
    const store = getStore("stats");
    const data: DownloadStats | null = await store.get("download-stats", {
      type: "json",
    });

    const total = data?.total ?? 0;

    return NextResponse.json({
      schemaVersion: 1,
      label: "downloads",
      message: formatCount(total),
      color: "brightgreen",
    });
  } catch (err) {
    console.error("badge/downloads error:", err);
    return NextResponse.json({
      schemaVersion: 1,
      label: "downloads",
      message: "unavailable",
      color: "inactive",
    });
  }
}
