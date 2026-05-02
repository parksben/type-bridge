import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = "parksben/type-bridge";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ arch: string }> }
) {
  const { arch } = await params;

  // Validate arch
  if (arch !== "arm64" && arch !== "x64") {
    return new NextResponse("Invalid architecture. Use /arm64 or /x64", {
      status: 400,
    });
  }

  try {
    // Fetch latest release metadata
    const releaseRes = await fetch(GITHUB_API, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        // Use GITHUB_TOKEN if available for higher rate limits
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 300 }, // Cache release metadata for 5 min
    });

    if (!releaseRes.ok) {
      return new NextResponse(
        `Failed to fetch release info: ${releaseRes.status}`,
        { status: 502 }
      );
    }

    const release: GitHubRelease = await releaseRes.json();

    // Match the correct asset
    const pattern =
      arch === "arm64" ? /_aarch64\.dmg$/ : /_x64\.dmg$/;
    const asset = release.assets.find((a) => pattern.test(a.name));

    if (!asset) {
      return new NextResponse(
        `No ${arch} .dmg found in latest release ${release.tag_name}`,
        { status: 404 }
      );
    }

    // Stream-proxy the download from GitHub
    const assetRes = await fetch(asset.browser_download_url, {
      headers: {
        Accept: "application/octet-stream",
      },
    });

    if (!assetRes.ok || !assetRes.body) {
      return new NextResponse("Failed to fetch download asset", {
        status: 502,
      });
    }

    return new NextResponse(assetRes.body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset.name}"`,
        "Content-Length": String(asset.size),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Download proxy error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
