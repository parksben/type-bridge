import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Languages } from "lucide-react";
import { useAppStore, type Settings, type Lang } from "../store";

/// 首次启动语言选择卡片。
///
/// 触发条件：store.language === ""（既无 localStorage hint 又无 Rust
/// Settings.language）。用户选择后立即写入 store + localStorage hint，
/// 同时把 language 字段持久化回 Rust Settings（merge 写回，避免覆盖
/// 其他渠道凭据）。
///
/// UI：模态遮罩复用 AccessibilityGate 的尺寸 / 圆角 / 阴影；标题双语
/// 并列，两个按钮等宽。第一次启动给一个根据 navigator.language 推断
/// 的默认高亮按钮。
export default function LanguagePicker() {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  // 启动时拉一次 Rust 权威值；非空就写入 store（覆盖 localStorage hint）
  useEffect(() => {
    invoke<Settings>("get_settings")
      .then((s) => {
        if (s.language === "zh" || s.language === "en") {
          setLanguage(s.language);
        }
      })
      .catch(() => {});
  }, []);

  if (language !== "") return null;

  const guessed: Lang = guessFromBrowser();

  async function pick(lang: Lang) {
    setLanguage(lang);
    // merge 回写到 Rust，避免清空其他字段
    const current = await invoke<Settings>("get_settings").catch(() => null);
    if (!current) return;
    await invoke("save_settings", { settings: { ...current, language: lang } }).catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        className="w-full max-w-[460px] rounded-[14px] p-6 animate-enter"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div className="flex items-start gap-3 mb-5">
          <Languages
            size={24}
            strokeWidth={1.75}
            className="shrink-0 mt-0.5 text-accent"
          />
          <div className="flex-1">
            <div className="text-[15px] font-medium text-text leading-tight mb-1">
              选择语言 / Select language
            </div>
            <div className="text-[12px] text-muted leading-relaxed">
              可在左下角随时切换 / Switchable anytime in the bottom-left corner
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <LangButton
            label="简体中文"
            sublabel="Chinese"
            highlight={guessed === "zh"}
            onClick={() => pick("zh")}
          />
          <LangButton
            label="English"
            sublabel="英语"
            highlight={guessed === "en"}
            onClick={() => pick("en")}
          />
        </div>
      </div>
    </div>
  );
}

function LangButton({
  label,
  sublabel,
  highlight,
  onClick,
}: {
  label: string;
  sublabel: string;
  highlight: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 py-4 rounded-[10px] transition-colors"
      style={{
        background: highlight ? "var(--accent-soft)" : "var(--surface-2)",
        border: `1px solid ${highlight ? "var(--accent)" : "var(--border)"}`,
        color: "var(--text)",
      }}
    >
      <span className="text-[14px] font-medium">{label}</span>
      <span className="text-[11px] text-muted">{sublabel}</span>
    </button>
  );
}

function guessFromBrowser(): Lang {
  try {
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("zh")) return "zh";
    return "en";
  } catch {
    return "zh";
  }
}
