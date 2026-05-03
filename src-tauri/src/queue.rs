// Injection queue — strict FIFO, single worker
//
// Producer: sidecar.rs message dispatcher, retry_history_message command
// Consumer: single tokio task spawned on startup
//
// Worker responsibilities per message:
//   1. status → Processing, emit feishu://message-status
//   2. perform injection (text + optional image) + auto-submit key
//   3. status → Sent / Failed, emit feishu://message-status + feishu://inject-result
//   4. send reaction (DONE/CRY) + failure thread reply to Go sidecar

use crate::channel::{composite_id, ChannelId};
use crate::history::{HistoryMessage, HistoryStore, MessageStatus};
use crate::sidecar::{SidecarBridge, SidecarBridges, SidecarCommand, SubmitConfig};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::mpsc;

// 飞书 reaction emoji_type 常量。值由用户提供并在实际环境验证过；
// 如某个环境下仍被拒（code 231001 "reaction type is invalid"），在此
// 一处替换即可——候选集：Get / DONE / CRY / SMILE / LAUGH / OK /
// HEART / FIRE / THUMBSUP / SAD / SADFACE / BLUSH。
//
// ⚠ 大小写敏感：`Get` 就是首字母大写 + 后两位小写的混合形式。不要
// "归一化"成 `GET` 或 `get`，飞书两种都拒。DONE / CRY 保持全大写。
pub const REACT_RECEIVED: &str = "Get";  // 已收到消息
pub const REACT_SENT: &str = "DONE";     // ✅ 已成功输入
pub const REACT_FAILED: &str = "CRY";    // 😢 失败

#[derive(Debug, Clone)]
pub struct QueuedMessage {
    /// 复合 id：`{channel}:{source_id}`。用于 history 状态更新 / 前端事件
    /// payload / React key。
    pub id: String,
    /// 消息所属渠道。P0 仅飞书，P1 起会有钉钉 / 企微。
    pub channel: ChannelId,
    /// 平台原始 message_id。发 reaction / reply / 下载资源时给 sidecar 用。
    pub source_message_id: String,
    pub text: String,
    pub image_path: Option<String>, // 相对 typebridge_dir 的路径
    pub image_mime: Option<String>,
}

/// 注入服务：队列 sender
pub struct Injector {
    tx: mpsc::UnboundedSender<QueuedMessage>,
}

#[derive(Serialize, Clone)]
struct StatusPayload {
    id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl Injector {
    pub fn spawn<R: Runtime>(
        app: AppHandle<R>,
        history: Arc<HistoryStore>,
        submit_config: Arc<std::sync::Mutex<SubmitConfig>>,
        bridges: Arc<SidecarBridges>,
    ) -> Arc<Self> {
        let (tx, rx) = mpsc::unbounded_channel();

        let injector = Arc::new(Self { tx });

        tauri::async_runtime::spawn(worker_loop(
            rx,
            app,
            history,
            submit_config,
            bridges,
        ));

        injector
    }

    pub fn enqueue(&self, msg: QueuedMessage) -> Result<(), String> {
        self.tx.send(msg).map_err(|e| format!("queue closed: {}", e))
    }
}

async fn worker_loop<R: Runtime>(
    mut rx: mpsc::UnboundedReceiver<QueuedMessage>,
    app: AppHandle<R>,
    history: Arc<HistoryStore>,
    submit_config: Arc<std::sync::Mutex<SubmitConfig>>,
    bridges: Arc<SidecarBridges>,
) {
    while let Some(msg) = rx.recv().await {
        // 按消息渠道选 bridge 发反馈命令
        let bridge = bridges.get(msg.channel);
        process_one(&app, &history, &submit_config, &bridge, msg).await;
    }
    tracing::info!("[queue] worker loop exited");
}

async fn process_one<R: Runtime>(
    app: &AppHandle<R>,
    history: &Arc<HistoryStore>,
    submit_config: &Arc<std::sync::Mutex<SubmitConfig>>,
    bridge: &Arc<SidecarBridge>,
    msg: QueuedMessage,
) {
    // 1. Processing
    history.update_status(&msg.id, MessageStatus::Processing, None);
    emit_status(app, &msg.id, "processing", None);

    // 2. 注入文本 + 图片
    let text_ok = if msg.text.is_empty() {
        Ok(())
    } else {
        inject_text_blocking(msg.text.clone()).await
    };

    if let Err(reason) = text_ok {
        fail(app, history, bridge, &msg, &reason);
        return;
    }

    if let (Some(rel), Some(mime)) = (&msg.image_path, &msg.image_mime) {
        let abs = history.abs_image_path(rel);
        if let Err(reason) = inject_image_blocking(abs, mime.clone()).await {
            fail(app, history, bridge, &msg, &reason);
            return;
        }
    }

    // 3. Sent
    history.update_status(&msg.id, MessageStatus::Sent, None);
    emit_status(app, &msg.id, "sent", None);
    let _ = app.emit(
        "typebridge://inject-result",
        serde_json::json!({"success": true, "channel": msg.channel}),
    );
    // 发 reaction 用平台原始 message_id；仅支持 reaction 的渠道（飞书）才发
    if msg.channel.capability().reactions {
        send_reaction(bridge, &msg.source_message_id, REACT_SENT);
    }

    // 4. 自动提交（可选）：注入完成后模拟"提交按键"
    //    快照读一次配置，避免在 spawn_blocking 里再拿锁
    let (auto_submit, submit_key) = {
        let g = submit_config.lock().unwrap();
        (g.auto_submit, g.submit_key.clone())
    };
    if auto_submit {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            use crate::injector;
            if let Err(e) = injector::simulate_submit(&submit_key) {
                tracing::warn!("[auto-submit] simulate failed: {}", e);
            }
        })
        .await;
    }
}

