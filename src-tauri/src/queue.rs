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
//
// 取消机制：用户删除历史条目 / 清空历史时，会把对应 id 加入 cancelled 集合。
// 消息可能已经在 mpsc 队列里排队（但还没被 worker 消费），worker 拿到消息后
// 先查 cancelled，命中则跳过注入，只 emit 取消状态让 UI 同步。

use crate::channel::{composite_id, ChannelId};
use crate::history::{HistoryMessage, HistoryStore, MessageStatus};
use crate::sidecar::{SidecarBridge, SidecarBridges, SidecarCommand, SubmitConfig};
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
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
    /// 控制键事件（KeyboardEvent.code）。Some 时 worker 跳过文本/图片粘贴流程，
    /// 直接 simulate_submit；不写历史，不发反馈。详见 TECH_DESIGN §35.11。
    pub key: Option<String>,
    /// 为 true 时跳过全局 auto_submit 步骤。WebChat 渠道由手机端显式控制
    /// 是否发送 Enter，不应受桌面端「自动提交」开关影响。
    pub no_auto_submit: bool,
}

/// 注入服务：队列 sender
pub struct Injector {
    tx: mpsc::UnboundedSender<QueuedMessage>,
    /// 被标记"取消"的消息 id 集合。用户清空历史 / 删除单条历史时把 id 塞进来，
    /// worker 从 mpsc 拿到消息后先查此集合，命中则跳过注入。
    cancelled: Arc<Mutex<HashSet<String>>>,
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
        let cancelled = Arc::new(Mutex::new(HashSet::new()));

        let injector = Arc::new(Self {
            tx,
            cancelled: cancelled.clone(),
        });

        tauri::async_runtime::spawn(worker_loop(
            rx,
            app,
            history,
            submit_config,
            bridges,
            cancelled,
        ));

        injector
    }

    pub fn enqueue(&self, msg: QueuedMessage) -> Result<(), String> {
        self.tx.send(msg).map_err(|e| format!("queue closed: {}", e))
    }

    /// 取消单条消息的注入。如果该消息已经在 mpsc 队列里（尚未被 worker 消费），
    /// worker 收到时会跳过。如果已经在注入中或已完成，此调用无副作用。
    pub fn cancel(&self, id: &str) {
        if let Ok(mut set) = self.cancelled.lock() {
            set.insert(id.to_string());
        }
    }

    /// 批量取消（清空历史场景）。给定 id 列表全部标记为取消。
    pub fn cancel_many(&self, ids: &[String]) {
        if let Ok(mut set) = self.cancelled.lock() {
            for id in ids {
                set.insert(id.clone());
            }
        }
    }
}

