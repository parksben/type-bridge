import type { NextConfig } from "next";
import path from "path";

// Netlify 构建时自动注入的环境变量。参考：
// https://docs.netlify.com/configure-builds/environment-variables/#git-metadata
// - COMMIT_REF: 完整 Git SHA
// - BRANCH: 分支名
// 本地 dev 时 COMMIT_REF 为空，fallback "dev"
const commitRef = process.env.COMMIT_REF || "dev";
const buildRef = commitRef === "dev" ? "dev" : commitRef.slice(0, 7);

const nextConfig: NextConfig = {
  output: "standalone",
  // 多 lockfile 共存（根 + website + webchat），显式锁定到本目录
  outputFileTracingRoot: path.join(__dirname),
  // 暴露给客户端 —— layout 右下角会显示 build hash，部署后一眼能确认版本
  env: {
    NEXT_PUBLIC_BUILD_REF: buildRef,
  },
};

export default nextConfig;