async fn inject_text_blocking(text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use crate::injector;
        if !injector::check_accessibility() {
            return Err("辅助功能权限未授予".to_string());
        }
        // 新策略：走剪贴板 + Cmd+V，inject_text 内部自己做前台应用
        // bundle ID 保护；不再依赖 AX 焦点查询，Electron 类应用也支持
        injector::inject_text(&text)
    })
    .await
    .map_err(|e| format!("worker panic: {}", e))?
}

async fn inject_image_blocking(abs_path: std::path::PathBuf, mime: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use crate::injector;
        if !injector::check_accessibility() {
            return Err("辅助功能权限未授予".to_string());
        }
        let bytes = std::fs::read(&abs_path).map_err(|e| format!("读取图片失败: {}", e))?;
        injector::inject_image(&bytes, &mime)
    })
    .await
    .map_err(|e| format!("worker panic: {}", e))?
}

fn fail<R: Runtime>(
    app: &AppHandle<R>,
    history: &Arc<HistoryStore>,
    bridge: &Arc<SidecarBridge>,
    msg: &QueuedMessage,
    reason: &str,
) {
    history.update_status(
        &msg.id,
        MessageStatus::Failed,
        Some(reason.to_string()),
    );
    emit_status(app, &msg.id, "failed", Some(reason.to_string()));
    let _ = app.emit(
        "typebridge://inject-result",
        serde_json::json!({"success": false, "reason": reason, "channel": msg.channel}),
    );

    // 反馈仅对支持对应能力的渠道执行。飞书：reaction + thread-reply；
    // 钉钉：仅 failure_text_reply（通过 sessionWebhook 发 text）。DingTalk /
    // WeCom 的流式卡片反馈在 P2.1+ 后续版本接入。
    if msg.channel.capability().reactions {
        send_reaction(bridge, &msg.source_message_id, REACT_FAILED);
    }
    if msg.channel.capability().failure_text_reply {
        bridge.send(&SidecarCommand::Reply {
            message_id: msg.source_message_id.clone(),
            text: format!("❌ 输入失败：{}", reason),
        });
    }
}

fn emit_status<R: Runtime>(app: &AppHandle<R>, id: &str, status: &str, reason: Option<String>) {
    let _ = app.emit(
        "typebridge://message-status",
        StatusPayload {
            id: id.to_string(),
            status: status.to_string(),
            reason,
        },
    );
}

fn send_reaction(bridge: &Arc<SidecarBridge>, message_id: &str, emoji_type: &str) {
    // 本地/合成 id（retry_history_message 里 "local-*"）不是真实飞书 message_id，
    // 跳过发送以免无意义的 API 报错
    if message_id.starts_with("local-") {
        return;
    }
    bridge.send(&SidecarCommand::Reaction {
        message_id: message_id.to_string(),
        emoji_type: emoji_type.to_string(),
    });
}

/// Helper: 刚到的消息入队流程（写历史 + 发 EYES + enqueue）。
/// `source_id` 是平台原始 message_id（飞书 `om_xxx` / 钉钉 `msgXXX` / ...）；
/// 内部会构造复合 id `{channel}:{source_id}` 作为 HistoryMessage.id。
pub fn ingest_message<R: Runtime>(
    app: &AppHandle<R>,
    history: &Arc<HistoryStore>,
    injector: &Arc<Injector>,
    bridge: &Arc<SidecarBridge>,
    channel: ChannelId,
    source_id: String,
    sender: String,
    text: String,
    image_path: Option<String>,
    image_mime: Option<String>,
) {
    let now = now_secs();
    let id = composite_id(channel, &source_id);
    let msg = HistoryMessage {
        id: id.clone(),
        channel,
        source_message_id: source_id.clone(),
        received_at: now,
        updated_at: now,
        sender,
        text: text.clone(),
        image_path: image_path.clone(),
        status: MessageStatus::Queued,
        failure_reason: None,
        feedback_error: None,
        feedback_card_id: None,
    };
    history.append(msg);
    let _ = app.emit("typebridge://history-update", ());
    emit_status(app, &id, "queued", None);

    // 给用户一个"已看到"的表情反馈——仅支持 reaction 的渠道（飞书）才发
    if channel.capability().reactions {
        send_reaction(bridge, &source_id, REACT_RECEIVED);
    }

    if let Err(e) = injector.enqueue(QueuedMessage {
        id,
        channel,
        source_message_id: source_id,
        text,
        image_path,
        image_mime,
    }) {
        tracing::error!("[queue] enqueue failed: {}", e);
    }
}

fn now_secs() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
