import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Command,
  Info,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { type Settings, type Snippet } from "../../store";
import { useI18n } from "../../i18n";

/// 生成一个轻量 uuid（无需引入依赖）。
function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/// key 合法性：仅 [A-Za-z0-9_]，非空。
function isValidKey(k: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(k);
}

export default function QuickInputTab() {
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[]>([]);

  // 正在编辑的条目 id（"new" 表示新增草稿）；null = 无编辑器打开。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTrigger, setDraftTrigger] = useState("");
  const [draftContent, setDraftContent] = useState("");

  // 首次挂载拉设置
  useEffect(() => {
    invoke<Settings>("get_settings")
      .then((s) => {
        setEnabled(s.quick_input_enabled);
        setCaseSensitive(s.quick_input_case_sensitive);
        setSnippets(s.snippets ?? []);
      })
      .finally(() => setHydrated(true));
  }, []);

  // 变更后 debounced 持久化（merge 回写，避免清空其他 tab 字段）
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(async () => {
      const current = await invoke<Settings>("get_settings").catch(() => null);
      if (!current) return;
      await invoke("save_settings", {
        settings: {
          ...current,
          quick_input_enabled: enabled,
          quick_input_case_sensitive: caseSensitive,
          snippets,
        },
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [enabled, caseSensitive, snippets, hydrated]);

  // 校验：重复 key（按当前大小写敏感设置判断），用于编辑器内联提示
  const draftKeyError = useMemo(() => {
    const k = draftTrigger.trim();
    if (k === "") return null;
    if (!isValidKey(k)) return t("quickInput.errInvalidKey");
    // help 是内置帮助指令，不能被快捷输入覆盖
    if (k.toLowerCase() === "help") return t("quickInput.errReservedKey");
    const norm = (s: string) => (caseSensitive ? s : s.toLowerCase());
    const dup = snippets.some(
      (s) => s.id !== editingId && norm(s.trigger) === norm(k)
    );
    if (dup) return t("quickInput.errDuplicateKey");
    return null;
  }, [draftTrigger, snippets, editingId, caseSensitive, t]);

  const canSaveDraft =
    draftTrigger.trim() !== "" &&
    draftContent.trim() !== "" &&
    !draftKeyError;

  function openNew() {
    setEditingId("new");
    setDraftTrigger("");
    setDraftContent("");
  }

  function openEdit(s: Snippet) {
    setEditingId(s.id);
    setDraftTrigger(s.trigger);
    setDraftContent(s.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftTrigger("");
    setDraftContent("");
  }

  function saveDraft() {
    if (!canSaveDraft) return;
    const trigger = draftTrigger.trim();
    const content = draftContent;
    if (editingId === "new") {
      setSnippets((prev) => [
        ...prev,
        { id: uid(), trigger, content, enabled: true },
      ]);
    } else {
      setSnippets((prev) =>
        prev.map((s) =>
          s.id === editingId ? { ...s, trigger, content } : s
        )
      );
    }
    cancelEdit();
  }

  function toggleSnippet(id: string) {
    setSnippets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }

  function removeSnippet(id: string) {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) cancelEdit();
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部 intro */}
      <div
        className="flex items-center gap-2 px-6 py-3 text-[12.5px]"
        style={{
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Info size={13} strokeWidth={1.75} className="text-accent shrink-0" />
        <span>{t("quickInput.intro")}</span>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll">
        {/* 用法示例 */}
        <div
          className="mx-6 mt-4 rounded-lg px-4 py-3 text-[12px] leading-relaxed"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <div className="font-medium text-text mb-1.5">{t("quickInput.usageTitle")}</div>
          <div className="flex flex-col gap-1 text-subtle">
            <div className="flex items-start gap-2">
              <code className="tb-code">/key</code>
              <span>{t("quickInput.usageWhole")}</span>
            </div>
            <div className="flex items-start gap-2">
              <code className="tb-code">$key</code>
              <span>{t("quickInput.usageInline")}</span>
            </div>
          </div>
        </div>

        {/* 全局开关：启用 */}
        <div
          className="flex items-center justify-between px-6 py-4 mt-2 border-b transition-colors bg-surface hover:bg-surface-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
              <Command size={12} strokeWidth={1.75} />
              {t("quickInput.enableGroup")}
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] text-text">{t("quickInput.enableTitle")}</span>
              <span className="text-[11px] text-subtle mt-0.5">
                {t("quickInput.enableDesc")}
              </span>
            </div>
          </div>
          <button
            className="tb-toggle ml-4"
            data-on={enabled}
            onClick={() => setEnabled(!enabled)}
            aria-label={t("quickInput.enableTitle")}
          />
        </div>

        {/* 区分大小写 */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b transition-colors bg-surface hover:bg-surface-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex flex-col">
              <span className="text-[13px] text-text">{t("quickInput.caseTitle")}</span>
              <span className="text-[11px] text-subtle mt-0.5">
                {t("quickInput.caseDesc")}
              </span>
            </div>
          </div>
          <button
            className="tb-toggle ml-4"
            data-on={caseSensitive}
            onClick={() => setCaseSensitive(!caseSensitive)}
            aria-label={t("quickInput.caseTitle")}
            disabled={!enabled}
            style={!enabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
          />
        </div>

        {/* 条目列表标题 + 新增按钮 */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
            {t("quickInput.listGroup")}
          </span>
          <button
            onClick={openNew}
            className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={13} strokeWidth={2} />
            {t("quickInput.add")}
          </button>
        </div>

        {/* 新增草稿编辑器（置顶） */}
        {editingId === "new" && (
          <SnippetEditor
            trigger={draftTrigger}
            content={draftContent}
            keyError={draftKeyError}
            canSave={canSaveDraft}
            onTrigger={setDraftTrigger}
            onContent={setDraftContent}
            onSave={saveDraft}
            onCancel={cancelEdit}
            t={t}
          />
        )}

        {/* 列表 */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          {snippets.length === 0 && editingId !== "new" && (
            <div className="text-center text-[12px] text-subtle py-8">
              {t("quickInput.empty")}
            </div>
          )}
          {snippets.map((s) =>
            editingId === s.id ? (
              <SnippetEditor
                key={s.id}
                trigger={draftTrigger}
                content={draftContent}
                keyError={draftKeyError}
                canSave={canSaveDraft}
                onTrigger={setDraftTrigger}
                onContent={setDraftContent}
                onSave={saveDraft}
                onCancel={cancelEdit}
                t={t}
              />
            ) : (
              <div
                key={s.id}
                className="flex items-start gap-3 px-3.5 py-3 rounded-lg transition-colors"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  opacity: s.enabled ? 1 : 0.55,
                }}
              >
                <code className="tb-code shrink-0 mt-0.5">{s.trigger}</code>
                <span className="flex-1 text-[12.5px] text-text whitespace-pre-wrap break-words leading-snug min-w-0">
                  {s.content}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="tb-toggle-sm"
                    data-on={s.enabled}
                    onClick={() => toggleSnippet(s.id)}
                    aria-label={t("quickInput.toggleItem")}
                  />
                  <button
                    onClick={() => openEdit(s)}
                    className="p-1.5 rounded-md text-muted hover:text-text transition-colors"
                    aria-label={t("quickInput.edit")}
                  >
                    <Pencil size={13} strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => removeSnippet(s.id)}
                    className="p-1.5 rounded-md text-muted hover:text-error transition-colors"
                    aria-label={t("quickInput.delete")}
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SnippetEditor({
  trigger,
  content,
  keyError,
  canSave,
  onTrigger,
  onContent,
  onSave,
  onCancel,
  t,
}: {
  trigger: string;
  content: string;
  keyError: string | null;
  canSave: boolean;
  onTrigger: (v: string) => void;
  onContent: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  t: (k: any) => string;
}) {
  return (
    <div
      className="mx-6 mb-2 rounded-lg px-4 py-3.5 flex flex-col gap-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--accent)" }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
          {t("quickInput.fieldTrigger")}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-subtle text-[13px] select-none">/</span>
          <input
            value={trigger}
            onChange={(e) => onTrigger(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            placeholder={t("quickInput.placeholderTrigger")}
            className="flex-1 px-2.5 py-1.5 rounded-md text-[13px] outline-none"
            style={{
              background: "var(--surface)",
              border: `1px solid ${keyError ? "var(--error)" : "var(--border)"}`,
              color: "var(--text)",
            }}
            autoFocus
          />
        </div>
        {keyError && (
          <span className="text-[11px] text-error mt-0.5">{keyError}</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
          {t("quickInput.fieldContent")}
        </label>
        <textarea
          value={content}
          onChange={(e) => onContent(e.target.value)}
          placeholder={t("quickInput.placeholderContent")}
          rows={3}
          className="px-2.5 py-1.5 rounded-md text-[13px] outline-none resize-y leading-snug"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md text-muted hover:text-text transition-colors"
        >
          <X size={13} strokeWidth={1.75} />
          {t("quickInput.cancel")}
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-md transition-colors"
          style={{
            background: canSave ? "var(--accent)" : "var(--surface)",
            color: canSave ? "#fff" : "var(--subtle)",
            border: canSave ? "none" : "1px solid var(--border)",
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          <Check size={13} strokeWidth={2} />
          {t("quickInput.save")}
        </button>
      </div>
    </div>
  );
}
