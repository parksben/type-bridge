//! WebChat 本地 HTTP + Socket.IO server。
//!
//! # 架构
//!
//! - axum 作为 HTTP 框架，挂 socketioxide 的 layer，同时对外 serve SPA 静态资源
//! - socketioxide 处理 Socket.IO 协议（握手 / 事件 / ack / 重连 / 心跳）
//! - 一个 `WebChatServer` 实例对应**一次会话**：启动时生成 sessionId/OTP，
//!   绑端口 8723 起，停止时 graceful shutdown
//! - 多台手机都用同一个 OTP 握手，各自签发 userToken，进同一 FIFO 队列
//!
//! # P2b 范围（最小可跑）
//!
//! - ✅ server 启动/停止、端口递增 fallback
//! - ✅ 静态资源（P3 之前占位 HTML 说明）+ socket.io 路由
//! - ✅ `hello` 事件：OTP 校验 + 签发 userToken + 记录 binding
//! - ✅ `text` / `image` 事件：入 injector FIFO 队列
//! - ⏳ ack 真·注入结果回流：P2b-2 阶段做（监听 message-status 事件 + 匹配
//!   clientMessageId 把 AckSender 回调）。当前先立即 ack success，让链路通
//!
//! # 安全
//!
//! - OTP 只存 sha256，明文只在 `WebChatServer` 内存里供 UI 展示
//! - userToken 随机 32 字节 base64url，只通过 hello ack 发给对应设备
//! - 后续所有事件（text/image）必须带 userToken，server 查哈希匹配

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex as SyncMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Redirect};
use axum::routing::get;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use socketioxide::extract::{AckSender, Data, SocketRef, State};
use socketioxide::SocketIo;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tower_http::services::{ServeDir, ServeFile};

use crate::channel::ChannelId;
use crate::history::{HistoryMessage, MessageStatus};
use crate::queue::QueuedMessage;
use crate::sidecar::AppContext;

// ──────────────────────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────────────────────

const PORT_START: u16 = 8723;
const PORT_RANGE: u16 = 10; // 8723..=8732 试十个
const SESSION_TTL_SECS: u64 = 60; // 每个 OTP 活 60 秒，归零时桌面自动轮换（不重启 server）
const MAX_OTP_ATTEMPTS: u8 = 5;
/// binding 超过 150s（即 2.5 分钟）无任何消息就自动释放；手机端再发消息会收到未认证错误，提示用户重新扫码。
const IDLE_TIMEOUT_MS: i64 = 150_000;
/// idle 清理 task 扫描间隔
const IDLE_CHECK_INTERVAL_SECS: u64 = 30;

// ──────────────────────────────────────────────────────────────
// 公开类型
// ──────────────────────────────────────────────────────────────

/// 运行中的 server handle。调用 stop() 触发 cancellation token，后台优雅关闭。
pub struct WebChatServer {
    /// 启动参数 + 内部状态共享
    state: Arc<ServerState>,
    /// 用于 graceful shutdown
    cancel: CancellationToken,
    /// server 主 task（stop 时 take 出来 await）
    handle: SyncMutex<Option<JoinHandle<()>>>,
    /// 启动后对外可见的元数据
    pub port: u16,
    pub lan_ip: IpAddr,
    pub wifi_name: Option<String>,
    pub session_id: String,
}