async fn worker_loop<R: Runtime>(
    mut rx: mpsc::UnboundedReceiver<QueuedMessage>,
    app: AppHandle<R>,
    history: Arc<HistoryStore>,
    submit_config: Arc<std::sync::Mutex<SubmitConfig>>,
    bridges: Arc<SidecarBridges>,
    cancelled: Arc<Mutex<HashSet<String>>>,
) {
    while let Some(msg) = rx.recv().await {
        // 用户在入队后、注入前清空 / 删除了该历史条目 → 跳过注入
        let skip = cancelled
            .lock()
            .map(|mut set| set.remove(&msg.id))
            .unwrap_or(false);
        if skip {
            tracing::info!("[queue] skip cancelled message {}", msg.id);
            // history 可能已经被删了，这里 update_status 是 no-op；emit 给 UI 补一下
            // 以防用户在队列消费延迟期间切到了其他 tab 又切回来。
            history.update_status(&msg.id, MessageStatus::Failed, Some("已取消".into()));
            emit_status(&app, &msg.id, "cancelled", Some("已取消".into()));
            continue;
        }
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
    // 控制键事件分支：直接模拟一次按键，不走粘贴流程，不写历史，不发反馈。
    // 详见 TECH_DESIGN §35.11
    if let Some(code) = msg.key.clone() {
        process_key_press(app, &msg, &code).await;
        return;
    }

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
    let cap = msg.channel.capability();
    if cap.reactions {
        send_reaction(bridge, &msg.source_message_id, REACT_SENT);
    }
    // 反馈 precedence：streaming_reply > success_text_reply
    //   - 企微：同一条 bot 消息原地更新为 ✅ 已输入（关闭流）
    //   - 钉钉：发一条新的 "✅ 已输入" 文字回执
    //   - 飞书：已通过 reaction 反馈，不再发文字
    if cap.streaming_reply && !msg.source_message_id.starts_with("local-") {
        bridge.send(&SidecarCommand::StreamingReply {
            message_id: msg.source_message_id.clone(),
            content: "✅ 已输入".to_string(),
            finish: true,
        });
    } else if cap.success_text_reply && !msg.source_message_id.starts_with("local-") {
        bridge.send(&SidecarCommand::Reply {
            message_id: msg.source_message_id.clone(),
            text: "✅ 已输入".to_string(),
        });
    }

    // 4. 自动提交（可选）：注入完成后模拟"提交按键"
    //    快照读一次配置，避免在 spawn_blocking 里再拿锁
    //    WebChat 消息带 no_auto_submit=true，由手机端显式控制是否发 Enter。
    let (auto_submit, submit_key) = {
        let g = submit_config.lock().unwrap();
        (g.auto_submit, g.submit_key.clone())
    };
    if auto_submit && !msg.no_auto_submit {
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

/// 控制键事件分支：用户从 WebChat 手机端点了 Enter / Backspace / Arrow*。
/// 不走剪贴板，不发任何 IM 反馈，不写历史；只 emit message-status 让
/// webchat_server 的 pending_acks 能 ack 回手机。
async fn process_key_press<R: Runtime>(app: &AppHandle<R>, msg: &QueuedMessage, code: &str) {
    emit_status(app, &msg.id, "processing", None);

    let code_owned = code.to_string();
    let join = tauri::async_runtime::spawn_blocking(move || {
        use crate::injector;
        if !injector::check_accessibility() {
            return Err("辅助功能权限未授予".to_string());
        }
        let sk = crate::store::SubmitKey {
            key: code_owned,
            cmd: false,
            shift: false,
            option: false,
            ctrl: false,
        };
        injector::simulate_submit(&sk)
    })
    .await;

    let result: Result<(), String> = match join {
        Ok(inner) => inner,
        Err(e) => Err(format!("worker panic: {}", e)),
    };

    match result {
        Ok(_) => {
            emit_status(app, &msg.id, "sent", None);
            let _ = app.emit(
                "typebridge://inject-result",
                serde_json::json!({"success": true, "channel": msg.channel}),
            );
        }
        Err(reason) => {
            emit_status(app, &msg.id, "failed", Some(reason.clone()));
            let _ = app.emit(
                "typebridge://inject-result",
                serde_json::json!({"success": false, "reason": reason, "channel": msg.channel}),
            );
        }
    }
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

    // 反馈 precedence（与成功路径一致）：
    //   - 飞书 reactions=true → 贴 CRY 表情 + thread 文字回复原因
    //   - 企微 streaming_reply=true → 同 stream.id 原地更新为 ❌ + finish 关闭流
    //   - 钉钉 failure_text_reply=true → 发一条新 "❌ 输入失败：..." 文字回执
    let cap = msg.channel.capability();
    if cap.reactions {
        send_reaction(bridge, &msg.source_message_id, REACT_FAILED);
    }
    if cap.streaming_reply && !msg.source_message_id.starts_with("local-") {
        bridge.send(&SidecarCommand::StreamingReply {
            message_id: msg.source_message_id.clone(),
            content: format!("❌ 输入失败：{}", reason),
            finish: true,
        });
    } else if cap.failure_text_reply {
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

    // 给用户一个"已看到"的反馈。precedence：
    //   - reactions (飞书)   → 贴 EYES 表情在原消息上
    //   - streaming_reply (企微) → 发流式消息 "🟡 处理中..."（同 stream.id 后续 update）
    //   - 其他渠道（钉钉）不发中间态，避免双条反馈刷屏
    let cap = channel.capability();
    if cap.reactions {
        send_reaction(bridge, &source_id, REACT_RECEIVED);
    } else if cap.streaming_reply && !source_id.starts_with("local-") {
        bridge.send(&SidecarCommand::StreamingReply {
            message_id: source_id.clone(),
            content: "🟡 处理中...".to_string(),
            finish: false,
        });
    }

    if let Err(e) = injector.enqueue(QueuedMessage {
        id,
        channel,
        source_message_id: source_id,
        text,
        image_path,
        image_mime,
        key: None,
        no_auto_submit: false,
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
