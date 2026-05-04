import type { NextConfig } from "next";
import path from "path";

// Netlify 构建时自动注入的环境变量。参考：
// https://docs.netlify.com/configure-builds/environment-variables/#git-metadata
// - COMMIT_REF: 完整 Git SHA
// - BRANCH: 分支名
// 本地 dev 时 COMMIT_REF 为空，fallback "dev"
const commitRef = process.env.COMMIT_REF || "dev";
const buildRef = commitRef === "dev" ? "dev" : commitRef.slice(0, 7);

// 客户端专用的重量级库清单。这些库：
//   - 只在浏览器里跑（WebAssembly / getUserMedia 之类）
//   - 体积庞大（onnxruntime-web ~130MB 包含多个 WASM 后端）
// 若被打进 Next.js server-handler bundle，Netlify function 会超过 250MB 硬限制
// 导致部署失败。serverExternalPackages 保证 Next.js 保留 require() 形式、
// 由 Node 运行时动态加载（但我们永远不会在 server 侧触发加载）。
const CLIENT_ONLY_PACKAGES = [
  "@huggingface/transformers",
  "onnxruntime-web",
  "onnxruntime-common",
  "onnxruntime-node",
  "sharp",
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  env: {
    NEXT_PUBLIC_BUILD_REF: buildRef,
  },
  serverExternalPackages: CLIENT_ONLY_PACKAGES,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 双保险：即便 serverExternalPackages 有遗漏，也强制把这些包从 server
      // bundle 里拉出（运行时若真触发会 require() 失败，但客户端专用代码走
      // dynamic import + ssr: false，server 根本不会执行到）
      const existing = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existing, ...CLIENT_ONLY_PACKAGES];
    }
    return config;
  },
};

export default nextConfig;