impl WebChatServer {
    /// 启动一个新 server。
    /// `notify_bind_change`：binding 数量变化（新设备接入 / 断开）时同步回调，
    /// 上层 bridge 在此回调里 emit typebridge://webchat-session-update 事件。
    /// `spa_dir` 指向 webchat-local 的构建产物目录（含 index.html），由外部 resolve
    /// tauri resource 后传进来。若目录不存在，server 也能起来，但静态资源路由会 404。
    pub async fn start(
        ctx: Arc<AppContext>,
        spa_dir: PathBuf,
        notify_bind_change: Arc<dyn Fn() + Send + Sync + 'static>,
    ) -> Result<Self, String> {
        let lan_ip = crate::webchat_net::primary_lan_ip()
            .ok_or_else(|| "未检测到可用的局域网 IP（请先连接 WiFi 或以太网）".to_string())?;
        let wifi_name = crate::webchat_net::current_wifi_ssid();

        // 本地生成 sessionId / OTP / OTP hash
        let session_id = generate_session_id();
        let initial_otp = make_otp_state();

        let (otp_refresh_tx, _) = broadcast::channel(8);

        let state = Arc::new(ServerState {
            session_id: session_id.clone(),
            otp: SyncMutex::new(initial_otp),
            bindings: SyncMutex::new(Vec::new()),
            injector: ctx.injector.clone(),
            history: ctx.history.clone(),
            pending_acks: SyncMutex::new(HashMap::new()),
            notify_bind_change,
            otp_refresh: otp_refresh_tx,
        });

        // 构建 Socket.IO layer
        let (io_layer, io) = SocketIo::builder()
            .with_state(state.clone())
            .build_layer();
        io.ns("/", on_connect);

        // 端口递增 fallback —— 提到 router 构建之前，让 dev redirect handler 能拿到 port
        let (listener, port) = bind_with_fallback(lan_ip).await?;

        // 静态资源 / dev redirect 二选一：
        // - debug build：fallback 改成 302 → http://<lan>:5173<path>?<query>&apiPort=<port>
        //   手机端从 Vite dev server 加载页面，HMR 原生工作；Socket.IO 仍走 :port
        //   (CORS already permissive)。这要求 webchat-local 的 Vite 在 :5173 运行
        //   (由根 package.json 的 dev 脚本通过 concurrently 拉起)
        // - release build：fallback 走 ServeDir，serve `webchat-local/dist/`
        //
        // ⚠️ axum 0.7 的 `.layer()` 只作用于**调用它之前**已注册的 routes/fallback。
        // 必须先 `.fallback*(...)` 再 `.layer(io_layer)`，否则 `/socket.io/*`
        // 请求会落到 fallback 被吃掉，socketioxide 永远收不到手机端握手。
        // 详见 TECH_DESIGN §35.9.1
        let mut router = axum::Router::new()
            .route("/healthz", get(healthz))
            .route("/__placeholder", get(serve_placeholder));

        if cfg!(debug_assertions) {
            let lan_ip_for_handler = lan_ip;
            let port_for_handler = port;
            router = router.fallback(move |uri: axum::http::Uri| async move {
                redirect_to_vite_dev(uri, lan_ip_for_handler, port_for_handler)
            });
            tracing::info!(
                "[webchat] dev mode: fallback → http://{}:5173 (HMR via Vite); Socket.IO at :{}",
                lan_ip,
                port
            );
        } else {
            let index_path = spa_dir.join("index.html");
            let serve_dir = ServeDir::new(&spa_dir)
                .append_index_html_on_directories(true)
                .fallback(ServeFile::new(&index_path));
            router = router.fallback_service(serve_dir);
        }

        let router = router
            .layer(io_layer)
            .layer(tower_http::cors::CorsLayer::very_permissive());

        tracing::info!(
            "[webchat] Server started at http://{}:{} (sessionId={})",
            lan_ip,
            port,
            session_id
        );

        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();
        let handle = tokio::spawn(async move {
            let serve = axum::serve(listener, router.into_make_service())
                .with_graceful_shutdown(async move { cancel_clone.cancelled().await });
            if let Err(e) = serve.await {
                tracing::error!("[webchat] axum serve error: {}", e);
            }
            tracing::info!("[webchat] server task exited");
        });

        // 启动 idle binding 清理 task：每 IDLE_CHECK_INTERVAL_SECS 秒扫描一次，
        // 超过 IDLE_TIMEOUT_MS 无消息的 binding 自动释放。
        // 手机再发消息会收到 "未认证" 的 ack，提示用户重新扫码。
        {
            let state_for_idle = state.clone();
            let cancel_for_idle = cancel.clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(
                    std::time::Duration::from_secs(IDLE_CHECK_INTERVAL_SECS)
                );
                loop {
                    tokio::select! {
                        _ = interval.tick() => {}
                        _ = cancel_for_idle.cancelled() => break,
                    }
                    let now = now_ms();
                    let removed = {
                        let mut bindings = match state_for_idle.bindings.lock() {
                            Ok(g) => g,
                            Err(_) => continue,
                        };
                        let before = bindings.len();
                        bindings.retain(|b| now - b.last_active_ms < IDLE_TIMEOUT_MS);
                        before - bindings.len()
                    };
                    if removed > 0 {
                        tracing::info!(
                            "[webchat] idle cleanup: removed {} expired binding(s)",
                            removed
                        );
                        (state_for_idle.notify_bind_change)();
                    }
                }
                tracing::debug!("[webchat] idle cleanup task exited");
            });
        }

        Ok(Self {
            state,
            cancel,
            handle: SyncMutex::new(Some(handle)),
            port,
            lan_ip,
            wifi_name,
            session_id,
        })
    }

    /// 优雅关闭。返回后 server task 已经结束。
    pub async fn stop(&self) {
        // 先把 pending 的 ack 都以"已停止"回掉，避免手机一直转圈
        self.cancel_all_pending_acks();
        self.cancel.cancel();
        let h = {
            let mut guard = self.handle.lock().unwrap();
            guard.take()
        };
        if let Some(join) = h {
            let _ = join.await;
        }
    }

    /// 当前绑定设备数。server 内锁极短，同步查询安全。
    pub fn bound_devices_count(&self) -> usize {
        self.state
            .bindings
            .lock()
            .map(|v| v.len())
            .unwrap_or(0)
    }

    /// 当前 OTP 明文（供 UI 展示）。
    pub fn otp_plain(&self) -> String {
        self.state
            .otp
            .lock()
            .ok()
            .map(|g| g.plain.clone())
            .unwrap_or_default()
    }

    /// 当前 OTP 过期时间（unix ms）。
    pub fn expires_at_ms(&self) -> i64 {
        self.state
            .otp
            .lock()
            .ok()
            .map(|g| g.expires_at_ms)
            .unwrap_or(0)
    }

    /// 轮换 OTP：生成新的 6 位 OTP + 重置倒计时 + 清空错误计数/锁定。
    /// **保留 session_id、bindings、server task 本身**（已绑定手机继续通过
    /// userToken 发消息，不受影响）。
    ///
    /// 触发场景：
    /// - 倒计时归零（前端自动调）
    /// - 用户在锁定态手动点「重置 OTP」
    pub fn rotate_otp(&self) -> (String, i64) {
        let fresh = make_otp_state();
        let (plain, expires_at_ms) = (fresh.plain.clone(), fresh.expires_at_ms);
        if let Ok(mut g) = self.state.otp.lock() {
            *g = fresh;
        }
        tracing::info!("[webchat] OTP rotated, new expires_at_ms={}", expires_at_ms);
        // 推送新 OTP 给所有已认证连接，让手机端实时刷新 URL 里的 OTP，
        // 保证切换 App 后浏览器重载页面时仍能自动重连
        let _ = self.state.otp_refresh.send(plain.clone());
        (plain, expires_at_ms)
    }

    /// 外部触发：某条消息注入完成 / 失败 / 被取消，从 pending_acks 取出
    /// 对应的 Socket.IO AckSender 回调给手机。
    /// composite_id = `{channel}:{source_id}`，与 injector / history 保持一致。
    pub fn deliver_ack(&self, composite_id: &str, success: bool, reason: Option<String>) {
        let ack_opt = self
            .state
            .pending_acks
            .lock()
            .ok()
            .and_then(|mut map| map.remove(composite_id));
        if let Some(ack) = ack_opt {
            let _ = ack.send(&GenericAck { success, reason });
        }
    }

    /// 服务关闭时把所有 pending 的 ack 全部用失败回调，让手机端收到"已取消"
    /// 而不是一直 spinning。
    fn cancel_all_pending_acks(&self) {
        let drained: Vec<(String, AckSender)> = self
            .state
            .pending_acks
            .lock()
            .ok()
            .map(|mut map| map.drain().collect())
            .unwrap_or_default();
        for (_id, ack) in drained {
            let _ = ack.send(&GenericAck {
                success: false,
                reason: Some("server 已停止".to_string()),
            });
        }
    }

    /// 完整 QR 码 URL。OTP 明文嵌入 URL 参数，手机扫码后自动完成握手，无需手动输入。
    /// `lang` 来自桌面 Settings.language（`"zh"`/`"en"`/`""`）；
    /// 为空时不附加 `lang` 参数，让移动端 SPA 走自己的语言检测（localStorage / navigator）。
    pub fn qr_url(&self, lang: Option<&str>) -> String {
        let otp = self.otp_plain();
        let base = format!(
            "http://{}:{}/?s={}&otp={}",
            self.lan_ip, self.port, self.session_id, otp
        );
        match lang {
            Some(l) if l == "zh" || l == "en" => format!("{}&lang={}", base, l),
            _ => base,
        }
    }

    /// 会话是否锁定（OTP 5 次错）。
    pub fn is_locked(&self) -> bool {
        self.state
            .otp
            .lock()
            .ok()
            .map(|g| g.locked)
            .unwrap_or(false)
    }
}

