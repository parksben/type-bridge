import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

// shields.io endpoint badge：返回最新正式版本号。
// 文档：https://shields.io/badges/endpoint-badge
//
// shields.io 每次请求会尊重 cacheSeconds 字段；我们在 Next.js 侧也加 1h ISR，
// 避免每次 badge 请求都触发 Blobs 读。

export const revalidate = 3600; // 1 小时 ISR

interface BlobReleaseData {
  version?: string;
}

export async function GET() {
  try {
    const store = getStore("releases");
    const data: BlobReleaseData | null = await store.get("latest-release", {
      type: "json",
    });

    const version = data?.version ? `v${data.version.replace(/^v/, "")}` : "—";

    return NextResponse.json({
      schemaVersion: 1,
      label: "latest",
      message: version,
      color: "blue",
    });
  } catch (err) {
    console.error("badge/version error:", err);
    return NextResponse.json({
      schemaVersion: 1,
      label: "latest",
      message: "unavailable",
      color: "inactive",
    });
  }
}
