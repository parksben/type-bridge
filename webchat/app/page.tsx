import { headers } from "next/headers";
import { detectDevice } from "./lib/ua";
import MobileApp from "./components/MobileApp";
import PCBlockView from "./components/PCBlockView";
import WeChatBlockView from "./components/WeChatBlockView";

// 使用 headers() 会让路由自动切 dynamic；URL 永远是 /?s=xxx（不做 redirect），
// 微信浏览器用户在微信里看到引导，点"在浏览器打开"后系统浏览器用同一个 URL
// 再次请求，UA 变了 → 本 server component 直接渲染聊天 SPA。
export default async function Page() {
  const h = await headers();
  const ua = h.get("user-agent");
  const device = detectDevice(ua);

  if (device === "pc") return <PCBlockView />;
  if (device === "wechat" || device === "im-browser") return <WeChatBlockView />;
  return <MobileApp />;
}
