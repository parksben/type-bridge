//! WebChat 渠道 v2 - 本机 HTTP + Socket.IO server 宿主（bridge 层）。
//!
//! 本模块把 [`crate::webchat_server::WebChatServer`] 和 Tauri 应用生命周期 /
//! 前端 IPC 对接：
//!
//! - `WebChatBridge` 作为 `AppContext` 持有的单例，内部持一个 `Option<Arc<WebChatServer>>`
//! - `start_webchat`：创建 server，替换掉旧的（如有），emit 状态到前端
//! - `stop_webchat`：优雅关闭，emit Idle 状态
//! - `webchat_snapshot`：同步构造前端需要的快照
//!
//! `install_ack_listener` 在 v2 里**不存在**：Socket.IO 内建 ack callback，
//! 消息入队时的 ack 由 server 层处理（当前先立即 ack success，待 P2b-2
//! 阶段补完注入结果回流）。

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, EventTarget, Listener, Manager, Runtime};

use crate::webchat_server::WebChatServer;

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
    pub lan_ip: Option<String>,
    pub port: Option<u16>,
    pub wifi_name: Option<String>,
    pub bound_devices: usize,
    pub error: Option<String>,
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

    fn from_server(server: &WebChatServer) -> Self {
        let count = server.bound_devices_count();
        let phase = if server.is_locked() {
            WebChatPhase::Expired
        } else if count > 0 {
            WebChatPhase::Bound
        } else {
            WebChatPhase::Pending
        };
        Self {
            phase,
            session_id: Some(server.session_id.clone()),
            otp: Some(server.otp_plain.clone()),
            expires_at: Some(server.expires_at_unix_ms),
            lan_ip: Some(server.lan_ip.to_string()),
            port: Some(server.port),
            wifi_name: server.wifi_name.clone(),
            bound_devices: count,
            error: None,
            qr_url: Some(server.qr_url()),
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Bridge
// ──────────────────────────────────────────────────────────────

pub struct WebChatBridge {
    server: Mutex<Option<Arc<WebChatServer>>>,
    last_error: Mutex<Option<String>>,
}

/// queue worker emit 的 typebridge://message-status event payload（与 queue.rs 对齐）。
#[derive(Debug, Deserialize)]
struct MessageStatusEvent {
    id: String,
    status: String,
    #[serde(default)]
    reason: Option<String>,
}

impl Default for WebChatBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl WebChatBridge {
    pub fn new() -> Self {
        Self {
            server: Mutex::new(None),
            last_error: Mutex::new(None),
        }
    }

    pub fn is_connected(&self) -> bool {
        let g = self.server.lock().unwrap();
        g.as_ref()
            .map(|s| s.bound_devices_count() > 0)
            .unwrap_or(false)
    }

    pub fn snapshot(&self) -> WebChatSnapshot {
        let g = self.server.lock().unwrap();
        match g.as_ref() {
            Some(server) => WebChatSnapshot::from_server(server),
            None => {
                let mut s = WebChatSnapshot::idle();
                s.error = self.last_error.lock().unwrap().clone();
                if s.error.is_some() {
                    s.phase = WebChatPhase::Error;
                }
                s
            }
        }
    }

    /// 启动一个新 server。若已有 server 在跑，先关掉。
    pub async fn start<R: Runtime>(
        &self,
        ctx: Arc<crate::sidecar::AppContext>,
        app: &AppHandle<R>,
    ) -> Result<(), String> {
        // 停掉旧的
        let old = {
            let mut g = self.server.lock().unwrap();
            g.take()
        };
        if let Some(old_server) = old {
            old_server.stop().await;
        }
        *self.last_error.lock().unwrap() = None;

        // 解析 SPA 资源路径：
        // - 生产模式：Tauri bundler 会把 webchat-local/dist 放到 .app 的 Resources 里
        // - dev 模式：直接指向 <project-root>/webchat-local/dist，开发者需事先构建一次
        let spa_dir = resolve_spa_dir(app);

        // 启新的
        match WebChatServer::start(ctx, spa_dir).await {
            Ok(server) => {
                *self.server.lock().unwrap() = Some(Arc::new(server));
                Ok(())
            }
            Err(e) => {
                *self.last_error.lock().unwrap() = Some(e.clone());
                Err(e)
            }
        }
    }

    /// 停止 server（如果在跑）。
    pub async fn stop(&self) {
        let s = {
            let mut g = self.server.lock().unwrap();
            g.take()
        };
        if let Some(server) = s {
            server.stop().await;
        }
        *self.last_error.lock().unwrap() = None;
    }

    /// 当前持有的 server（供全局 ack listener 查询）。
    fn current_server(&self) -> Option<Arc<WebChatServer>> {
        self.server.lock().ok().and_then(|g| g.clone())
    }
}

/// 注册一次全局 listener，把 injection queue 的 typebridge://message-status 事件
/// 桥接到当前 WebChat server 的 Socket.IO ack 回调（deliver_ack）。
/// 在 lib.rs setup 里调一次即可，listener 随 AppHandle 生命周期持久。
pub fn install_ack_listener<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    app.listen_any("typebridge://message-status", move |event| {
        let payload_raw = event.payload();
        let payload: MessageStatusEvent = match serde_json::from_str(payload_raw) {
            Ok(p) => p,
            Err(_) => return,
        };
        // 只关心最终态（注入成功 / 失败 / 被取消），不处理 "processing"
        match payload.status.as_str() {
            "sent" | "failed" | "cancelled" => {}
            _ => return,
        };

        // 非 webchat 渠道的消息也会走这里，但 deliver_ack 内部按 id 查 pending_acks
        // 找不到就 no-op，不影响其他渠道。
        let ctx = match handle.try_state::<Arc<crate::sidecar::AppContext>>() {
            Some(s) => s.inner().clone(),
            None => return,
        };
        if let Some(server) = ctx.webchat.current_server() {
            let success = payload.status == "sent";
            server.deliver_ack(&payload.id, success, payload.reason);
        }
    });
    // 让 rustc 知道 EventTarget 不是 dead import；保留给未来有需要定向 listener 时用
    let _ = std::any::TypeId::of::<EventTarget>();
}

/// 解析 webchat-local/dist 的绝对路径。
/// Tauri 2 的 resolve 在 production bundle 里会命中 Resources/，dev 模式
/// 下如果 resources 还没 bundle（只是 `cargo run`），会 fallback 到源码目录。
fn resolve_spa_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    // 优先尝试 Resource 路径（生产 build）
    if let Ok(p) = app.path().resolve("webchat-local/dist", BaseDirectory::Resource) {
        if p.exists() {
            return p;
        }
    }
    // dev fallback：项目根下的 webchat-local/dist（`cargo run` 从 src-tauri/ 执行）
    // CARGO_MANIFEST_DIR 指向 src-tauri/，其 parent 是项目根
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    PathBuf::from(manifest_dir)
        .parent()
        .map(|p| p.join("webchat-local").join("dist"))
        .unwrap_or_else(|| PathBuf::from("webchat-local/dist"))
}

