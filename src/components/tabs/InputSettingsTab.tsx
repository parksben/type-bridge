import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Info, Keyboard, Zap } from "lucide-react";
import { useAppStore, DEFAULT_SUBMIT_KEY, type Settings } from "../../store";
import { useI18n } from "../../i18n";
import KeyBindInput from "../KeyBindInput";

export default function InputSettingsTab() {
  const { autoSubmit, submitKey, setAutoSubmit, setSubmitKey } = useAppStore();
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);

  // 首次挂载时拉设置。ConnectionTab 也会拉；Zustand 允许重复写同值，重入
  // 不产生副作用。这样即使用户第一眼就切到输入设置 tab 也能看到正确值。
  useEffect(() => {
    invoke<Settings>("get_settings")
      .then((s) => {
        setAutoSubmit(s.auto_submit);
        setSubmitKey(s.submit_key ?? DEFAULT_SUBMIT_KEY);
      })
      .finally(() => setHydrated(true));
  }, []);

  // 设置变更后 debounced 持久化。为了不清空 ConnectionTab 拥有的凭据字段，
  // 先 get 当前全量 settings 再 merge 写回。get+save 两次 IPC，debounce
  // 500ms 足够覆盖频繁触发（toggle 点几下）。
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(async () => {
      const current = await invoke<Settings>("get_settings").catch(() => null);
      if (!current) return;
      await invoke("save_settings", {
        settings: {
          ...current,
          auto_submit: autoSubmit,
          submit_key: submitKey,
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [autoSubmit, submitKey, hydrated]);

  return (
    <div className="h-full flex flex-col">
      {/* 顶部 intro 说明 */}
      <div
        className="flex items-center gap-2 px-6 py-3 text-[12.5px]"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Info size={13} strokeWidth={1.75} className="text-accent shrink-0" />
        <span>{t("inputSettings.intro")}</span>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-10 py-8">
        <div className="max-w-md mx-auto flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Zap size={12} strokeWidth={1.75} />
            {t("inputSettings.autoSubmitGroup")}
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-[13px] text-text">{t("inputSettings.autoSubmitTitle")}</span>
              <span className="text-[11px] text-subtle mt-0.5">
                {t("inputSettings.autoSubmitDesc")}
              </span>
            </div>
            <button
              className="tb-toggle"
              data-on={autoSubmit}
              onClick={() => setAutoSubmit(!autoSubmit)}
              aria-label={t("inputSettings.toggleAria")}
            />
          </div>
        </div>

        <div className="h-px bg-border my-1" />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Keyboard size={12} strokeWidth={1.75} />
            {t("inputSettings.submitKeyGroup")}
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-[13px] text-text">{t("inputSettings.submitKeyTitle")}</span>
              <span className="text-[11px] text-subtle mt-0.5">
                {t("inputSettings.submitKeyDesc")}
              </span>
            </div>
            <KeyBindInput
              value={submitKey}
              onChange={setSubmitKey}
              disabled={!autoSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
