//! WebChat 渠道 v3 - 本机 HTTP + Socket.IO server 宿主（bridge 层）。
//!
//! 本模块把 [`crate::webchat_server::WebChatServer`] 和 Tauri 应用生命周期 /
//! 前端 IPC 对接：
//!
//! - `WebChatBridge` 作为 `AppContext` 持有的单例，内部持一个 `Option<Arc<WebChatServer>>`
//! - `start_webchat`：创建 server，替换掉旧的（如有），emit 状态到前端
//! - `stop_webchat`：优雅关闭，emit Idle 状态
//! - `webchat_snapshot`：同步构造前端需要的快照
//!
//! `install_ack_listener` 在 v3 里**不存在**于这层抽象：Socket.IO 内建 ack callback，
//! 消息入队时的 ack 由 server 层处理；本文件的同名函数把 injection queue 的最终态
//! 桥接回 Socket.IO ack。
//!
//! v3 改造（v0.2.4-beta）：
//! - **sessionId 持久化**：从 store 读，跨 App 重启稳定（首次扫码后不再每次都要重扫）
//! - **`reset_webchat_binding`** 替换 `rotate_webchat_otp`：用户显式重置时清 store + restart server
//! - **snapshot 字段**：删 `otp` / `expires_at`，加 `bound_client`（v3 单设备模式）
//! - **WebChatPhase 删 `Expired`**：v3 没有"OTP 过期"概念，新增 `Bound` 时携 client 元数据

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, EventTarget, Listener, Manager, Runtime};

use crate::webchat_server::{BoundClient, WebChatServer};

