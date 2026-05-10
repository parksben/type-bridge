import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { generateBadgeSvg } from "../../../lib/badge";

// 直接返回渲染好的 SVG badge，无需 shields.io 中转。
// 1 小时 ISR 缓存，避免每次请求都读 Blobs。

export const revalidate = 3600;

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
