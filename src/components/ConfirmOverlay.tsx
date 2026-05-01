import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Bot, Check, X } from "lucide-react";

interface ConfirmRequest {
  type: string;
  sender?: string;
  text?: string;
  data?: string;
  mime?: string;
}

export default function ConfirmOverlay() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const unlisten = listen<ConfirmRequest>("feishu://confirm-request", (e) => {
      setRequest(e.payload);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  if (!request) return null;

  async function handleInject() {
    if (!request) return;
    if (request.text) {
      await invoke("inject_text_direct", { text: request.text }).catch(() => {});
    }
    setRequest(null);
  }

  function handleIgnore() {
    setRequest(null);
  }

  const preview = request.text
    ? request.text.slice(0, 80) + (request.text.length > 80 ? "…" : "")
    : request.mime?.startsWith("image/")
    ? "[图片]"
    : "";

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[300px] animate-enter"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        boxShadow: "var(--shadow-lg)",
        padding: "14px 16px",
      }}
    >
      <div className="flex items-center gap-1.5 mb-2 text-muted">
        <Bot size={12} strokeWidth={1.75} />
        <span className="text-[11px] uppercase tracking-[0.12em] font-medium">
          来自 {request.sender ? `@${request.sender}` : "飞书"}
        </span>
      </div>
      <div className="text-[13px] text-text leading-relaxed mb-3 break-all line-clamp-3">
        {preview}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleInject}
          className="tb-btn-primary flex items-center justify-center gap-1.5"
          style={{ padding: "7px 12px", fontSize: "12.5px" }}
        >
          <Check size={13} strokeWidth={2} />
          输入
        </button>
        <button
          onClick={handleIgnore}
          className="flex-1 flex items-center justify-center gap-1.5 text-[12.5px] text-muted py-[7px] rounded-lg transition-colors"
          style={{ background: "var(--surface-2)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        >
          <X size={13} strokeWidth={2} />
          忽略
        </button>
      </div>
    </div>
  );
}