/// drop 时同步触发 cancellation token，避免端口/资源泄漏。tokio task 会在
/// event loop 下一次 poll 时退出（abort 式而非 graceful），但进程退出场景
/// 端口由 OS 自然释放，这样处理足够稳。
impl Drop for WebChatServer {
    fn drop(&mut self) {
        self.cancel.cancel();
        self.cancel_all_pending_acks();
    }
}

// ──────────────────────────────────────────────────────────────
// 内部共享状态
// ──────────────────────────────────────────────────────────────

struct ServerState {
    #[allow(dead_code)] // 后续 ack 回流 / 多 server 识别时会用到
    session_id: String,
    /// OTP 相关全量状态。rotate_otp 一把锁替换即可。
    otp: SyncMutex<OtpState>,
    bindings: SyncMutex<Vec<Binding>>,
    injector: Arc<crate::queue::Injector>,
    history: Arc<crate::history::HistoryStore>,
    /// 等待 injection 真实结果的 ack：key 是 queue 里的 composite_id
    /// `{channel}:{source_message_id}`，和 typebridge://message-status 事件
    /// payload.id 完全一致。注入完成时上层 Bridge 会调 `deliver_ack` 取出
    /// 对应 AckSender 回调给手机。
    pending_acks: SyncMutex<HashMap<String, AckSender>>,
    /// binding 数量变化时（绑定 / 断开）通知上层 bridge 刷新快照并 emit 前端事件。
    notify_bind_change: Arc<dyn Fn() + Send + Sync + 'static>,
    /// OTP 轮换广播：rotate_otp 将新 OTP 明文发入，hello 成功的连接各自订阅并推送给手机。
    otp_refresh: broadcast::Sender<String>,
}

