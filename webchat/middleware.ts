import { NextRequest, NextResponse } from "next/server";
import { detectDevice } from "./app/lib/ua";

// 边缘 UA 拦截：PC / 微信 / 其他 IM 内置浏览器一律 redirect 到拦截页。
//
// 跳过路径：
//   - /api/*           中继 API，UA 不限制（桌面 Rust 客户端的 UA 是 reqwest/x.y）
//   - /blocked/*       拦截页本身，避免循环
//   - /_next/*         Next.js 静态资产
//   - /favicon.ico     图标
//
// 放在 edge layer 是为了零客户端 JS bypass —— 用户改 UA 也只能在 fetch 时改，
// 拿不到 SPA 的初始 HTML。

export const config = {
  matcher: [
    "/((?!api|blocked|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

export function middleware(req: NextRequest) {
  const ua = req.headers.get("user-agent");
  const device = detectDevice(ua);

  if (device === "pc") {
    const url = req.nextUrl.clone();
    url.pathname = "/blocked/pc";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (device === "wechat") {
    const url = req.nextUrl.clone();
    url.pathname = "/blocked/wechat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (device === "im-browser") {
    const url = req.nextUrl.clone();
    url.pathname = "/blocked/wechat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
