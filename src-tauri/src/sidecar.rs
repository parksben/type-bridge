// Sidecar 进程管理 + Go stdout 事件分发。
//
// 本模块职责：启动 Go sidecar、读取其 stdout 的 JSON Lines、转交给
// history + queue 进行入队处理；不再直接执行注入（那是 queue.rs 的事）。
//
// v0.6 P1：从单飞书 sidecar 扩展到多渠道。每个已配置凭据的渠道启一个
// 独立 Go sidecar 进程；AppContext 持有 per-channel SidecarBridge。
// 事件协议不变（JSON Lines），但前端事件命名空间从 feishu://* 统一为
// typebridge://*，payload 带 channel 字段，前端据此分路到渠道状态。

use crate::channel::ChannelId;
use crate::history::HistoryStore;
use crate::queue::{ingest_message, Injector};
use crate::webchat::WebChatBridge;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex as TokioMutex};

/// Rust → Go 命令（通过 sidecar stdin 发送，JSON Lines）
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum SidecarCommand {
    /// 飞书内部 reaction 命令；P1 Rust 侧仍直接用，P2 起统一走 feedback_*
    Reaction { message_id: String, emoji_type: String },
    /// 飞书内部 reply 命令；同上
    Reply { message_id: String, text: String },
    /// 企微专用：同一 stream.id 原地更新流式消息（🟡 处理中 → ✅ 已输入 / ❌ 失败）。
    /// Rust 只传 message_id + content + finish；req_id / stream_id 由 wecom-bridge
    /// 内部 sync.Map 维护，封装在 Go 侧（详见 TECH_DESIGN §31.4）。
    StreamingReply {
        message_id: String,
        content: String,
        finish: bool,
    },
    /// selftest：让 sidecar 执行该渠道的凭据 / scope 自检
    Selftest,
}

/// 消息链路每个 API 的 probe 结论
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProbeResult {
    pub id: String,
    pub label: String,
    pub scope_hint: String,
    pub ok: bool,
    #[serde(default)]
    pub code: i64,
    #[serde(default)]
    pub msg: String,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    pub help_url: String,
}

/// selftest 执行结果（Go 返回，Rust 传给前端 invoke 调用者）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SelftestResult {
    pub credentials_ok: bool,
    #[serde(default)]
    pub credentials_reason: String,
    #[serde(default)]
    pub probes: Vec<ProbeResult>,
}

/// 包装 Go sidecar 子进程，允许随时写入命令（stdin）。每个渠道一个实例。
#[derive(Default)]
pub struct SidecarBridge {
    child: Mutex<Option<CommandChild>>,
}

impl SidecarBridge {
    pub fn set(&self, child: CommandChild) {
        let mut g = self.child.lock().unwrap();
        *g = Some(child);
    }

    pub fn clear(&self) {
        let mut g = self.child.lock().unwrap();
        *g = None;
    }

    pub fn is_connected(&self) -> bool {
        self.child.lock().unwrap().is_some()
    }

    pub fn send(&self, cmd: &SidecarCommand) {
        let mut line = match serde_json::to_vec(cmd) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!("[sidecar stdin] serialize failed: {}", e);
                return;
            }
        };
        line.push(b'\n');

        let mut guard = self.child.lock().unwrap();
        match guard.as_mut() {
            Some(c) => {
                if let Err(e) = c.write(&line) {
                    tracing::warn!("[sidecar stdin] write failed: {}", e);
                }
            }
            None => {
                tracing::debug!("[sidecar stdin] not connected, command dropped: {:?}", cmd);
            }
        }
    }
}

/// 按 ChannelId 索引的 SidecarBridge 集合。未配置的渠道对应一个空 bridge
/// （is_connected = false）。
pub struct SidecarBridges {
    inner: HashMap<ChannelId, Arc<SidecarBridge>>,
}

impl SidecarBridges {
    pub fn new() -> Self {
        let mut inner = HashMap::new();
        inner.insert(ChannelId::Feishu, Arc::new(SidecarBridge::default()));
        inner.insert(ChannelId::DingTalk, Arc::new(SidecarBridge::default()));
        inner.insert(ChannelId::WeCom, Arc::new(SidecarBridge::default()));
        Self { inner }
    }

    pub fn get(&self, channel: ChannelId) -> Arc<SidecarBridge> {
        // 未配置的渠道也返回一个 empty bridge，避免 Option 到处传
        self.inner
            .get(&channel)
            .cloned()
            .unwrap_or_else(|| Arc::new(SidecarBridge::default()))
    }
}