/// OTP 全量状态。rotate 时一把锁整体替换，避免字段间不一致。
struct OtpState {
    plain: String,
    hash: [u8; 32],
    expires_at_ms: i64,
    attempts: u8,
    locked: bool,
}

/// 生成一个新鲜的 OtpState（含 5 分钟 expires_at）。
fn make_otp_state() -> OtpState {
    let plain = generate_otp();
    let hash = sha256_hash(plain.as_bytes());
    let expires_at_ms = now_ms() + (SESSION_TTL_SECS as i64) * 1000;
    OtpState {
        plain,
        hash,
        expires_at_ms,
        attempts: 0,
        locked: false,
    }
}

#[derive(Clone, Debug)]
struct Binding {
    user_token_hash: [u8; 32],
    client_id: String,
    /// Socket.IO socket id，用于 disconnect 时反查并移除 binding
    socket_sid: String,
    bound_at_ms: i64,
    ua: String,
    /// 最近一次收到消息的时间戳（ms）。idle 超过 IDLE_TIMEOUT_MS 后由后台 task 自动移除 binding。
    last_active_ms: i64,
}

// ──────────────────────────────────────────────────────────────
// Socket.IO 事件 schema
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct HelloMsg {
    otp: String,
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(default)]
    ua: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum HelloAck {
    Ok {
        ok: bool,
        #[serde(rename = "userToken")]
        user_token: String,
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    Err {
        ok: bool,
        reason: &'static str,
    },
}

#[derive(Debug, Deserialize)]
struct TextMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    #[serde(rename = "clientMessageId")]
    client_message_id: String,
    text: String,
}

#[derive(Debug, Deserialize)]
struct ImageMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    #[serde(rename = "clientMessageId")]
    client_message_id: String,
    /// base64（不带 data: 前缀）
    data: String,
    #[serde(default = "default_image_mime")]
    mime: String,
}

#[derive(Debug, Deserialize)]
struct KeyMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    #[serde(rename = "clientMessageId")]
    client_message_id: String,
    /// W3C KeyboardEvent.code，受 ALLOWED_KEY_CODES 白名单约束
    code: String,
}

#[derive(Debug, Deserialize)]
struct KeyComboMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    #[allow(dead_code)]
    #[serde(rename = "clientMessageId")]
    client_message_id: String,
    /// 快捷键名称，受 ALLOWED_COMBOS 白名单约束
    combo: String,
}

#[derive(Debug, Deserialize)]
struct MouseMoveMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    dx: f64,
    dy: f64,
}

#[derive(Debug, Deserialize)]
struct MouseScrollMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    dx: f64,
    dy: f64,
}

#[derive(Debug, Deserialize)]
struct MouseClickMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    button: String,  // "left" | "right"
    action: String,  // "down" | "up"
}

#[derive(Debug, Deserialize)]
struct MouseZoomMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    delta: f64,
}

/// 控制键白名单：只允许无副作用的导航/编辑控制键。详见 TECH_DESIGN §35.11.3。
/// 任何不在此列表的 code 立即拒绝，绝不入队，避免 WebChat 变成"远程任意按键执行"通道。
const ALLOWED_KEY_CODES: &[&str] = &[
    "Enter",
    "Escape",
    "Backspace",
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
];

/// key_combo 白名单（仅允许已知无害的编辑快捷键）。
const ALLOWED_COMBOS: &[&str] = &[
    "Undo", "Redo", "SelectAll", "Copy", "Cut", "Paste",
    "DesktopLeft", "DesktopRight", "MissionControl", "AppExpose",
];

fn default_image_mime() -> String {
    "image/jpeg".into()
}

