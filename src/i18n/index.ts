/// 桌面 App 轻量自研 i18n。
///
/// - 字典在 dict.ts，ZH 是 source of truth
/// - 当前语言来自 Zustand store（src/store/index.ts → language 字段）
/// - useT() 返回稳定 t 函数，语言切换时所有调用方自动重渲染
/// - 持久化分两层：localStorage（首屏防闪 hint）+ Rust Settings.language（权威）
///
/// 设计权衡见 docs/TECH_DESIGN.md §三十六

import { useCallback } from "react";
import { useAppStore, type Lang } from "../store";
import { ZH, EN } from "./dict";

/// 把嵌套对象的所有叶子路径展开成 "a.b.c" 形式的联合类型。
/// dict 是 zh 结构的镜像，因此这里以 ZH 为准。
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? P extends ""
      ? K
      : `${P}.${K}`
    : Leaves<T[K], P extends "" ? K : `${P}.${K}`>;
}[keyof T & string];

export type TKey = Leaves<typeof ZH>;

const DICTS: Record<Lang, typeof ZH> = { zh: ZH, en: EN };

function lookup(dict: typeof ZH, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
}

/// 顶层 t()——语言来自当前 store 状态，组件外（事件 handler 等）也能用。
export function t(key: TKey, params?: Record<string, string | number>): string {
  const lang = useAppStore.getState().language || "zh";
  return translate(lang, key, params);
}

function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const primary = lookup(DICTS[lang], key);
  if (primary !== undefined) return interpolate(primary, params);

  // 缺失回退：en → zh，并在 dev 模式 warn
  if (lang !== "zh") {
    const fallback = lookup(DICTS.zh, key);
    if (fallback !== undefined) {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] missing ${lang}: "${key}" — falling back to zh`);
      }
      return interpolate(fallback, params);
    }
  }
  if (import.meta.env.DEV) console.warn(`[i18n] missing key: "${key}"`);
  return key;
}

/// React Hook：t + lang + setLang。组件订阅语言变化自动重渲染。
export function useI18n() {
  const lang = useAppStore((s) => s.language) || "zh";
  const setLanguage = useAppStore((s) => s.setLanguage);

  const tFn = useCallback(
    (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang]
  );

  return { t: tFn, lang, setLang: setLanguage };
}

/// 便捷的纯 t() hook（不需要 lang/setLang 时少解构一层）
export function useT() {
  return useI18n().t;
}
