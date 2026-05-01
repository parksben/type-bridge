// Sidecar 进程管理 + Go stdout 事件分发。
//
// 本模块职责：启动 Go sidecar、读取其 stdout 的 JSON Lines、转交给
// history + queue 进行入队处理；不再直接执行注入（那是 queue.rs 的事）。

use crate::history::HistoryStore;
use crate::queue::{ingest_message, Injector};
use serde::{Deserialize, Serialize};
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
    Reaction { message_id: String, emoji_type: String },
    Reply { message_id: String, text: String },
    Selftest,
}

/// selftest 执行结果（Go 返回，Rust 传给前端 invoke 调用者）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelftestResult {
    pub ok: bool,
    #[serde(default)]
    pub reason: String,
}

/// 包装 Go sidecar 子进程，允许随时写入命令（stdin）
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
        ok: bool,
        #[serde(default)]
        reason: String,
    },
}

/// 应用共享上下文 — 用 tauri::Manager::manage 注入，每个 field 自行并发控制
pub struct AppContext {
    pub confirm_before_inject: Arc<Mutex<bool>>,
    pub submit_config: Arc<Mutex<SubmitConfig>>,
    pub history: Arc<HistoryStore>,
    pub injector: Arc<Injector>,
    pub bridge: Arc<SidecarBridge>,
    /// 等待中的 selftest 回执 sender。selftest 每次最多一个在途。
    pub pending_selftest: Arc<TokioMutex<Option<oneshot::Sender<SelftestResult>>>>,
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
        initial_confirm: bool,
        initial_submit: SubmitConfig,
    ) -> Arc<Self> {
        let history = HistoryStore::open();
        let confirm_flag = Arc::new(Mutex::new(initial_confirm));
        let submit_config = Arc::new(Mutex::new(initial_submit));
        let bridge: Arc<SidecarBridge> = Arc::new(SidecarBridge::default());
        let injector = Injector::spawn(
            app.clone(),
            history.clone(),
            confirm_flag.clone(),
            submit_config.clone(),
            bridge.clone(),
        );

        Arc::new(Self {
            confirm_before_inject: confirm_flag,
            submit_config,
            history,
            injector,
            bridge,
            pending_selftest: Arc::new(TokioMutex::new(None)),
        })
    }

    pub fn set_confirm_before_inject(&self, value: bool) {
        *self.confirm_before_inject.lock().unwrap() = value;
    }

    pub fn set_submit_config(&self, auto_submit: bool, submit_key: crate::store::SubmitKey) {
        let mut g = self.submit_config.lock().unwrap();
        g.auto_submit = auto_submit;
        g.submit_key = submit_key;
    }
}

