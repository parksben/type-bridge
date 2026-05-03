import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // 多 lockfile 共存（根 + website + webchat），显式锁定到本目录
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