impl Default for SidecarBridges {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SidecarEvent {
    Status { connected: bool },
    Message {
        #[serde(default)]
        message_id: Option<String>,
        #[serde(default)]
        sender: String,
        #[serde(default)]
        text: String,
        #[serde(default)]
        ts: String,
    },
    Image {
        message_id: String,
        #[serde(default)]
        data: String,
        #[serde(default)]
        mime: String,
        #[serde(default)]
        sender: String,
        #[serde(default)]
        text: String,
    },
    Error { msg: String },
    SelftestResult {
        #[serde(default)]
        credentials_ok: bool,
        #[serde(default)]
        credentials_reason: String,
        #[serde(default)]
        probes: Vec<ProbeResult>,
    },
    FeedbackError {
        message_id: String,
        kind: String,
        code: i64,
        msg: String,
    },
}

/// 前端事件 payload：所有渠道相关事件都带 channel 字段。frontend 据此分路。
#[derive(Debug, Clone, Serialize)]
pub struct ChannelStatusPayload {
    pub channel: ChannelId,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChannelMessagePayload {
    pub channel: ChannelId,
    pub message_id: Option<String>,
    pub sender: String,
    pub text: String,
    pub ts: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChannelImagePayload {
    pub channel: ChannelId,
    pub message_id: String,
    pub sender: String,
    pub text: String,
    pub mime: String,
    // data 不回放给前端（base64 很大）；前端靠 message 历史里的 image_path 拿
}

/// 应用共享上下文 — 用 tauri::Manager::manage 注入，每个 field 自行并发控制
pub struct AppContext {
    pub submit_config: Arc<Mutex<SubmitConfig>>,
    pub history: Arc<HistoryStore>,
    pub injector: Arc<Injector>,
    pub bridges: Arc<SidecarBridges>,
    /// WebChat 渠道桥（不走 sidecar，Rust 内建 HTTP 轮询）
    pub webchat: Arc<WebChatBridge>,
    /// 等待中的 selftest 回执 sender，按渠道分槽。每个渠道同时最多一个在途。
    pub pending_selftests: Arc<TokioMutex<HashMap<ChannelId, oneshot::Sender<SelftestResult>>>>,
}

/// "输入后自动提交"相关配置（auto_submit + 目标按键），集中在一把 Mutex 里
/// 读写频次低，锁竞争可忽略。
pub struct SubmitConfig {
    pub auto_submit: bool,
    pub submit_key: crate::store::SubmitKey,
}

impl Default for SubmitConfig {
    fn default() -> Self {
        Self {
            auto_submit: true,
            submit_key: crate::store::SubmitKey::default(),
        }
    }
}

impl AppContext {
    pub fn new<R: Runtime>(
        app: AppHandle<R>,
        initial_submit: SubmitConfig,
    ) -> Arc<Self> {
        let history = HistoryStore::open();
        let submit_config = Arc::new(Mutex::new(initial_submit));
        let bridges: Arc<SidecarBridges> = Arc::new(SidecarBridges::new());
        let injector = Injector::spawn(
            app.clone(),
            history.clone(),
            submit_config.clone(),
            bridges.clone(),
        );

        Arc::new(Self {
            submit_config,
            history,
            injector,
            bridges,
            webchat: Arc::new(WebChatBridge::new()),
            pending_selftests: Arc::new(TokioMutex::new(HashMap::new())),
        })
    }

    pub fn set_submit_config(&self, auto_submit: bool, submit_key: crate::store::SubmitKey) {
        let mut g = self.submit_config.lock().unwrap();
        g.auto_submit = auto_submit;
        g.submit_key = submit_key;
    }
}

// ──────────────────────────────────────────────────────────────
// 通用 sidecar 启动 / 事件分发
// ──────────────────────────────────────────────────────────────

/// 启动某个渠道的 sidecar 进程，绑定 stdin/stdout 到 AppContext。
///
/// `envs` 是该渠道需要传给 Go sidecar 的环境变量（凭据）。
///
/// 注意：本函数仅适用于带 sidecar 二进制的渠道（feishu / dingtalk / wecom）。
/// WebChat 不走 sidecar，由 [`crate::webchat`] 模块独立处理。
async fn start_sidecar<R: Runtime>(
    app: AppHandle<R>,
    channel: ChannelId,
    envs: Vec<(String, String)>,
) -> Result<(), String> {
    let bin = channel
        .sidecar_binary()
        .ok_or_else(|| format!("channel {} has no sidecar binary", channel.key()))?;
    let shell = app.shell();
    let mut cmd = shell.sidecar(bin).map_err(|e| e.to_string())?;
    for (k, v) in envs {
        cmd = cmd.env(&k, &v);
    }
    let (mut rx, child) = cmd.spawn().map_err(|e| e.to_string())?;

    // 把 child 存进对应 bridge，供 queue worker 向 stdin 写命令
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.bridges.get(channel).set(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut retry_delay = 2u64;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    tracing::info!("[{}-bridge] {}", channel.key(), text.trim());

                    match serde_json::from_str::<SidecarEvent>(text.trim()) {
                        Ok(evt) => dispatch_event(&app_handle, channel, &evt, &mut retry_delay),
                        Err(e) => {
                            tracing::warn!(
                                "[{}-bridge] failed to parse event: {} | raw: {}",
                                channel.key(),
                                e,
                                text.trim()
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    tracing::warn!(
                        "[{}-bridge stderr] {}",
                        channel.key(),
                        String::from_utf8_lossy(&line).trim()
                    );
                }
                CommandEvent::Terminated(_) => {
                    tracing::warn!(
                        "[{}-bridge] terminated, retrying in {}s",
                        channel.key(),
                        retry_delay
                    );
                    // 子进程终止，清理 bridge 里的旧 child（防止向死 stdin 写）
                    let ctx: Arc<AppContext> =
                        app_handle.state::<Arc<AppContext>>().inner().clone();
                    ctx.bridges.get(channel).clear();

                    let _ = app_handle.emit(
                        "typebridge://status",
                        ChannelStatusPayload {
                            channel,
                            connected: false,
                        },
                    );
                    tokio::time::sleep(Duration::from_secs(retry_delay)).await;
                    retry_delay = (retry_delay * 2).min(60);
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn dispatch_event<R: Runtime>(
    app: &AppHandle<R>,
    channel: ChannelId,
    evt: &SidecarEvent,
    retry_delay: &mut u64,
) {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();

    match evt {
        SidecarEvent::Status { connected } => {
            if *connected {
                *retry_delay = 2;
            }
            let _ = app.emit(
                "typebridge://status",
                ChannelStatusPayload {
                    channel,
                    connected: *connected,
                },
            );
        }
        SidecarEvent::Message { message_id, sender, text, ts } => {
            let source_id = message_id
                .clone()
                .unwrap_or_else(|| format!("local-{}", uuid::Uuid::new_v4()));
            let _ = app.emit(
                "typebridge://message",
                ChannelMessagePayload {
                    channel,
                    message_id: message_id.clone(),
                    sender: sender.clone(),
                    text: text.clone(),
                    ts: ts.clone(),
                },
            );
            let bridge = ctx.bridges.get(channel);
            ingest_message(
                app,
                &ctx.history,
                &ctx.injector,
                &bridge,
                channel,
                source_id,
                sender.clone(),
                text.clone(),
                None,
                None,
            );
        }
        SidecarEvent::Image { message_id, data, mime, sender, text } => {
            let _ = app.emit(
                "typebridge://image",
                ChannelImagePayload {
                    channel,
                    message_id: message_id.clone(),
                    sender: sender.clone(),
                    text: text.clone(),
                    mime: mime.clone(),
                },
            );

            // base64 → 保存到 images dir → 入队
            let bytes = match base64_decode(data) {
                Ok(b) => b,
                Err(e) => {
                    tracing::error!("[{}-bridge] base64 decode failed: {}", channel.key(), e);
                    return;
                }
            };
            let rel = match ctx.history.save_image(channel, message_id, mime, &bytes) {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!("[{}-bridge] save image failed: {}", channel.key(), e);
                    return;
                }
            };
            let bridge = ctx.bridges.get(channel);
            ingest_message(
                app,
                &ctx.history,
                &ctx.injector,
                &bridge,
                channel,
                message_id.clone(),
                sender.clone(),
                text.clone(),
                Some(rel),
                Some(mime.clone()),
            );
        }
        SidecarEvent::Error { msg } => {
            tracing::error!("[{}-bridge] {}", channel.key(), msg);
            // 注意：不 emit status；一次 API 业务错不等于长连接断开
        }
        SidecarEvent::SelftestResult { credentials_ok, credentials_reason, probes } => {
            // 唤醒该渠道正在等待的 run_selftest command
            let result = SelftestResult {
                credentials_ok: *credentials_ok,
                credentials_reason: credentials_reason.clone(),
                probes: probes.clone(),
            };
            let pending = ctx.pending_selftests.clone();
            tauri::async_runtime::spawn(async move {
                let mut map = pending.lock().await;
                if let Some(sender) = map.remove(&channel) {
                    let _ = sender.send(result);
                }
            });
        }
        SidecarEvent::FeedbackError { message_id, kind, code, msg } => {
            tracing::warn!(
                "[{}-bridge feedback] {} on {} failed: code={} msg={}",
                channel.key(),
                kind,
                message_id,
                code,
                msg
            );
            let help_url = extract_help_url(msg);
            let err = crate::history::FeedbackError {
                kind: kind.clone(),
                code: *code,
                msg: msg.clone(),
                help_url,
            };
            let composite = ctx
                .history
                .find_by_source(channel, message_id)
                .map(|m| m.id);
            if let Some(cid) = composite {
                if ctx.history.attach_feedback_error(&cid, err) {
                    let _ = app.emit("typebridge://history-update", ());
                }
            }
        }
    }
}

/// 从飞书错误文案里抠 URL；现在官方错误大都会附带一个
/// https://open.feishu.cn/app/xxx/auth?... 的 deep link，直接让 UI
/// 点击跳转即可。
fn extract_help_url(msg: &str) -> Option<String> {
    // 最简朴的 URL 提取：在 "https://" 之后一路取到空白或中文
    let start = msg.find("https://")?;
    let tail = &msg[start..];
    let end = tail
        .find(|c: char| c.is_whitespace() || (c as u32) > 0x7F)
        .unwrap_or(tail.len());
    Some(tail[..end].trim_end_matches(|c: char| matches!(c, '.' | ',' | '。' | '，' | ')' | '）')).to_string())
}

// ──────────────────────────────────────────────────────────────
// Tauri 命令：启动 / 停止 / 自检（渠道通用）
// ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_feishu<R: Runtime>(
    app: AppHandle<R>,
    app_id: String,
    app_secret: String,
) -> Result<(), String> {
    start_sidecar(
        app,
        ChannelId::Feishu,
        vec![
            ("FEISHU_APP_ID".to_string(), app_id),
            ("FEISHU_APP_SECRET".to_string(), app_secret),
        ],
    )
    .await
}

#[tauri::command]
pub async fn start_dingtalk<R: Runtime>(
    app: AppHandle<R>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    start_sidecar(
        app,
        ChannelId::DingTalk,
        vec![
            ("DINGTALK_CLIENT_ID".to_string(), client_id),
            ("DINGTALK_CLIENT_SECRET".to_string(), client_secret),
        ],
    )
    .await
}

#[tauri::command]
pub async fn start_wecom<R: Runtime>(
    app: AppHandle<R>,
    bot_id: String,
    secret: String,
) -> Result<(), String> {
    start_sidecar(
        app,
        ChannelId::WeCom,
        vec![
            ("WECOM_BOT_ID".to_string(), bot_id),
            ("WECOM_SECRET".to_string(), secret),
        ],
    )
    .await
}

/// 停止某渠道 sidecar。现在只发 status:false 事件并依赖 Terminated 清理；
/// 真正的 child.kill() 留给 Tauri 进程生命周期处理。
#[tauri::command]
pub fn stop_channel<R: Runtime>(app: AppHandle<R>, channel: ChannelId) {
    let _ = app.emit(
        "typebridge://status",
        ChannelStatusPayload {
            channel,
            connected: false,
        },
    );
}

/// 对某渠道发 selftest 命令，等待该渠道 sidecar 回执（10s 超时）。
#[tauri::command]
pub async fn run_selftest<R: Runtime>(
    app: AppHandle<R>,
    channel: ChannelId,
) -> Result<SelftestResult, String> {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    let bridge = ctx.bridges.get(channel);

    if !bridge.is_connected() {
        return Err("长连接尚未建立，请先点击「启动长连接」".into());
    }

    let (tx, rx) = oneshot::channel::<SelftestResult>();
    {
        let mut map = ctx.pending_selftests.lock().await;
        // 如果同渠道已有 pending，直接丢弃旧的
        map.insert(channel, tx);
    }

    bridge.send(&SidecarCommand::Selftest);

    match tokio::time::timeout(Duration::from_secs(10), rx).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err("selftest 通道被释放".into()),
        Err(_) => {
            // 超时：清掉对应槽位，避免后续结果被错配
            let mut map = ctx.pending_selftests.lock().await;
            map.remove(&channel);
            Err("selftest 超时（10s），请检查网络或 sidecar 进程状态".into())
        }
    }
}

// ──────────────────────────────────────────────────────────────
// 历史 / 剪贴板相关 Tauri 命令
// ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_history<R: Runtime>(app: AppHandle<R>) -> Vec<crate::history::HistoryMessage> {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.history.all_desc()
}

#[tauri::command]
pub fn get_history_dir() -> String {
    crate::history::typebridge_dir()
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn delete_history_message<R: Runtime>(app: AppHandle<R>, id: String) -> bool {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    // 先标记队列中该 id 为取消 —— 如果消息还在 mpsc 里排队未注入，worker 拿到
    // 会跳过。如果已在注入中或已完成，此调用无副作用。
    ctx.injector.cancel(&id);
    let removed = ctx.history.delete(&id).is_some();
    if removed {
        let _ = app.emit("typebridge://history-update", ());
    }
    removed
}

/// 清空全部历史。返回被清除的条数，同时把所有 id 标记为取消，阻止队列里
/// 尚未注入的对应条目继续注入。用户语义："我已经不想看到这些了，也别继续往桌面上
/// 注入"。
#[tauri::command]
pub fn clear_all_history<R: Runtime>(app: AppHandle<R>) -> usize {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    let ids = ctx.history.clear_all();
    let n = ids.len();
    ctx.injector.cancel_many(&ids);
    if n > 0 {
        let _ = app.emit("typebridge://history-update", ());
    }
    n
}

/// 纯文本复制到系统剪贴板，用于消息历史卡片的"复制"按钮
#[tauri::command]
pub fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;
    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        let ns_string = NSString::from_str(&text);
        let ok = pasteboard.setString_forType(&ns_string, NSPasteboardTypeString);
        if !ok {
            return Err("剪贴板写入文本失败".into());
        }
    }
    Ok(())
}

/// 把历史记录里的图片文件写入剪贴板（PNG），供后续粘贴使用
#[tauri::command]
pub fn copy_image_to_clipboard<R: Runtime>(
    app: AppHandle<R>,
    rel_path: String,
) -> Result<(), String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypePNG};
    use objc2_foundation::NSData;
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    let abs = ctx.history.abs_image_path(&rel_path);
    let bytes = std::fs::read(&abs).map_err(|e| format!("读取图片失败: {}", e))?;
    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        let data = NSData::with_bytes(&bytes);
        let ok = pasteboard.setData_forType(Some(&data), NSPasteboardTypePNG);
        if !ok {
            return Err("剪贴板写入图片失败".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn retry_history_message<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    let msg = ctx.history.find(&id).ok_or_else(|| "消息不存在".to_string())?;

    use crate::history::MessageStatus;
    if matches!(msg.status, MessageStatus::Queued | MessageStatus::Processing) {
        return Err("当前状态不允许重发".to_string());
    }

    ctx.history.update_status(&id, MessageStatus::Queued, None);
    let _ = app.emit("typebridge://history-update", ());

    ctx.injector.enqueue(crate::queue::QueuedMessage {
        id,
        channel: msg.channel,
        source_message_id: msg.source_message_id,
        text: msg.text,
        image_path: msg.image_path.clone(),
        image_mime: msg.image_path.as_ref().map(|_| "image/png".to_string()),
        key: None,
    })?;
    Ok(())
}

// --- base64 decode (kept local, Go side emits standard base64) ---
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let table: Vec<u8> = {
        let mut t = vec![255u8; 128];
        for (i, c) in alphabet.chars().enumerate() {
            t[c as usize] = i as u8;
        }
        t
    };
    let input: Vec<u8> = s
        .bytes()
        .filter(|&b| b != b'=' && (b as usize) < 128 && table[b as usize] != 255)
        .collect();
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    for chunk in input.chunks(4) {
        let vals: Vec<u8> = chunk.iter().map(|&b| table[b as usize]).collect();
        match vals.len() {
            4 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
                out.push((vals[1] << 4) | (vals[2] >> 2));
                out.push((vals[2] << 6) | vals[3]);
            }
            3 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
                out.push((vals[1] << 4) | (vals[2] >> 2));
            }
            2 => {
                out.push((vals[0] << 2) | (vals[1] >> 4));
            }
            _ => {}
        }
    }
    Ok(out)
}