// ──────────────────────────────────────────────────────────────
// Tauri commands
// ──────────────────────────────────────────────────────────────

fn emit_session_update<R: Runtime>(app: &AppHandle<R>, snap: &WebChatSnapshot) {
    let _ = app.emit("typebridge://webchat-session-update", snap);
}

#[tauri::command]
pub async fn start_webchat<R: Runtime>(
    app: AppHandle<R>,
) -> Result<WebChatSnapshot, String> {
    let ctx = app
        .state::<Arc<crate::sidecar::AppContext>>()
        .inner()
        .clone();
    ctx.webchat.start(ctx.clone(), &app).await?;
    let snap = ctx.webchat.snapshot();
    emit_session_update(&app, &snap);
    Ok(snap)
}

#[tauri::command]
pub async fn stop_webchat<R: Runtime>(app: AppHandle<R>) {
    let ctx = app
        .state::<Arc<crate::sidecar::AppContext>>()
        .inner()
        .clone();
    ctx.webchat.stop().await;
    emit_session_update(&app, &ctx.webchat.snapshot());
}

#[tauri::command]
pub fn webchat_snapshot<R: Runtime>(app: AppHandle<R>) -> WebChatSnapshot {
    let ctx = app
        .state::<Arc<crate::sidecar::AppContext>>()
        .inner()
        .clone();
    ctx.webchat.snapshot()
}
