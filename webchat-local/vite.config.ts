import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WebChat v2 前端构建：
// - base: "/" —— 部署到 Tauri 本地 server 根路径
// - build.outDir: "dist" —— 产物打包进 Tauri resource
// - 开发模式 dev server 在 5173，联调时 server 返回 index.html 指向 Vite dev server
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // SPA 单入口，输出小 chunk
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0", // 局域网可达，真机联调用
  },
});
