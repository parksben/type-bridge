import { X } from "lucide-react";
import { useI18n } from "../i18n";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/// 轻量内联确认弹窗。
/// window.confirm 在 macOS WKWebView 中被系统拦截，不可用；该组件作为替代。
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  dangerous = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    // 蒙层
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onCancel}
    >
      {/* 弹窗卡片 */}
      <div
        className="relative w-[340px] rounded-xl px-6 py-5 flex flex-col gap-4 shadow-lg"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-3.5 right-3.5 text-muted hover:text-text transition-colors"
        >
          <X size={15} strokeWidth={1.75} />
        </button>

        {/* 标题 */}
        <div className="text-[14px] font-semibold text-text leading-snug pr-5">
          {title}
        </div>

        {/* 正文：支持 \n 换行 */}
        <div className="text-[12.5px] leading-relaxed text-muted flex flex-col gap-1">
          {body.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="tb-btn-secondary"
            style={{ width: "auto", padding: "7px 16px", fontSize: "13px" }}
          >
            {cancelLabel ?? t("about.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={dangerous ? "tb-btn-danger-outline" : "tb-btn-primary"}
            style={{ width: "auto", padding: "7px 16px", fontSize: "13px", minWidth: 0 }}
          >
            {confirmLabel ?? t("about.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
