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
    Message { sender: String, text: String, ts: String },
    Image { message_id: String, data: String, mime: String, text: String },
    Error { msg: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingMessage {
    pub text: Option<String>,
    pub image_data: Option<String>,
    pub image_mime: Option<String>,
}

#[derive(Default)]
pub struct AppState {
    pub confirm_before_inject: bool,
    pub pending: Option<PendingMessage>,
}

#[tauri::command]
pub async fn start_feishu<R: Runtime>(
    app: AppHandle<R>,
    app_id: String,
    app_secret: String,
) -> Result<(), String> {
    let state: Arc<Mutex<AppState>> = app.state::<Arc<Mutex<AppState>>>().inner().clone();

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
                        match &evt {
                            SidecarEvent::Status { connected } => {
                                if *connected { retry_delay = 2; }
                                let _ = app_handle.emit("feishu://status", &evt);
                            }
                            SidecarEvent::Message { text: msg_text, .. } => {
                                let confirm = {
                                    let s = state.lock().unwrap();
                                    s.confirm_before_inject
                                };

                                if confirm {
                                    let _ = app_handle.emit("feishu://confirm-request", &evt);
                                } else {
                                    handle_text_inject(&app_handle, msg_text);
                                }

                                let _ = app_handle.emit("feishu://message", &evt);
                            }
                            SidecarEvent::Image { data, mime, text: img_text, .. } => {
                                if !img_text.is_empty() {
                                    handle_text_inject(&app_handle, img_text);
                                }
                                handle_image_inject(&app_handle, data, mime, &state);
                                let _ = app_handle.emit("feishu://image", &evt);
                            }
                            SidecarEvent::Error { msg } => {
                                tracing::error!("[feishu] {}", msg);
                                let _ = app_handle.emit("feishu://status", SidecarEvent::Status { connected: false });
                            }
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    tracing::warn!("[sidecar stderr] {}", String::from_utf8_lossy(&line).trim());
                }
                CommandEvent::Terminated(_) => {
                    tracing::warn!("[sidecar] terminated, retrying in {}s", retry_delay);
                    let _ = app_handle.emit("feishu://status", SidecarEvent::Status { connected: false });
                    tokio::time::sleep(Duration::from_secs(retry_delay)).await;
                    retry_delay = (retry_delay * 2).min(60);
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_feishu<R: Runtime>(app: AppHandle<R>) {
    let _ = app.emit("feishu://status", SidecarEvent::Status { connected: false });
}

#[tauri::command]
pub fn inject_pending<R: Runtime>(app: AppHandle<R>) {
    let state: Arc<Mutex<AppState>> = app.state::<Arc<Mutex<AppState>>>().inner().clone();
    let pending = {
        let mut s = state.lock().unwrap();
        s.pending.take()
    };
    if let Some(msg) = pending {
        if let Some(text) = &msg.text {
            handle_text_inject(&app, text);
        }
        if let (Some(data), Some(mime)) = (&msg.image_data, &msg.image_mime) {
            handle_image_inject(&app, data, mime, &state);
        }
    }
}

fn handle_text_inject<R: Runtime>(app: &AppHandle<R>, text: &str) {
    use crate::injector;
    use crate::notification;

    match injector::get_focused_element() {
        Some(_) => {
            if let Err(e) = injector::inject_text(text) {
                tracing::error!("[inject] text failed: {}", e);
                let _ = app.emit("feishu://inject-result", serde_json::json!({"success": false, "reason": e}));
            } else {
                tracing::info!("[inject] text ok ({} chars)", text.chars().count());
                let _ = app.emit("feishu://inject-result", serde_json::json!({"success": true}));
            }
        }
        None => {
            tracing::warn!("[inject] no focused element, storing pending message");
            notification::notify_no_focus(app);
            let state: Arc<Mutex<AppState>> = app.state::<Arc<Mutex<AppState>>>().inner().clone();
            let mut s = state.lock().unwrap();
            s.pending = Some(PendingMessage {
                text: Some(text.to_string()),
                image_data: None,
                image_mime: None,
            });
        }
    }
}

fn handle_image_inject<R: Runtime>(
    app: &AppHandle<R>,
    data: &str,
    mime: &str,
    state: &Arc<Mutex<AppState>>,
) {
    use crate::injector;
    use crate::notification;

    let bytes = match base64_decode(data) {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("[inject] base64 decode failed: {}", e);
            return;
        }
    };

    match injector::get_focused_element() {
        Some(_) => {
            if let Err(e) = injector::inject_image(&bytes, mime) {
                tracing::warn!("[inject] image paste failed: {}", e);
                let _ = app.emit("feishu://inject-result", serde_json::json!({"success": false, "reason": e}));
            } else {
                tracing::info!("[inject] image ok");
            }
        }
        None => {
            notification::notify_no_focus(app);
            let mut s = state.lock().unwrap();
            s.pending = Some(PendingMessage {
                text: None,
                image_data: Some(data.to_string()),
                image_mime: Some(mime.to_string()),
            });
        }
    }
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    // simple base64 decode using std
    // we rely on the Go side to emit valid standard base64
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let table: Vec<u8> = {
        let mut t = vec![255u8; 128];
        for (i, c) in alphabet.chars().enumerate() {
            t[c as usize] = i as u8;
        }
        t
    };
    let input: Vec<u8> = s.bytes().filter(|&b| b != b'=' && (b as usize) < 128 && table[b as usize] != 255).collect();
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
