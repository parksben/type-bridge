// WebChat 渠道 v2 - 本机 HTTP + Socket.IO server 宿主。
//
// 本文件在 v2 重构 P2a 阶段仅保留"最小对外契约":
//   - `WebChatPhase` / `WebChatSnapshot` 对前端的 typebridge://webchat-session-update
//     payload 结构保持兼容（字段名可以变，但保持 Option/null 语义让前端代码不崩）。
//   - `WebChatBridge` 作为 AppContext 持有的单例，现在是无实际功能的占位。
//   - 3 个 Tauri command：`start_webchat` / `stop_webchat` / `webchat_snapshot`
//     在 P2a 临时返回错误或空 snapshot，P2b 实现时会填入完整逻辑。
//
// P2b 会引入 axum + socketioxide 起本机 server，绑 LAN IP:8723 fallback，
// 生成 QR + OTP 给前端展示；手机扫码后通过 Socket.IO 握手 + 发消息。

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

// ──────────────────────────────────────────────────────────────
// Phase & Snapshot（前端契约）
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WebChatPhase {
    Idle,
    Pending,
    Bound,
    Expired,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebChatSnapshot {
    pub phase: WebChatPhase,
    pub session_id: Option<String>,
    pub otp: Option<String>,
    pub expires_at: Option<i64>,
    /// 本机 LAN IP（v2）；v1 时该字段不存在，v2 会填入
    pub lan_ip: Option<String>,
    /// server 绑定端口（v2）；v1 时为 None
    pub port: Option<u16>,
    /// 当前 WiFi SSID（v2 macOS CoreWLAN）；获取失败则 None
    pub wifi_name: Option<String>,
    /// 已绑定设备数
    pub bound_devices: usize,
    pub error: Option<String>,
    /// QR 码编码的完整 URL，前端直接画 QR
    pub qr_url: Option<String>,
}

impl WebChatSnapshot {
    fn idle() -> Self {
        Self {
            phase: WebChatPhase::Idle,
            session_id: None,
            otp: None,
            expires_at: None,
            lan_ip: None,
            port: None,
            wifi_name: None,
            bound_devices: 0,
            error: None,
            qr_url: None,
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Bridge 壳
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct InternalState {
    phase: WebChatPhase,
    error: Option<String>,
}

impl Default for InternalState {
    fn default() -> Self {
        Self {
            phase: WebChatPhase::Idle,
            error: None,
        }
    }
}

pub struct WebChatBridge {
    state: Arc<Mutex<InternalState>>,
}

impl Default for WebChatBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl WebChatBridge {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(InternalState::default())),
        }
    }

    pub fn is_connected(&self) -> bool {
        matches!(self.state.lock().unwrap().phase, WebChatPhase::Bound)
    }

    pub fn snapshot(&self) -> WebChatSnapshot {
        let s = self.state.lock().unwrap();
        let mut snap = WebChatSnapshot::idle();
        snap.phase = s.phase;
        snap.error = s.error.clone();
        snap
    }

    /// P2a 占位：直接切回 Idle，不做任何事。P2b 会启动 axum server。
    pub async fn stop(&self) {
        let mut s = self.state.lock().unwrap();
        s.phase = WebChatPhase::Idle;
        s.error = None;
    }
}

// ──────────────────────────────────────────────────────────────
// Tauri commands（stub，P2b 填入）
// ──────────────────────────────────────────────────────────────

fn emit_session_update<R: Runtime>(app: &AppHandle<R>, snap: &WebChatSnapshot) {
    let _ = app.emit("typebridge://webchat-session-update", snap);
}

#[tauri::command]
pub async fn start_webchat<R: Runtime>(
    _app: AppHandle<R>,
) -> Result<WebChatSnapshot, String> {
    // P2b: 启动本机 axum + socketioxide server。
    Err("WebChat v2 正在重构中，暂不可用（将在后续阶段上线）".to_string())
}

#[tauri::command]
pub async fn stop_webchat<R: Runtime>(app: AppHandle<R>) {
    use crate::sidecar::AppContext;
    let ctx = app.state::<Arc<AppContext>>().inner().clone();
    ctx.webchat.stop().await;
    emit_session_update(&app, &ctx.webchat.snapshot());
}

#[tauri::command]
pub fn webchat_snapshot<R: Runtime>(app: AppHandle<R>) -> WebChatSnapshot {
    use crate::sidecar::AppContext;
    let ctx = app.state::<Arc<AppContext>>().inner().clone();
    ctx.webchat.snapshot()
}