// ──────────────────────────────────────────────────────────────
// Phase & Snapshot（前端契约）
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WebChatPhase {
    /// server 未启动
    Idle,
    /// server 起来了，等手机扫码绑定
    Pending,
    /// 已有手机完成 hello 握手并占座
    Bound,
    /// server 启动失败 / 运行时出错
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebChatSnapshot {
    pub phase: WebChatPhase,
    pub session_id: Option<String>,
    pub lan_ip: Option<String>,
    pub port: Option<u16>,
    pub wifi_name: Option<String>,
    /// 当前实时连着的 Socket.IO bindings 数（每次 disconnect 同步衰减）
    pub bound_devices: usize,
    /// v3：已成功握手的客户端元数据（None 表示未绑定）。
    /// 与 bound_devices 区别：bound_client 是"占座"哨兵（设备身份），
    /// bound_devices 是当前 socket 计数（短暂断网时会归零，但 bound_client 仍保留）。
    pub bound_client: Option<BoundClient>,
    pub error: Option<String>,
    pub qr_url: Option<String>,
}

impl WebChatSnapshot {
    fn idle() -> Self {
        Self {
            phase: WebChatPhase::Idle,
            session_id: None,
            lan_ip: None,
            port: None,
            wifi_name: None,
            bound_devices: 0,
            bound_client: None,
            error: None,
            qr_url: None,
        }
    }

    fn from_server(server: &WebChatServer, lang: Option<&str>) -> Self {
        let count = server.bound_devices_count();
        let bound = server.bound_client();
        // v3 phase 判定：有 bound_client → Bound；否则 Pending（server 在跑等扫码）
        let phase = if bound.is_some() {
            WebChatPhase::Bound
        } else {
            WebChatPhase::Pending
        };
        Self {
            phase,
            session_id: Some(server.session_id.clone()),
            lan_ip: Some(server.lan_ip.to_string()),
            port: Some(server.port),
            wifi_name: server.wifi_name.clone(),
            bound_devices: count,
            bound_client: bound,
            error: None,
            qr_url: Some(server.qr_url(lang)),
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

    pub fn snapshot(&self, lang: Option<&str>) -> WebChatSnapshot {
        let g = self.server.lock().unwrap();
        match g.as_ref() {
            Some(server) => WebChatSnapshot::from_server(server, lang),
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
    ///
    /// v3：sessionId 从 store 读，None → 生成新 id 并写回，保证跨重启稳定。
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

        // v3：从 store 读 sessionId；首次启动 / 用户刚显式重置过 → 生成新 id 并写回。
        let session_id = read_or_init_session_id(app)?;

        // 解析 SPA 资源路径：
        // - 生产模式：Tauri bundler 会把 webchat-local/dist 放到 .app 的 Resources 里
        // - dev 模式：直接指向 <project-root>/webchat-local/dist，开发者需事先构建一次
        let spa_dir = resolve_spa_dir(app);

        // 绑定变更回调：当手机端 disconnect / 新设备 hello 时通知桌面前端刷新状态快照
        let app_handle = app.clone();
        let ctx_for_cb = ctx.clone();
        let on_bind_change: Arc<dyn Fn() + Send + Sync + 'static> = Arc::new(move || {
            let lang = current_lang(&app_handle);
            let snap = ctx_for_cb.webchat.snapshot(lang.as_deref());
            let _ = app_handle.emit("typebridge://webchat-session-update", &snap);
        });

        // /help 文本生成回调：读当前 lang + quick_input 配置实时生成（保证列出最新快捷输入）
        let app_for_help = app.clone();
        let ctx_for_help = ctx.clone();
        let help_text_provider: Arc<dyn Fn() -> String + Send + Sync + 'static> =
            Arc::new(move || {
                let lang = current_lang(&app_for_help).unwrap_or_default();
                let cfg = ctx_for_help.quick_input.lock().unwrap();
                crate::help::build_help_text(&lang, &cfg)
            });

        // 启新的
        match WebChatServer::start(ctx, session_id, spa_dir, on_bind_change, help_text_provider)
            .await
        {
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

// ──────────────────────────────────────────────────────────────
// SessionId 持久化（webchat.rs 内联，避免给 store.rs 加泛型 helper）
// ──────────────────────────────────────────────────────────────

const WEBCHAT_SESSION_ID_KEY: &str = "webchat_session_id";
const STORE_PATH: &str = "config.json";

/// 从 store 读 sessionId；不存在 / 为空 → 生成新 id 并写回。
/// 跟 store.rs 的 `get/set/reset_webchat_session_id` 写入同一 key，
/// 但保持泛型 `<R: Runtime>` 不绑 `Wry`（store.rs helper 是 `<Wry>`，不便复用）。
fn read_or_init_session_id<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    if let Some(v) = store.get(WEBCHAT_SESSION_ID_KEY) {
        if let Some(s) = v.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    // 生成新 id（复用 webchat_server::generate_session_id，保持算法一致）
    let new_id = crate::webchat_server::generate_session_id();
    store.set(WEBCHAT_SESSION_ID_KEY, new_id.clone());
    store.save().map_err(|e| e.to_string())?;
    Ok(new_id)
}

/// 显式重置：清掉 store 里的 sessionId，下次 server 启动时会生成新的。
fn clear_persisted_session_id<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.delete(WEBCHAT_SESSION_ID_KEY);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// 解析 webchat-local/dist 的绝对路径。
/// Tauri 2 的 resolve 在 production bundle 里会命中 Resources/，dev 模式
/// 下如果 resources 还没 bundle（只是 `cargo run`），会 fallback 到源码目录。
fn resolve_spa_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    // 优先尝试 Resource 路径（生产 build）
    if let Ok(p) = app
        .path()
        .resolve("webchat-local/dist", BaseDirectory::Resource)
    {
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

/// 从持久化 Settings 读 UI 语言（`""`/`"zh"`/`"en"`）。`""` 视为未选择，
/// QR URL 不附加 `&lang=`，让移动端 SPA 自己检测。
pub fn current_lang(app: &AppHandle<impl Runtime>) -> Option<String> {
    let _ = app;
    // get_settings 当前签名是 fn(AppHandle<Wry>)，跨 Runtime 不通用，
    // 这里直接读 store 文件以保持泛型；store 路径与 store.rs 保持一致。
    use tauri_plugin_store::StoreExt;
    let store = app.store("config.json").ok()?;
    let v = store.get("language")?;
    let s = v.as_str()?.to_string();
    if s == "zh" || s == "en" {
        Some(s)
    } else {
        None
    }
}

#[tauri::command]
pub async fn start_webchat<R: Runtime>(app: AppHandle<R>) -> Result<WebChatSnapshot, String> {
    let ctx = app
        .state::<Arc<crate::sidecar::AppContext>>()
        .inner()
        .clone();
    ctx.webchat.start(ctx.clone(), &app).await?;
    let lang = current_lang(&app);
    let snap = ctx.webchat.snapshot(lang.as_deref());
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
    let lang = current_lang(&app);
    emit_session_update(&app, &ctx.webchat.snapshot(lang.as_deref()));
}

/// **v3 显式重置 WebChat 绑定**：清掉持久化 sessionId + restart server，
/// 强制让所有手机端 sessionId 失效（下次 hello 会被拒 SESSION_NOT_FOUND），
/// 用户重新扫码新二维码即可完成新绑定。
///
/// 取代 v2 的 `rotate_webchat_otp`：v3 不再有 OTP 概念，"重置"语义就是
/// "我要把当前已绑定的手机踢掉，重新放新设备进来"。
///
/// 若当前没 server 在跑（idle 状态），仅清 store；下次用户点 start 会
/// 直接走 fresh 流程。
#[tauri::command]
pub async fn reset_webchat_binding<R: Runtime>(
    app: AppHandle<R>,
) -> Result<WebChatSnapshot, String> {
    let ctx = app
        .state::<Arc<crate::sidecar::AppContext>>()
        .inner()
        .clone();

    // 1. 清持久化 sessionId（无论 server 是否在跑都先清，保证语义干净）
    clear_persisted_session_id(&app)?;

    // 2. 若 server 在跑 → restart（stop + start 会读到刚清掉的 store，自动生成新 id）
    let was_running = ctx.webchat.current_server().is_some();
    if was_running {
        ctx.webchat.start(ctx.clone(), &app).await?;
    } else {
        tracing::info!("[webchat] reset_webchat_binding called while idle; only cleared store");
    }

    let lang = current_lang(&app);
    let snap = ctx.webchat.snapshot(lang.as_deref());
    emit_session_update(&app, &snap);
    Ok(snap)
}

#[tauri::command]
pub fn webchat_snapshot<R: Runtime>(app: AppHandle<R>) -> WebChatSnapshot {
    let ctx = app
        .state::<Arc<crate::sidecar::AppContext>>()
        .inner()
        .clone();
    let lang = current_lang(&app);
    ctx.webchat.snapshot(lang.as_deref())
}
