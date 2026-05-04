"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// ssr: false 让整棵 MobileApp 子树（及其所有依赖，包括 @huggingface/transformers
// 和 onnxruntime-web）完全不进 SSR 渲染路径，从而不被打进 server-handler
// Lambda bundle。这是避免 Netlify 250MB function 限制的关键。
//
// 必须放在 'use client' 组件里 —— Next.js 15 App Router 规定 dynamic + ssr:false
// 只能在 client component 中使用。
const MobileApp = dynamic(() => import("./MobileApp"), {
  ssr: false,
  loading: () => (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 safe-area-top safe-area-bottom">
      <Loader2 size={28} className="animate-spin text-[var(--tb-muted)] mb-4" />
      <p className="text-[var(--tb-muted)] text-sm">正在加载 TypeBridge WebChat…</p>
    </main>
  ),
});

export default function MobileAppClient() {
  return <MobileApp />;
}
