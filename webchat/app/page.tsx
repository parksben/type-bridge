import { Loader2 } from "lucide-react";

// P2 阶段占位：仅 loading 态。
// P4 会把这里替换成完整的状态机（loading → handshake → chat → disconnected）。
export default function HomePage() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 safe-area-top safe-area-bottom">
      <Loader2
        size={28}
        className="animate-spin text-[var(--tb-muted)] mb-4"
      />
      <p className="text-[var(--tb-muted)] text-sm">正在加载 TypeBridge WebChat…</p>
    </main>
  );
}