#[derive(Debug, Serialize)]
struct GenericAck {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

// ──────────────────────────────────────────────────────────────
// Socket.IO handlers
// ──────────────────────────────────────────────────────────────

async fn on_connect(socket: SocketRef) {
    tracing::info!("[webchat] client connected: sid={}", socket.id);

    // hello：校验 OTP，签发 userToken。ack 必须保持 Ok/Err 形状让前端 discriminated union
    socket.on(
        "hello",
        |socket: SocketRef, Data::<HelloMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            let result = handle_hello(&socket, &msg, state.clone()).await;
            match result {
                Ok(user_token) => {
                    let _ = ack.send(&HelloAck::Ok {
                        ok: true,
                        user_token,
                        session_id: socket.ns().to_string(),
                    });
                    // 订阅 OTP 轮换广播：后台任务将每次新 OTP 推送给此 socket，
                    // 手机端收到后实时更新 URL 里的 otp 参数，确保页面重载时能自动重连
                    let mut rx = state.otp_refresh.subscribe();
                    let socket_clone = socket.clone();
                    tokio::spawn(async move {
                        while let Ok(new_otp) = rx.recv().await {
                            if socket_clone
                                .emit("otp-refresh", &serde_json::json!({ "otp": new_otp }))
                                .is_err()
                            {
                                break; // socket 已关闭，结束任务
                            }
                        }
                    });
                }
                Err(reason) => {
                    let _ = ack.send(&HelloAck::Err { ok: false, reason });
                }
            }
        },
    );

    // text：入 FIFO 队列；AckSender 暂存到 pending_acks，等 injector 注入完成后
    // 上层 Bridge 调 deliver_ack 回调给手机。如果 enqueue 本身就失败（校验错 / 内存
    // 错），立即 ack 失败。
    socket.on(
        "text",
        |_socket: SocketRef, Data::<TextMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            match handle_text(&msg, state.clone()).await {
                Ok(composite_id) => {
                    park_ack(&state, composite_id, ack);
                }
                Err(reason) => {
                    let _ = ack.send(&GenericAck {
                        success: false,
                        reason: Some(reason),
                    });
                }
            }
        },
    );

    // image
    socket.on(
        "image",
        |_socket: SocketRef, Data::<ImageMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            match handle_image(&msg, state.clone()).await {
                Ok(composite_id) => {
                    park_ack(&state, composite_id, ack);
                }
                Err(reason) => {
                    let _ = ack.send(&GenericAck {
                        success: false,
                        reason: Some(reason),
                    });
                }
            }
        },
    );

    // key：控制键事件（Enter / Backspace / Arrow*）。与 text/image 走同一 FIFO 队列，
    // 严格按用户点击顺序串行注入，避免 Enter 插在粘贴中间提前提交。详见 TECH_DESIGN §35.11
    socket.on(
        "key",
        |_socket: SocketRef, Data::<KeyMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            match handle_key(&msg, state.clone()).await {
                Ok(composite_id) => {
                    park_ack(&state, composite_id, ack);
                }
                Err(reason) => {
                    let _ = ack.send(&GenericAck {
                        success: false,
                        reason: Some(reason),
                    });
                }
            }
        },
    );

    // key_combo：Undo/Redo/SelectAll/Copy/Cut/Paste — 直接调 injector，不走队列
    socket.on(
        "key_combo",
        |_socket: SocketRef, Data::<KeyComboMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            if let Err(e) = verify_user_token(&msg.user_token, &state) {
                let _ = ack.send(&GenericAck { success: false, reason: Some(e) });
                return;
            }
            touch_active(&msg.user_token, &state);
            if !ALLOWED_COMBOS.contains(&msg.combo.as_str()) {
                let _ = ack.send(&GenericAck {
                    success: false,
                    reason: Some(format!("不支持的快捷键：{}", msg.combo)),
                });
                return;
            }
            let combo = msg.combo.clone();
            let result = tokio::task::spawn_blocking(move || crate::injector::key_combo(&combo)).await;
            let ok = match result {
                Ok(Ok(())) => GenericAck { success: true, reason: None },
                Ok(Err(e)) => GenericAck { success: false, reason: Some(e) },
                Err(e) => GenericAck { success: false, reason: Some(e.to_string()) },
            };
            let _ = ack.send(&ok);
        },
    );

    // mouse_move：fire-and-forget，无 ack
    socket.on(
        "mouse_move",
        |_socket: SocketRef, Data::<MouseMoveMsg>(msg), State(state): State<Arc<ServerState>>| async move {
            if verify_user_token(&msg.user_token, &state).is_err() {
                return;
            }
            let (dx, dy) = (msg.dx, msg.dy);
            tokio::task::spawn_blocking(move || {
                let _ = crate::injector::mouse_move(dx, dy);
            });
        },
    );

    // mouse_scroll：fire-and-forget
    socket.on(
        "mouse_scroll",
        |_socket: SocketRef, Data::<MouseScrollMsg>(msg), State(state): State<Arc<ServerState>>| async move {
            if verify_user_token(&msg.user_token, &state).is_err() {
                return;
            }
            let (dx, dy) = (msg.dx, msg.dy);
            tokio::task::spawn_blocking(move || {
                let _ = crate::injector::mouse_scroll(dx, dy);
            });
        },
    );

    // mouse_click：fire-and-forget（down/up 顺序由前端保证）
    socket.on(
        "mouse_click",
        |_socket: SocketRef, Data::<MouseClickMsg>(msg), State(state): State<Arc<ServerState>>| async move {
            if verify_user_token(&msg.user_token, &state).is_err() {
                return;
            }
            let (button, action) = (msg.button.clone(), msg.action.clone());
            tokio::task::spawn_blocking(move || {
                let _ = crate::injector::mouse_click(&button, &action);
            });
        },
    );

    // mouse_zoom：fire-and-forget
    socket.on(
        "mouse_zoom",
        |_socket: SocketRef, Data::<MouseZoomMsg>(msg), State(state): State<Arc<ServerState>>| async move {
            if verify_user_token(&msg.user_token, &state).is_err() {
                return;
            }
            let delta = msg.delta;
            tokio::task::spawn_blocking(move || {
                let _ = crate::injector::mouse_zoom(delta);
            });
        },
    );

    socket.on_disconnect(
        |socket: SocketRef, State(state): State<Arc<ServerState>>| async move {
            let sid = socket.id.to_string();
            tracing::info!("[webchat] client disconnected: sid={}", sid);
            let removed = {
                match state.bindings.lock() {
                    Ok(mut bindings) => {
                        let before = bindings.len();
                        bindings.retain(|b| b.socket_sid != sid);
                        bindings.len() < before
                    }
                    Err(_) => false,
                }
            };
            if removed {
                tracing::info!("[webchat] binding removed for sid={}, notifying bridge", sid);
                (state.notify_bind_change)();
            }
        },
    );
}

