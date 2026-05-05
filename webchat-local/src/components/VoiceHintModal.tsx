import { Mic, X } from "lucide-react";

type Props = {
  onClose: () => void;
};

/// 用户点麦克风按钮时弹出。v2 方案不自研识别，引导用输入法自带麦克风。
export default function VoiceHintModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: "color-mix(in srgb, var(--tb-bg) 70%, transparent)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md mx-auto animate-fade-up safe-area-bottom"
        style={{
          background: "var(--tb-surface)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderTop: "1px solid var(--tb-border)",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.10)",
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span
            className="w-10 h-1 rounded-full mx-auto"
            style={{ background: "var(--tb-border)" }}
          />
        </div>

        <div className="px-5 pt-3 pb-5">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "color-mix(in srgb, var(--tb-accent) 14%, transparent)" }}
            >
              <Mic size={22} strokeWidth={2} className="text-[var(--tb-accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-[16px] font-semibold text-[var(--tb-text)] mb-1">
                请使用输入法语音输入功能
              </p>
              <p className="text-[13px] text-[var(--tb-muted)] leading-relaxed">
                WebChat 页面暂不支持语音输入，请使用输入法自带的语音功能进行语音输入。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="shrink-0 -m-1 p-1 text-[var(--tb-muted)]"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-lg font-medium text-[14px] text-white"
            style={{ background: "var(--tb-accent)" }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
