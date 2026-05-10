import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { generateBadgeSvg } from "../../../lib/badge";

// 直接返回渲染好的 SVG badge，无需 shields.io 中转。
// force-dynamic：避免构建期预渲染时 Blobs 无数据导致缓存 "—"。
// Cache-Control 在 Response header 层面控制下游缓存（1h）。

export const dynamic = "force-dynamic";

interface BlobReleaseData {
  version?: string;
}

export async function GET() {
  let version = "—";
  try {
    const store = getStore("releases");
    const data: BlobReleaseData | null = await store.get("latest-release", {
      type: "json",
    });
    if (data?.version) {
      version = `v${data.version.replace(/^v/, "")}`;
    }
  } catch (err) {
    console.error("badge/version error:", err);
  }

  const svg = generateBadgeSvg("latest", version, "blue");
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
