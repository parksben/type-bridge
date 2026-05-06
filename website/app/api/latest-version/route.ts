import { NextResponse } from "next/server";

// 桌面 App「关于 TypeBridge」tab 的检查更新接口。
// 透传 GitHub Releases 的 latest tag 信息，附上对应架构的 .dmg 直链。
// 与 src-tauri/src/about.rs 的 LatestVersionResp 协议对齐。

const GITHUB_REPO = "parksben/type-bridge";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body?: string;
  published_at?: string;
  assets: GitHubAsset[];
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
    const releaseRes = await fetch(GITHUB_API, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 300 }, // 5 分钟缓存避免 rate limit
    });

    if (!releaseRes.ok) {
      return NextResponse.json(
        { error: `GitHub API ${releaseRes.status}` },
        { status: 502 }
      );
    }

    const release: GitHubRelease = await releaseRes.json();

    // 把 v0.2.0 这类前缀的 v 去掉，得到纯 semver
    const version = release.tag_name.replace(/^v/, "");

    // 在 assets 中按文件名后缀分别找 arm64 和 x64
    const downloadUrls: DownloadUrls = {
      aarch64: pickAssetUrl(release.assets, /_aarch64\.dmg$/),
      x64: pickAssetUrl(release.assets, /_x64\.dmg$/),
    };

    const payload: ResponsePayload = {
      version,
      tag_name: release.tag_name,
      name: release.name,
      notes: release.body ?? null,
      published_at: release.published_at ?? null,
      download_urls: downloadUrls,
    };

    return NextResponse.json(payload, {
      status: 200,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal error" },
      { status: 500 }
    );
  }
}

function pickAssetUrl(assets: GitHubAsset[], pattern: RegExp): string | null {
  const asset = assets.find((a) => pattern.test(a.name));
  return asset?.browser_download_url ?? null;
}
