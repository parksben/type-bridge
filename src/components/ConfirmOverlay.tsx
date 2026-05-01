import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">
        来自 {request.sender ? `@${request.sender}` : "飞书机器人"}
      </div>
      <div className="text-sm text-gray-800 mb-3 break-all line-clamp-3">{preview}</div>
      <div className="flex gap-2">
        <button
          onClick={handleInject}
          className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          注入
        </button>
        <button
          onClick={handleIgnore}
          className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors"
        >
          忽略
        </button>
      </div>
    </div>
  );
}
