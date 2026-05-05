import { Mic } from "lucide-react";
import { t } from "@/i18n";

type Props = {
  onClick: () => void;
};

/// 语音按钮：点击后触发上层弹引导 modal。v2 不自研语音识别，依赖手机输入法麦克风。
export default function VoiceButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("composer.voiceAria")}
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors"
      style={{
        background: "var(--tb-bg)",
        border: "1px solid var(--tb-border)",
        color: "var(--tb-muted)",
      }}
    >
      <Mic size={18} strokeWidth={2.2} />
    </button>
  );
}