#[tauri::command]
pub async fn start_feishu<R: Runtime>(
    app: AppHandle<R>,
    app_id: String,
    app_secret: String,
) -> Result<(), String> {
    let shell = app.shell();
    let (mut rx, child) = shell
        .sidecar("feishu-bridge")
        .map_err(|e| e.to_string())?
        .env("FEISHU_APP_ID", &app_id)
        .env("FEISHU_APP_SECRET", &app_secret)
        .spawn()
        .map_err(|e| e.to_string())?;

    // 把 child 存进 bridge，供 queue worker 向 stdin 写 reaction/reply 命令
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.bridge.set(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut retry_delay = 2u64;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    tracing::info!("[sidecar] {}", text.trim());

                    match serde_json::from_str::<SidecarEvent>(text.trim()) {
                        Ok(evt) => dispatch_event(&app_handle, &evt, &mut retry_delay),
                        Err(e) => {
                            tracing::warn!(
                                "[sidecar] failed to parse event: {} | raw: {}",
                                e,
                                text.trim()
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    tracing::warn!("[sidecar stderr] {}", String::from_utf8_lossy(&line).trim());
                }
                CommandEvent::Terminated(_) => {
                    tracing::warn!("[sidecar] terminated, retrying in {}s", retry_delay);
                    // 子进程终止，清理 bridge 里的旧 child（防止向死 stdin 写）
                    let ctx: Arc<AppContext> =
                        app_handle.state::<Arc<AppContext>>().inner().clone();
                    ctx.bridge.clear();

                    let _ = app_handle.emit(
                        "feishu://status",
                        SidecarEvent::Status { connected: false },
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
    evt: &SidecarEvent,
    retry_delay: &mut u64,
) {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();

    match evt {
        SidecarEvent::Status { connected } => {
            if *connected {
                *retry_delay = 2;
            }
            let _ = app.emit("feishu://status", evt);
        }
        SidecarEvent::Message { message_id, sender, text, .. } => {
            let id = message_id
                .clone()
                .unwrap_or_else(|| format!("local-{}", uuid::Uuid::new_v4()));
            let _ = app.emit("feishu://message", evt);
            ingest_message(
                app,
                &ctx.history,
                &ctx.injector,
                &ctx.bridge,
                id,
                sender.clone(),
                text.clone(),
                None,
                None,
            );
        }
        SidecarEvent::Image { message_id, data, mime, sender, text } => {
            let _ = app.emit("feishu://image", evt);

            // base64 → 保存到 images dir → 入队
            let bytes = match base64_decode(data) {
                Ok(b) => b,
                Err(e) => {
                    tracing::error!("[sidecar] base64 decode failed: {}", e);
                    return;
                }
            };
            let rel = match ctx.history.save_image(message_id, mime, &bytes) {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!("[sidecar] save image failed: {}", e);
                    return;
                }
            };
            ingest_message(
                app,
                &ctx.history,
                &ctx.injector,
                &ctx.bridge,
                message_id.clone(),
                sender.clone(),
                text.clone(),
                Some(rel),
                Some(mime.clone()),
            );
        }
        SidecarEvent::Error { msg } => {
            tracing::error!("[feishu] {}", msg);
            let _ = app.emit(
                "feishu://status",
                SidecarEvent::Status { connected: false },
            );
        }
        SidecarEvent::SelftestResult { ok, reason } => {
            // 唤醒正在等待的 run_selftest command
            let result = SelftestResult {
                ok: *ok,
                reason: reason.clone(),
            };
            let pending = ctx.pending_selftest.clone();
            tauri::async_runtime::spawn(async move {
                let mut guard = pending.lock().await;
                if let Some(sender) = guard.take() {
                    let _ = sender.send(result);
                }
            });
        }
    }
}

#[tauri::command]
pub fn stop_feishu<R: Runtime>(app: AppHandle<R>) {
    let _ = app.emit(
        "feishu://status",
        SidecarEvent::Status { connected: false },
    );
}

// --- Commands for history/queue ---

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
    let removed = ctx.history.delete(&id).is_some();
    if removed {
        let _ = app.emit("feishu://history-update", ());
    }
    removed
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
    let _ = app.emit("feishu://history-update", ());

    ctx.injector.enqueue(crate::queue::QueuedMessage {
        id,
        text: msg.text,
        image_path: msg.image_path.clone(),
        image_mime: msg.image_path.as_ref().map(|_| "image/png".to_string()),
    })?;
    Ok(())
}

#[tauri::command]
pub async fn confirm_pending_message<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    accept: bool,
) -> Result<(), String> {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.injector.resolve_pending_confirm(&id, accept).await
}

/// 手动触发一次自检：Rust → Go stdin 发 selftest 命令，等 Go 用 Im.Chat.List
/// ping 飞书 API 后 stdout 回执 selftest_result 事件。10s 超时。
#[tauri::command]
pub async fn run_selftest<R: Runtime>(app: AppHandle<R>) -> Result<SelftestResult, String> {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();

    // 若 sidecar 未启动，直接返回明确错误
    if !ctx.bridge.is_connected() {
        return Err("长连接尚未建立，请先点击「启动长连接」".into());
    }

    let (tx, rx) = oneshot::channel::<SelftestResult>();
    {
        let mut slot = ctx.pending_selftest.lock().await;
        // 如有遗留的旧 sender，直接丢弃（前一次请求已超时或结果丢失）
        *slot = Some(tx);
    }

    ctx.bridge.send(&SidecarCommand::Selftest);

    match tokio::time::timeout(Duration::from_secs(10), rx).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err("selftest 通道被释放".into()),
        Err(_) => {
            // 超时：把 pending 清掉，避免后续结果灌进来被错配给下一次请求
            let mut slot = ctx.pending_selftest.lock().await;
            *slot = None;
            Err("selftest 超时（10s），请检查网络或 sidecar 进程状态".into())
        }
    }
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
