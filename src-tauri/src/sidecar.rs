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
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SidecarEvent {
    Status { connected: bool },
    Message {
        #[serde(default)]
        message_id: Option<String>,
        sender: String,
        text: String,
        #[serde(default)]
        ts: String,
    },
    Image {
        message_id: String,
        data: String,
        mime: String,
        #[serde(default)]
        sender: String,
        #[serde(default)]
        text: String,
    },
    Error { msg: String },
}

/// 应用共享上下文 — 用 tauri::Manager::manage 注入，每个 field 自行并发控制
pub struct AppContext {
    pub confirm_before_inject: Arc<Mutex<bool>>,
    pub history: Arc<HistoryStore>,
    pub injector: Arc<Injector>,
}

impl AppContext {
    pub fn new<R: Runtime>(app: AppHandle<R>, initial_confirm: bool) -> Arc<Self> {
        let history = HistoryStore::open();
        let confirm_flag = Arc::new(Mutex::new(initial_confirm));
        let injector = Injector::spawn(app.clone(), history.clone(), confirm_flag.clone());

        Arc::new(Self {
            confirm_before_inject: confirm_flag,
            history,
            injector,
        })
    }

    pub fn set_confirm_before_inject(&self, value: bool) {
        *self.confirm_before_inject.lock().unwrap() = value;
    }
}

#[tauri::command]
pub async fn start_feishu<R: Runtime>(
    app: AppHandle<R>,
    app_id: String,
    app_secret: String,
) -> Result<(), String> {
    let shell = app.shell();
    let (mut rx, _child) = shell
        .sidecar("feishu-bridge")
        .map_err(|e| e.to_string())?
        .env("FEISHU_APP_ID", &app_id)
        .env("FEISHU_APP_SECRET", &app_secret)
        .spawn()
        .map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut retry_delay = 2u64;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    tracing::info!("[sidecar] {}", text.trim());

                    if let Ok(evt) = serde_json::from_str::<SidecarEvent>(text.trim()) {
                        dispatch_event(&app_handle, &evt, &mut retry_delay);
                    }
                }
                CommandEvent::Stderr(line) => {
                    tracing::warn!("[sidecar stderr] {}", String::from_utf8_lossy(&line).trim());
                }
                CommandEvent::Terminated(_) => {
                    tracing::warn!("[sidecar] terminated, retrying in {}s", retry_delay);
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

    ctx.history.update_status(&id, MessageStatus::Queued);
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
