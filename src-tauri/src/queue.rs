// Injection queue — strict FIFO, single worker
//
// Producer: sidecar.rs message dispatcher, retry_history_message command
// Consumer: single tokio task spawned on startup
//
// Worker responsibilities per message:
//   1. status → Processing, emit feishu://message-status
//   2. if confirm_before_inject enabled: emit feishu://confirm-request,
//      await one-shot decision via confirm_pending_message command
//   3. perform injection (text + optional image)
//   4. status → Sent / Failed, emit feishu://message-status + feishu://inject-result
//   5. send reaction (DONE/CRY) + optional thread reply to Go sidecar

use crate::history::{HistoryMessage, HistoryStore, MessageStatus};
use crate::sidecar::{SidecarBridge, SidecarCommand, SubmitConfig};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{mpsc, oneshot, Mutex};

// 飞书 reaction emoji_type 常量。值来自飞书 open.feishu.cn 文档的枚举；
// 如某个环境下仍被拒（code 231001 "reaction type is invalid"），在此
// 一处替换即可——候选集：SMILE / LAUGH / OK / HEART / FIRE / THUMBSUP /
// SAD / SADFACE / CRY / BLUSH。
pub const REACT_RECEIVED: &str = "EYES"; // 👀 收到消息（已验证有效）
pub const REACT_SENT: &str = "OK";       // 👌 已成功输入（替换原 DONE）
pub const REACT_FAILED: &str = "SAD";    // 😢 失败（替换原 CRY）

#[derive(Debug, Clone)]
pub struct QueuedMessage {
    pub id: String,
    pub text: String,
    pub image_path: Option<String>, // 相对 typebridge_dir 的路径
    pub image_mime: Option<String>,
}

/// 注入服务：队列 sender + 唯一的待确认 oneshot
pub struct Injector {
    tx: mpsc::UnboundedSender<QueuedMessage>,
    pending_confirm: Arc<Mutex<Option<PendingConfirm>>>,
}

struct PendingConfirm {
    id: String,
    sender: oneshot::Sender<bool>,
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
        confirm_flag: Arc<std::sync::Mutex<bool>>,
        submit_config: Arc<std::sync::Mutex<SubmitConfig>>,
        bridge: Arc<SidecarBridge>,
    ) -> Arc<Self> {
        let (tx, rx) = mpsc::unbounded_channel();
        let pending_confirm: Arc<Mutex<Option<PendingConfirm>>> = Arc::new(Mutex::new(None));

        let injector = Arc::new(Self {
            tx,
            pending_confirm: pending_confirm.clone(),
        });

        tauri::async_runtime::spawn(worker_loop(
            rx,
            app,
            history,
            confirm_flag,
            submit_config,
            pending_confirm,
            bridge,
        ));

        injector
    }

    pub fn enqueue(&self, msg: QueuedMessage) -> Result<(), String> {
        self.tx.send(msg).map_err(|e| format!("queue closed: {}", e))
    }

    pub async fn resolve_pending_confirm(&self, id: &str, accept: bool) -> Result<(), String> {
        let mut guard = self.pending_confirm.lock().await;
        if let Some(p) = guard.as_ref() {
            if p.id != id {
                return Err(format!("pending confirm id mismatch: expect {}, got {}", p.id, id));
            }
        } else {
            return Err("no pending confirm".into());
        }
        let p = guard.take().unwrap();
        p.sender.send(accept).map_err(|_| "confirm receiver dropped".to_string())
    }
}

async fn worker_loop<R: Runtime>(
    mut rx: mpsc::UnboundedReceiver<QueuedMessage>,
    app: AppHandle<R>,
    history: Arc<HistoryStore>,
    confirm_flag: Arc<std::sync::Mutex<bool>>,
    submit_config: Arc<std::sync::Mutex<SubmitConfig>>,
    pending_confirm: Arc<Mutex<Option<PendingConfirm>>>,
    bridge: Arc<SidecarBridge>,
) {
    while let Some(msg) = rx.recv().await {
        process_one(
            &app,
            &history,
            &confirm_flag,
            &submit_config,
            &pending_confirm,
            &bridge,
            msg,
        )
        .await;
    }
    tracing::info!("[queue] worker loop exited");
}

