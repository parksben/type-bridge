// Message history persistence — JSON file + images dir
//
// Storage layout:
//   ~/.typebridge/history.json            — array of HistoryMessage, sorted by received_at ASC
//   ~/.typebridge/images/<message_id>.<ext>  — raw image bytes
//
// Capacity: HISTORY_MAX entries (FIFO eviction; oldest pruned when over cap).
// Concurrency: single RwLock; writes trigger full file rewrite (cheap at this scale).

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

pub const HISTORY_MAX: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageStatus {
    Queued,
    Processing,
    Sent,
    /// 失败的原因写到 HistoryMessage.failure_reason 字段，不放进 enum。
    /// 保持 status 序列化为纯字符串 "failed" / "sent" / ...，与前端
    /// `type MessageStatus = "queued" | ...` 对齐，避免前端 CONFIG[status]
    /// 取到 undefined 崩溃。
    Failed,
}

impl MessageStatus {
    pub fn label(&self) -> &'static str {
        match self {
            MessageStatus::Queued => "queued",
            MessageStatus::Processing => "processing",
            MessageStatus::Sent => "sent",
            MessageStatus::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackError {
    /// "reaction" | "reply"
    pub kind: String,
    pub code: i64,
    pub msg: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub id: String,
    pub received_at: i64,
    pub updated_at: i64,
    pub sender: String,
    pub text: String,
    pub image_path: Option<String>, // 相对路径，相对 ~/.typebridge/
    pub status: MessageStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<String>,
    /// 机器人给该消息发表情/thread 回复时被飞书拒的结构化错误（权限不足等）。
    /// 与 status 独立——消息可能已成功注入，仅双向反馈失败。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_error: Option<FeedbackError>,
}

pub struct HistoryStore {
    file_path: PathBuf,
    images_dir: PathBuf,
    messages: RwLock<Vec<HistoryMessage>>,
}

impl HistoryStore {
    pub fn open() -> Arc<Self> {
        let base = typebridge_dir();
        let file_path = base.join("history.json");
        let images_dir = base.join("images");
        let _ = fs::create_dir_all(&base);
        let _ = fs::create_dir_all(&images_dir);

        let messages = load_from_disk(&file_path);

        let store = Arc::new(Self {
            file_path,
            images_dir,
            messages: RwLock::new(messages),
        });

        // 清理孤儿图片
        store.cleanup_orphan_images();

        store
    }

    pub fn images_dir(&self) -> &PathBuf {
        &self.images_dir
    }

    /// 返回绝对路径（给 injector 使用）
    pub fn abs_image_path(&self, rel: &str) -> PathBuf {
        typebridge_dir().join(rel)
    }

    /// 新增消息（插入后按 FIFO 淘汰至 HISTORY_MAX）
    pub fn append(&self, msg: HistoryMessage) {
        let mut evicted: Vec<HistoryMessage> = Vec::new();
        {
            let mut guard = self.messages.write().unwrap();

            // 去重：如果已存在同 id，先移除旧的（视为"被重发"）
            guard.retain(|m| m.id != msg.id);

            guard.push(msg);

            while guard.len() > HISTORY_MAX {
                evicted.push(guard.remove(0));
            }
        }

        // 清理被淘汰记录的图片
        for m in evicted {
            if let Some(rel) = m.image_path {
                let _ = fs::remove_file(self.abs_image_path(&rel));
            }
        }

        self.flush();
    }

    /// 更新状态。成功类状态清空 failure_reason；failed 时 reason 必填。
    pub fn update_status(&self, id: &str, status: MessageStatus, reason: Option<String>) -> bool {
        let mut changed = false;
        {
            let mut guard = self.messages.write().unwrap();
            if let Some(msg) = guard.iter_mut().find(|m| m.id == id) {
                msg.status = status.clone();
                msg.updated_at = now_secs();
                msg.failure_reason = match status {
                    MessageStatus::Failed => reason,
                    _ => None,
                };
                changed = true;
            }
        }
        if changed {
            self.flush();
        }
        changed
    }

    pub fn delete(&self, id: &str) -> Option<HistoryMessage> {
        let removed = {
            let mut guard = self.messages.write().unwrap();
            let pos = guard.iter().position(|m| m.id == id)?;
            Some(guard.remove(pos))
        };
        if let Some(msg) = &removed {
            if let Some(rel) = &msg.image_path {
                let _ = fs::remove_file(self.abs_image_path(rel));
            }
            self.flush();
        }
        removed
    }

    /// 把 Go sidecar 回传的 feedback_error 落到对应消息上。
    /// 若找不到消息（可能已被淘汰）直接忽略。
    pub fn attach_feedback_error(&self, id: &str, err: FeedbackError) -> bool {
        let mut changed = false;
        {
            let mut guard = self.messages.write().unwrap();
            if let Some(msg) = guard.iter_mut().find(|m| m.id == id) {
                msg.feedback_error = Some(err);
                msg.updated_at = now_secs();
                changed = true;
            }
        }
        if changed {
            self.flush();
        }
        changed
    }

    /// 创建新消息时调用，清掉可能存在的旧 feedback_error（比如消息 id
    /// 复用或 retry 场景）。内部在 append / update_status 都隐式处理了，
    /// 这里留作显式 API。
    #[allow(dead_code)]
    pub fn clear_feedback_error(&self, id: &str) -> bool {
        let mut changed = false;
        {
            let mut guard = self.messages.write().unwrap();
            if let Some(msg) = guard.iter_mut().find(|m| m.id == id) {
                if msg.feedback_error.is_some() {
                    msg.feedback_error = None;
                    msg.updated_at = now_secs();
                    changed = true;
                }
            }
        }
        if changed {
            self.flush();
        }
        changed
    }

    pub fn find(&self, id: &str) -> Option<HistoryMessage> {
        let guard = self.messages.read().unwrap();
        guard.iter().find(|m| m.id == id).cloned()
    }

    /// 倒序返回所有消息（最新在最前）
    pub fn all_desc(&self) -> Vec<HistoryMessage> {
        let guard = self.messages.read().unwrap();
        let mut v = guard.clone();
        v.reverse();
        v
    }

    /// 将 image bytes 写入 images dir，返回相对路径
    pub fn save_image(&self, message_id: &str, mime: &str, bytes: &[u8]) -> Result<String, String> {
        let ext = mime_to_ext(mime);
        let rel = format!("images/{}.{}", message_id, ext);
        let abs = self.abs_image_path(&rel);
        let mut f = fs::File::create(&abs).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        Ok(rel)
    }

    fn flush(&self) {
        let guard = self.messages.read().unwrap();
        match serde_json::to_string_pretty(&*guard) {
            Ok(json) => {
                if let Err(e) = fs::write(&self.file_path, json) {
                    tracing::error!("[history] flush failed: {}", e);
                }
            }
            Err(e) => tracing::error!("[history] serialize failed: {}", e),
        }
    }

    fn cleanup_orphan_images(&self) {
        let valid_ids: std::collections::HashSet<String> = {
            let guard = self.messages.read().unwrap();
            guard
                .iter()
                .filter_map(|m| m.image_path.as_ref().map(|p| p.clone()))
                .collect()
        };
        if let Ok(entries) = fs::read_dir(&self.images_dir) {
            for entry in entries.flatten() {
                if let Ok(rel) = entry.path().strip_prefix(typebridge_dir()) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if !valid_ids.contains(&rel_str) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

fn load_from_disk(path: &PathBuf) -> Vec<HistoryMessage> {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|e| {
            tracing::warn!("[history] parse failed, starting fresh: {}", e);
            Vec::new()
        }),
        Err(_) => Vec::new(),
    }
}

pub fn typebridge_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".typebridge"))
        .unwrap_or_else(|| PathBuf::from(".typebridge"))
}

fn now_secs() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    }
}
