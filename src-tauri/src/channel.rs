// 多渠道抽象 — ChannelId + Capability + 复合 id 工具
//
// 详见 docs/TECH_DESIGN.md §二十六 / §二十七 / §二十八。
// v0.6 P0：仅定义类型 + 复合 id helper；sidecar 协议迁移在 P1 起落地。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub enum ChannelId {
    #[serde(rename = "feishu")]
    Feishu,
    #[serde(rename = "dingtalk")]
    DingTalk,
    #[serde(rename = "wecom")]
    WeCom,
}

impl Default for ChannelId {
    fn default() -> Self {
        // 旧 HistoryMessage / 旧事件里没带 channel 字段的一律默认认为是飞书。
        // v0.5 之前 TypeBridge 只接入了飞书。
        Self::Feishu
    }
}

impl ChannelId {
    /// 用于复合 id 前缀 / IPC 事件序列化值的短名。
    pub fn key(&self) -> &'static str {
        match self {
            Self::Feishu => "feishu",
            Self::DingTalk => "dingtalk",
            Self::WeCom => "wecom",
        }
    }

    /// UI 展示名（中文简称）。
    pub fn label(&self) -> &'static str {
        match self {
            Self::Feishu => "飞书",
            Self::DingTalk => "钉钉",
            Self::WeCom => "企微",
        }
    }

    /// 对应 sidecar 二进制的 target-triple-agnostic 前缀名。
    /// Tauri shell plugin 的 `externalBin: ["binaries/<name>"]` 会按当前
    /// target 自动拼 `-<triple>` 后缀选对应二进制。
    pub fn sidecar_binary(&self) -> &'static str {
        match self {
            Self::Feishu => "feishu-bridge",
            Self::DingTalk => "dingtalk-bridge",
            Self::WeCom => "wecom-bridge",
        }
    }

    /// 渠道能力矩阵。详见 REQUIREMENTS §2.9.3 / TECH_DESIGN §二十七。
    pub fn capability(&self) -> ChannelCapability {
        match self {
            Self::Feishu => ChannelCapability {
                reactions: true,
                thread_reply: true,
                failure_text_reply: true,
                success_text_reply: false,
                streaming_reply: false,
                receive_images: true,
                requires_event_config: true,
            },
            Self::DingTalk => ChannelCapability {
                reactions: false,
                thread_reply: false,
                failure_text_reply: true,
                success_text_reply: true,
                streaming_reply: false,
                receive_images: true,
                requires_event_config: false,
            },
            Self::WeCom => ChannelCapability {
                reactions: false,
                thread_reply: false,
                failure_text_reply: false,
                success_text_reply: false,
                streaming_reply: true,
                receive_images: true,
                requires_event_config: false,
            },
        }
    }
}

/// 渠道能力矩阵。用于 UI 差异化渲染（如飞书展示事件订阅引导；钉钉/企微不展示）。
#[derive(Debug, Clone, Copy)]
pub struct ChannelCapability {
    /// 是否支持给消息加表情反应（飞书独有）
    pub reactions: bool,
    /// 是否支持 thread 内回复（飞书独有）
    pub thread_reply: bool,
    /// 是否支持给原消息回一条文字（反馈失败原因用）。飞书 / 钉钉都支持；
    /// 企微因为有 streaming_reply 更优的方案，直接走流式。
    pub failure_text_reply: bool,
    /// 是否在注入成功时也回一条 "✅ 已输入"。仅对没有 reaction / streaming
    /// 能力的渠道开启 —— 钉钉独有。
    pub success_text_reply: bool,
    /// 是否支持"同一条 bot 消息原地更新"（企微 `aibot_respond_msg` 的
    /// `stream.id + finish` 机制）。一旦为 true，queue.rs 会用它承载
    /// 🟡 处理中 / ✅ 已输入 / ❌ 失败的全生命周期反馈，屏蔽
    /// success_text_reply / failure_text_reply 分支，避免双发。
    pub streaming_reply: bool,
    /// 是否支持接收图片消息
    pub receive_images: bool,
    /// 是否需要用户在平台后台单独配置"事件订阅"（飞书独有）
    pub requires_event_config: bool,
}

/// 复合 id 前缀分隔符。选 `:` 是因为飞书 / 钉钉 / 企微的原生 message_id
/// 都不包含冒号（飞书 `om_xxx` / 钉钉 `msgXXXX` / 企微十六进制串）。
pub const COMPOSITE_ID_SEP: char = ':';

/// 构造复合 id：`{channel_key}:{source_message_id}`。
/// HistoryMessage.id 用复合形式保证跨渠道唯一。
pub fn composite_id(channel: ChannelId, source_id: &str) -> String {
    format!("{}{}{}", channel.key(), COMPOSITE_ID_SEP, source_id)
}

/// 从复合 id 拆出 `(channel, source_id)`。
/// 解析失败（无前缀或前缀不识别）时退化为 `(Feishu, 原字符串)`——这与
/// HistoryMessage 的 serde 默认值保持一致，保证迁移期的旧数据能被正确
/// 解读成飞书消息。
#[allow(dead_code)] // P0 未消费；P1 起 sidecar 命令分发需要
pub fn parse_composite_id(id: &str) -> (ChannelId, &str) {
    match id.split_once(COMPOSITE_ID_SEP) {
        Some(("feishu", rest)) => (ChannelId::Feishu, rest),
        Some(("dingtalk", rest)) => (ChannelId::DingTalk, rest),
        Some(("wecom", rest)) => (ChannelId::WeCom, rest),
        _ => (ChannelId::Feishu, id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composite_id_roundtrip() {
        let id = composite_id(ChannelId::DingTalk, "msg_abc");
        assert_eq!(id, "dingtalk:msg_abc");
        let (ch, src) = parse_composite_id(&id);
        assert_eq!(ch, ChannelId::DingTalk);
        assert_eq!(src, "msg_abc");
    }

    #[test]
    fn parse_legacy_feishu_id_without_prefix() {
        let (ch, src) = parse_composite_id("om_raw_feishu_id");
        assert_eq!(ch, ChannelId::Feishu);
        assert_eq!(src, "om_raw_feishu_id");
    }

    #[test]
    fn source_id_with_colon_inside_preserved() {
        // 虽然飞书/钉钉/企微实际 msg_id 不含冒号，split_once 只按第一个
        // 冒号分割，source_id 内部的冒号（万一存在）会被保留。
        let (ch, src) = parse_composite_id("wecom:abc:def");
        assert_eq!(ch, ChannelId::WeCom);
        assert_eq!(src, "abc:def");
    }

    #[test]
    fn channel_key_matches_serde() {
        let json = serde_json::to_string(&ChannelId::DingTalk).unwrap();
        assert_eq!(json, "\"dingtalk\"");
        assert_eq!(ChannelId::DingTalk.key(), "dingtalk");
    }
}