/// 把 AckSender 按 composite_id 暂存，等注入完成时 deliver_ack 回调。
fn park_ack(state: &ServerState, composite_id: String, ack: AckSender) {
    if let Ok(mut map) = state.pending_acks.lock() {
        map.insert(composite_id, ack);
    }
}

fn to_generic_ack(r: Result<(), String>) -> GenericAck {
    match r {
        Ok(_) => GenericAck {
            success: true,
            reason: None,
        },
        Err(e) => GenericAck {
            success: false,
            reason: Some(e),
        },
    }
}
// 保留工具供未来使用（当前改用 park_ack 流程，GenericAck 直接构造）
#[allow(dead_code)]
fn _unused_ack_convert() {
    let _ = to_generic_ack;
}

async fn handle_hello(
    socket: &SocketRef,
    msg: &HelloMsg,
    state: Arc<ServerState>,
) -> Result<String, &'static str> {
    // 用 constant-time 对比哈希避免 timing attack。lock 一次拿所有检查需要的字段，
    // 如果 OTP 错就原地 ++attempts / 置 locked；成功则 drop 锁后再签 userToken。
    let submitted_hash = sha256_hash(msg.otp.as_bytes());
    {
        let mut otp = state.otp.lock().map_err(|_| "LOCK_POISONED")?;
        if otp.locked {
            return Err("OTP_LOCKED");
        }
        if now_ms() > otp.expires_at_ms {
            return Err("SESSION_EXPIRED");
        }
        if !constant_time_eq(&submitted_hash, &otp.hash) {
            otp.attempts = otp.attempts.saturating_add(1);
            if otp.attempts >= MAX_OTP_ATTEMPTS {
                otp.locked = true;
                return Err("OTP_LOCKED");
            }
            return Err("OTP_INVALID");
        }
        // 通过：放锁，下面处理 bindings
    }

    let user_token = generate_token();
    let user_token_hash = sha256_hash(user_token.as_bytes());
    {
        let mut bindings = state.bindings.lock().map_err(|_| "LOCK_POISONED")?;
        // 同一 clientId 二次握手（手机刷新）→ 替换旧 binding
        let socket_sid = socket.id.to_string();
        let now = now_ms();
        if let Some(existing) = bindings.iter_mut().find(|b| b.client_id == msg.client_id) {
            existing.user_token_hash = user_token_hash;
            existing.socket_sid = socket_sid;
            existing.bound_at_ms = now;
            existing.last_active_ms = now;
            if let Some(ua) = &msg.ua {
                existing.ua = ua.clone();
            }
        } else {
            bindings.push(Binding {
                user_token_hash,
                client_id: msg.client_id.clone(),
                socket_sid,
                bound_at_ms: now,
                ua: msg.ua.clone().unwrap_or_default(),
                last_active_ms: now,
            });
        }
        tracing::info!(
            "[webchat] client bound: clientId={}, total_bindings={}",
            msg.client_id,
            bindings.len()
        );
    }

    Ok(user_token)
}

