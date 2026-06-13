// /help 指令：识别 + 生成帮助文本
//
// 设计要点：
//   - `help` 是系统保留触发词（前端 QuickInputTab 禁止新增同名快捷输入）。
//   - 各渠道在「入队注入之前」调用 is_help_command 判定，命中则不注入、不写历史，
//     改由 bot 回一条帮助文本（WebChat 走 socket emit，IM 走 Reply）。
//   - 帮助文本 = 固定能力说明 + 动态列出当前【启用】的快捷输入触发词。
//
// 语言：根据 Settings.language（"zh" / "en" / 空）选择，空默认中文。

use crate::sidecar::QuickInputConfig;

/// 系统保留的帮助指令触发词（不含前导 `/`）。
pub const HELP_TRIGGER: &str = "help";

/// 判断一条消息文本是否是 `/help` 指令（trim 后整条恰好是 `/help`，大小写不敏感）。
pub fn is_help_command(text: &str) -> bool {
    let t = text.trim();
    if let Some(rest) = t.strip_prefix('/') {
        return rest.eq_ignore_ascii_case(HELP_TRIGGER);
    }
    false
}

/// 是否中文。空 / 非 "en" 一律按中文（与产品默认一致）。
fn is_zh(lang: &str) -> bool {
    lang != "en"
}

/// 生成 `/help` 帮助文本。
///
/// `lang`：Settings.language（"zh" / "en" / ""）。
/// `cfg`：当前快捷输入运行时配置，用于动态列出启用的触发词。
pub fn build_help_text(lang: &str, cfg: &QuickInputConfig) -> String {
    let zh = is_zh(lang);

    // 收集启用的触发词（含一行内容预览，截断）
    let enabled: Vec<&crate::store::Snippet> =
        cfg.snippets.iter().filter(|s| s.enabled).collect();

    let mut out = String::new();

    if zh {
        out.push_str("📝 TypeBridge 帮助\n\n");
        out.push_str("· 发文字 → 自动输入到桌面当前聚焦的输入框\n");
        out.push_str("· 发图片 → 通过剪贴板粘贴到输入框\n");
        if cfg.enabled {
            out.push_str("· 快捷输入：发 /触发词 整条替换；句中用 $触发词 内联拼接\n");
        }
        out.push_str("· /help → 查看本说明\n");
    } else {
        out.push_str("📝 TypeBridge Help\n\n");
        out.push_str("· Send text → auto-typed into your focused desktop input\n");
        out.push_str("· Send an image → pasted into the input via clipboard\n");
        if cfg.enabled {
            out.push_str(
                "· Quick inputs: send /trigger to replace the whole message; use $trigger inline\n",
            );
        }
        out.push_str("· /help → show this guide\n");
    }

    // 动态列出启用的快捷输入
    if cfg.enabled && !enabled.is_empty() {
        out.push('\n');
        out.push_str(if zh {
            "可用的快捷输入：\n"
        } else {
            "Your quick inputs:\n"
        });
        const MAX_LIST: usize = 20;
        for s in enabled.iter().take(MAX_LIST) {
            let preview = preview_content(&s.content);
            out.push_str(&format!("  /{}  →  {}\n", s.trigger, preview));
        }
        if enabled.len() > MAX_LIST {
            let more = enabled.len() - MAX_LIST;
            out.push_str(&if zh {
                format!("  …… 还有 {} 条\n", more)
            } else {
                format!("  … and {} more\n", more)
            });
        }
    } else if cfg.enabled {
        out.push('\n');
        out.push_str(if zh {
            "（还没有添加快捷输入，可在桌面 App「快捷输入」中添加）"
        } else {
            "(No quick inputs yet — add them in the desktop app's \"Quick Inputs\" tab)"
        });
    }

    out
}

/// 单行内容预览：把换行折成空格，超长截断。
fn preview_content(content: &str) -> String {
    let one_line: String = content.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX: usize = 40;
    if one_line.chars().count() > MAX {
        let truncated: String = one_line.chars().take(MAX).collect();
        format!("{}…", truncated)
    } else {
        one_line
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Snippet;

    fn cfg(enabled: bool, pairs: &[(&str, &str)]) -> QuickInputConfig {
        QuickInputConfig {
            enabled,
            case_sensitive: false,
            snippets: pairs
                .iter()
                .map(|(t, c)| Snippet {
                    id: t.to_string(),
                    trigger: t.to_string(),
                    content: c.to_string(),
                    enabled: true,
                })
                .collect(),
        }
    }

    #[test]
    fn detects_help() {
        assert!(is_help_command("/help"));
        assert!(is_help_command("  /help  "));
        assert!(is_help_command("/HELP"));
        assert!(!is_help_command("/helpme"));
        assert!(!is_help_command("help"));
        assert!(!is_help_command("/addr"));
    }

    #[test]
    fn help_text_lists_triggers() {
        let c = cfg(true, &[("addr", "北京中关村1号"), ("sig", "—— 张三")]);
        let txt = build_help_text("zh", &c);
        assert!(txt.contains("/addr"));
        assert!(txt.contains("/sig"));
        assert!(txt.contains("快捷输入"));
    }

    #[test]
    fn help_text_en() {
        let c = cfg(true, &[]);
        let txt = build_help_text("en", &c);
        assert!(txt.contains("Help"));
        assert!(txt.contains("No quick inputs yet"));
    }

    #[test]
    fn help_text_quick_disabled_hides_section() {
        let c = cfg(false, &[("addr", "x")]);
        let txt = build_help_text("zh", &c);
        assert!(!txt.contains("/addr"));
    }
}
