import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard, Zap } from "lucide-react";
import { useAppStore, DEFAULT_SUBMIT_KEY, type Settings } from "../../store";
import KeyBindInput from "../KeyBindInput";

export default function InputSettingsTab() {
  const { autoSubmit, submitKey, setAutoSubmit, setSubmitKey } = useAppStore();
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
    <div className="h-full overflow-y-auto thin-scroll px-10 py-8">
      <div className="max-w-md mx-auto flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Zap size={12} strokeWidth={1.75} />
            自动提交
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-[13px] text-text">输入后自动提交</span>
              <span className="text-[11px] text-subtle mt-0.5">
                写入完成后模拟按下提交按键，完成一键发送
              </span>
            </div>
            <button
              className="tb-toggle"
              data-on={autoSubmit}
              onClick={() => setAutoSubmit(!autoSubmit)}
              aria-label="切换输入后自动提交"
            />
          </div>
        </div>

        <div className="h-px bg-border my-1" />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            <Keyboard size={12} strokeWidth={1.75} />
            提交按键
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-[13px] text-text">按键 / 组合键</span>
              <span className="text-[11px] text-subtle mt-0.5">
                点击录入，Escape 取消；仅在"自动提交"开启时生效
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