async fn handle_text(msg: &TextMsg, state: Arc<ServerState>) -> Result<String, String> {
    verify_user_token(&msg.user_token, &state)?;
    touch_active(&msg.user_token, &state);
    ingest_text(&msg.client_message_id, &msg.text, &state)
}

async fn handle_image(msg: &ImageMsg, state: Arc<ServerState>) -> Result<String, String> {
    verify_user_token(&msg.user_token, &state)?;
    touch_active(&msg.user_token, &state);
    ingest_image(&msg.client_message_id, &msg.data, &msg.mime, &state)
}

async fn handle_key(msg: &KeyMsg, state: Arc<ServerState>) -> Result<String, String> {
    verify_user_token(&msg.user_token, &state)?;
    touch_active(&msg.user_token, &state);
    if !ALLOWED_KEY_CODES.contains(&msg.code.as_str()) {
        return Err(format!("不支持的按键：{}", msg.code));
    }
    ingest_key(&msg.client_message_id, &msg.code, &state)
}

fn verify_user_token(token: &str, state: &ServerState) -> Result<(), String> {
    let h = sha256_hash(token.as_bytes());
    let bindings = state
        .bindings
        .lock()
        .map_err(|_| "LOCK_POISONED".to_string())?;
    if bindings.iter().any(|b| constant_time_eq(&b.user_token_hash, &h)) {
        Ok(())
    } else {
        Err("未认证或 token 已失效".into())
    }
}

/// 更新对应 token binding 的 last_active_ms（touch 语义，任何消息均调用）。
fn touch_active(token: &str, state: &ServerState) {
    let h = sha256_hash(token.as_bytes());
    if let Ok(mut bindings) = state.bindings.lock() {
        let now = now_ms();
        for b in bindings.iter_mut() {
            if constant_time_eq(&b.user_token_hash, &h) {
                b.last_active_ms = now;
                break;
            }
        }
    }
}

fn ingest_text(client_message_id: &str, text: &str, state: &ServerState) -> Result<String, String> {
    // client_message_id 当前未用于 ack 回流（Socket.IO ack 由 composite_id 匹配），
    // 仅留作调试日志
    let _ = client_message_id;
    // 防御性 trim：去除首尾空白（含 \n），避免移动端软键盘回车键误带换行
    let text = text.trim();
    if text.is_empty() {
        return Err("文本不能为空".into());
    }
    let source_id = format!("wc_{}", short_uid());
    let composite = crate::channel::composite_id(ChannelId::WebChat, &source_id);

    // 写入历史
    let ts = now_ms();
    let msg = HistoryMessage {
        id: composite.clone(),
        channel: ChannelId::WebChat,
        source_message_id: source_id.clone(),
        received_at: ts,
        updated_at: ts,
        sender: "WebChat".into(),
        text: text.to_string(),
        image_path: None,
        status: MessageStatus::Queued,
        failure_reason: None,
        feedback_error: None,
        feedback_card_id: None,
    };
    state.history.append(msg);

    // 入队
    state
        .injector
        .enqueue(QueuedMessage {
            id: composite.clone(),
            channel: ChannelId::WebChat,
            source_message_id: source_id,
            text: text.to_string(),
            image_path: None,
            image_mime: None,
            key: None,
        })?;

    Ok(composite)
}

fn ingest_image(
    client_message_id: &str,
    base64_data: &str,
    mime: &str,
    state: &ServerState,
) -> Result<String, String> {
    let _ = client_message_id;
    use base64::{engine::general_purpose, Engine as _};
    let raw = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("图片 base64 解码失败：{}", e))?;

    let ext = mime_to_ext(mime);
    let source_id = format!("wc_{}", short_uid());
    let composite = crate::channel::composite_id(ChannelId::WebChat, &source_id);

    // 保存图片
    let rel_path = format!("images/{}.{}", source_id, ext);
    let abs = state.history.abs_image_path(&rel_path);
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建图片目录失败：{}", e))?;
    }
    std::fs::write(&abs, &raw).map_err(|e| format!("写图片失败：{}", e))?;

    // 写历史
    let ts = now_ms();
    let msg = HistoryMessage {
        id: composite.clone(),
        channel: ChannelId::WebChat,
        source_message_id: source_id.clone(),
        received_at: ts,
        updated_at: ts,
        sender: "WebChat".into(),
        text: String::new(),
        image_path: Some(rel_path.clone()),
        status: MessageStatus::Queued,
        failure_reason: None,
        feedback_error: None,
        feedback_card_id: None,
    };
    state.history.append(msg);

    // 入队
    state
        .injector
        .enqueue(QueuedMessage {
            id: composite.clone(),
            channel: ChannelId::WebChat,
            source_message_id: source_id,
            text: String::new(),
            image_path: Some(rel_path),
            image_mime: Some(mime.to_string()),
            key: None,
        })?;

    Ok(composite)
}

fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpg" | "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    }
}

/// 控制键事件入队：不写历史，不分配图片资源，只生成一个 composite_id 让
/// pending_acks 能在注入完成时回 ack 给手机。worker 命中 key 分支后跳过
/// 粘贴流程，直接 simulate_submit。详见 TECH_DESIGN §35.11
fn ingest_key(client_message_id: &str, code: &str, state: &ServerState) -> Result<String, String> {
    let _ = client_message_id;
    let source_id = format!("wc_{}", short_uid());
    let composite = crate::channel::composite_id(ChannelId::WebChat, &source_id);

    state
        .injector
        .enqueue(QueuedMessage {
            id: composite.clone(),
            channel: ChannelId::WebChat,
            source_message_id: source_id,
            text: String::new(),
            image_path: None,
            image_mime: None,
            key: Some(code.to_string()),
        })?;

    Ok(composite)
}

// ──────────────────────────────────────────────────────────────
// HTTP 路由 handlers
// ──────────────────────────────────────────────────────────────

async fn serve_placeholder() -> impl IntoResponse {
    // 只有 webchat-local/dist 完全不存在时才会走到这；实际路由用 fallback ServeDir
    Html(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>TypeBridge · WebChat</title>
</head>
<body style="font-family: -apple-system, sans-serif; padding: 2rem; background: #fff8ed;">
  <h1 style="font-size: 18px;">WebChat server 已启动，但前端资源未找到</h1>
  <p style="color: #666;">请先构建 webchat-local: <code>cd webchat-local &amp;&amp; npm run build</code></p>
</body>
</html>"#,
    )
}

async fn healthz() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

/// dev-only fallback：把任意未匹配请求 302 到 Vite dev server (5173)，并把
/// `apiPort=<server_port>` 追加到 query，让 SPA 知道跨源 Socket.IO 该连哪。
///
/// 设计要点：
/// - 仅在 `cfg!(debug_assertions)` 下注册。release build 走 ServeDir
/// - 不动 path（保留原 `?s=<sessionId>` 等 query），仅追加 apiPort
/// - 用 307（temporary）保留 method 和 body — 实际只对 GET 生效，但保险
fn redirect_to_vite_dev(uri: axum::http::Uri, lan_ip: IpAddr, port: u16) -> Redirect {
    let path = uri.path();
    let new_url = match uri.query() {
        Some(q) if !q.is_empty() => {
            format!("http://{}:5173{}?{}&apiPort={}", lan_ip, path, q, port)
        }
        _ => format!("http://{}:5173{}?apiPort={}", lan_ip, path, port),
    };
    Redirect::temporary(&new_url)
}

// ──────────────────────────────────────────────────────────────
// 绑端口（fallback）
// ──────────────────────────────────────────────────────────────

async fn bind_with_fallback(ip: IpAddr) -> Result<(TcpListener, u16), String> {
    for offset in 0..PORT_RANGE {
        let port = PORT_START + offset;
        let addr = SocketAddr::new(ip, port);
        match TcpListener::bind(addr).await {
            Ok(listener) => return Ok((listener, port)),
            Err(e) => {
                tracing::warn!("[webchat] bind {}:{} failed: {}", ip, port, e);
                continue;
            }
        }
    }
    Err(format!(
        "端口 {}-{} 全部被占用，请关闭占用这些端口的其他应用后重试",
        PORT_START,
        PORT_START + PORT_RANGE - 1
    ))
}

// ──────────────────────────────────────────────────────────────
// 工具
// ──────────────────────────────────────────────────────────────

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as i64
}

fn sha256_hash(input: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(input);
    let out = h.finalize();
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&out);
    arr
}

fn constant_time_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut diff: u8 = 0;
    for i in 0..32 {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

fn generate_session_id() -> String {
    // ses_<24-char base32ish>
    let mut bytes = [0u8; 15];
    rand::thread_rng().fill_bytes(&mut bytes);
    let alph = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let s: String = bytes
        .iter()
        .map(|&b| alph[(b % 32) as usize] as char)
        .collect();
    format!("ses_{}", s)
}

fn generate_otp() -> String {
    let mut bytes = [0u8; 4];
    rand::thread_rng().fill_bytes(&mut bytes);
    let n = u32::from_be_bytes(bytes);
    format!("{:06}", n % 1_000_000)
}

fn generate_token() -> String {
    use base64::{engine::general_purpose, Engine as _};
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn short_uid() -> String {
    let mut bytes = [0u8; 6];
    rand::thread_rng().fill_bytes(&mut bytes);
    let alph = b"abcdefghijklmnopqrstuvwxyz0123456789";
    bytes
        .iter()
        .map(|&b| alph[(b as usize) % alph.len()] as char)
        .collect()
}
