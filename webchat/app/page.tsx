import { headers } from "next/headers";
import { detectDevice } from "./lib/ua";
import MobileAppClient from "./components/MobileAppClient";
import PCBlockView from "./components/PCBlockView";
import WeChatBlockView from "./components/WeChatBlockView";

// 使用 headers() 会让路由自动切 dynamic；URL 永远是 /?s=xxx（不做 redirect），
// 微信浏览器用户在微信里看到引导，点"在浏览器打开"后系统浏览器用同一个 URL
// 再次请求，UA 变了 → 本 server component 直接渲染聊天 SPA。
//
// MobileAppClient 是 client-only 包装（dynamic + ssr:false），让 WASM 语音
// 依赖（onnxruntime-web 130MB、transformers.js 等）完全不进 server bundle，
// 避开 Netlify 250MB function 硬限制。
export default async function Page() {
  const h = await headers();
  const ua = h.get("user-agent");
  const device = detectDevice(ua);

  if (device === "pc") return <PCBlockView />;
  if (device === "wechat" || device === "im-browser") return <WeChatBlockView />;
  return <MobileAppClient />;
}