async fn process_one<R: Runtime>(
    app: &AppHandle<R>,
    history: &Arc<HistoryStore>,
    confirm_flag: &Arc<std::sync::Mutex<bool>>,
    submit_config: &Arc<std::sync::Mutex<SubmitConfig>>,
    pending_confirm: &Arc<Mutex<Option<PendingConfirm>>>,
    bridge: &Arc<SidecarBridge>,
    msg: QueuedMessage,
) {
    // 1. Processing
    history.update_status(&msg.id, MessageStatus::Processing, None);
    emit_status(app, &msg.id, "processing", None);

    // 2. 可选：等待用户确认
    let confirm_enabled = *confirm_flag.lock().unwrap();
    if confirm_enabled {
        let hist_msg = history.find(&msg.id);
        let payload = serde_json::json!({
            "id": msg.id,
            "sender": hist_msg.as_ref().map(|m| m.sender.clone()).unwrap_or_default(),
            "text": msg.text.clone(),
            "image_path": msg.image_path.clone(),
        });
        let _ = app.emit("feishu://confirm-request", payload);

        let (tx, rx) = oneshot::channel::<bool>();
        {
            let mut slot = pending_confirm.lock().await;
            *slot = Some(PendingConfirm {
                id: msg.id.clone(),
                sender: tx,
            });
        }

        let accepted = rx.await.unwrap_or(false);
        if !accepted {
            fail(app, history, bridge, &msg, "用户取消");
            return;
        }
    }

    // 3. 注入文本 + 图片
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

    // 4. Sent
    history.update_status(&msg.id, MessageStatus::Sent, None);
    emit_status(app, &msg.id, "sent", None);
    let _ = app.emit(
        "feishu://inject-result",
        serde_json::json!({"success": true}),
    );
    send_reaction(bridge, &msg.id, REACT_SENT);

    // 5. 自动提交（可选）：注入完成后模拟"提交按键"
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
        // 先确认权限：未授予时不调任何 AX API，避免 macOS TCC 弹窗 / 半授予态下的 CFStringRef 段错误
        if !injector::check_accessibility() {
            return Err("辅助功能权限未授予".to_string());
        }
        if injector::get_focused_element().is_none() {
            return Err("无焦点输入框".to_string());
        }
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
        if injector::get_focused_element().is_none() {
            return Err("无焦点输入框".to_string());
        }
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
        "feishu://inject-result",
        serde_json::json!({"success": false, "reason": reason}),
    );

    // 仅在失败时同步发送表情 + thread 文字说明
    send_reaction(bridge, &msg.id, REACT_FAILED);
    bridge.send(&SidecarCommand::Reply {
        message_id: msg.id.clone(),
        text: format!("❌ 输入失败：{}", reason),
    });
}

fn emit_status<R: Runtime>(app: &AppHandle<R>, id: &str, status: &str, reason: Option<String>) {
    let _ = app.emit(
        "feishu://message-status",
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

/// Helper: 刚到的 Feishu 消息入队流程（写历史 + 发 EYES + enqueue）
pub fn ingest_message<R: Runtime>(
    app: &AppHandle<R>,
    history: &Arc<HistoryStore>,
    injector: &Arc<Injector>,
    bridge: &Arc<SidecarBridge>,
    id: String,
    sender: String,
    text: String,
    image_path: Option<String>,
    image_mime: Option<String>,
) {
    let now = now_secs();
    let msg = HistoryMessage {
        id: id.clone(),
        received_at: now,
        updated_at: now,
        sender,
        text: text.clone(),
        image_path: image_path.clone(),
        status: MessageStatus::Queued,
        failure_reason: None,
        feedback_error: None,
    };
    history.append(msg);
    let _ = app.emit("feishu://history-update", ());
    emit_status(app, &id, "queued", None);

    // 给用户一个"已看到"的表情反馈
    send_reaction(bridge, &id, REACT_RECEIVED);

    if let Err(e) = injector.enqueue(QueuedMessage {
        id,
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
