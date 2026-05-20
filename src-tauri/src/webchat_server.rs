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
use socketioxide::socket::Sid;
use socketioxide::SocketIo;
use tokio::net::TcpListener;
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
/// binding 超过 150s（即 2.5 分钟）无任何消息就自动释放；手机端再发消息会收到未认证错误，提示用户重新扫码。
const IDLE_TIMEOUT_MS: i64 = 150_000;
/// idle 清理 task 扫描间隔
const IDLE_CHECK_INTERVAL_SECS: u64 = 30;

// ──────────────────────────────────────────────────────────────
// 公开类型
// ──────────────────────────────────────────────────────────────

/// 当前唯一绑定客户端的快照（外部供 snapshot / UI 显示用）。
/// v3 协议下"一台 server = 至多一台手机"，bound_client 充当哨兵。
#[derive(Debug, Clone, Serialize)]
pub struct BoundClient {
    #[serde(rename = "clientId")]
    pub client_id: String,
    pub ua: String,
    #[serde(rename = "boundAt")]
    pub bound_at_ms: i64,
}

/// 运行中的 server handle。调用 stop() 触发 cancellation token，后台优雅关闭。
pub struct WebChatServer {
    /// 启动参数 + 内部状态共享
    state: Arc<ServerState>,
    /// 用于 graceful shutdown
    cancel: CancellationToken,
    /// server 主 task（stop 时 take 出来 await）
    handle: SyncMutex<Option<JoinHandle<()>>>,
    /// Socket.IO 句柄，stop 时用来主动踢掉所有连着的手机 socket
    io: SocketIo,
    /// 启动后对外可见的元数据
    pub port: u16,
    pub lan_ip: IpAddr,
    pub wifi_name: Option<String>,
    /// 持久化 sessionId（来自上层 store，跨重启稳定）
    pub session_id: String,
}

impl WebChatServer {
    /// 启动一个新 server。
    /// `session_id`：上层 (webchat.rs) 从 store 读取的持久化 sessionId；首次启动
    ///   或用户显式重置后由调用方生成新 id 并写回 store。
    /// `notify_bind_change`：binding 数量变化（新设备接入 / 断开）时同步回调，
    /// 上层 bridge 在此回调里 emit typebridge://webchat-session-update 事件。
    /// `spa_dir` 指向 webchat-local 的构建产物目录（含 index.html），由外部 resolve
    /// tauri resource 后传进来。若目录不存在，server 也能起来，但静态资源路由会 404。
    pub async fn start(
        ctx: Arc<AppContext>,
        session_id: String,
        spa_dir: PathBuf,
        notify_bind_change: Arc<dyn Fn() + Send + Sync + 'static>,
    ) -> Result<Self, String> {
        let lan_ip = crate::webchat_net::primary_lan_ip()
            .ok_or_else(|| "未检测到可用的局域网 IP（请先连接 WiFi 或以太网）".to_string())?;
        let wifi_name = crate::webchat_net::current_wifi_ssid();

        // v3：启动时枚举本机网卡（含 netmask），用于 handle_hello 的 LAN 校验。
        // 切换 WiFi/网段后缓存的网卡会失效（QR 也会跟着变），用户重启 App / 重启 WebChat 自然解决。
        let local_nics = crate::webchat_net::enumerate_local_nics();
        tracing::info!(
            "[webchat] start session_id={} lan_ip={} local_nics={}",
            session_id,
            lan_ip,
            local_nics.len()
        );

        let state = Arc::new(ServerState {
            session_id: session_id.clone(),
            local_nics,
            bound_client: SyncMutex::new(None),
            bindings: SyncMutex::new(Vec::new()),
            injector: ctx.injector.clone(),
            history: ctx.history.clone(),
            pending_acks: SyncMutex::new(HashMap::new()),
            notify_bind_change,
        });

        // 构建 Socket.IO layer
        let (io_layer, io) = SocketIo::builder().with_state(state.clone()).build_layer();
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
            let serve = axum::serve(
                listener,
                router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
            )
            .with_graceful_shutdown(async move { cancel_clone.cancelled().await });
            if let Err(e) = serve.await {
                tracing::error!("[webchat] axum serve error: {}", e);
            }
            tracing::info!("[webchat] server task exited");
        });

        // 启动 idle binding 清理 task（保险机制，应对 on_disconnect 未触发的极端情况）。
        //
        // 判活逻辑：
        //   1. io.get_socket(sid).is_some() → Socket.IO Engine.IO ping/pong 保活中 → 跳过
        //   2. socket 已断 + 距上次活跃 > IDLE_TIMEOUT_MS → 驱逐
        //
        // 正常情况下 on_disconnect 会即时清理；此 task 只处理漏网情况。
        {
            let state_for_idle = state.clone();
            let cancel_for_idle = cancel.clone();
            let io_for_idle = io.clone();
            tokio::spawn(async move {
                let mut interval =
                    tokio::time::interval(std::time::Duration::from_secs(IDLE_CHECK_INTERVAL_SECS));
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
                        bindings.retain(|b| {
                            // socket 在线（Engine.IO heartbeat 确认）→ 保留
                            if io_for_idle.get_socket(b.socket_sid).is_some() {
                                return true;
                            }
                            // socket 已断：宽限期内保留（手机可能正在重连）
                            now - b.last_active_ms < IDLE_TIMEOUT_MS
                        });
                        before - bindings.len()
                    };
                    if removed > 0 {
                        // v3：若清理后 bindings 已空，同步释放 bound_client（保险机制）
                        let empty = state_for_idle
                            .bindings
                            .lock()
                            .map(|b| b.is_empty())
                            .unwrap_or(false);
                        if empty {
                            if let Ok(mut bc) = state_for_idle.bound_client.lock() {
                                *bc = None;
                            }
                        }
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
            io,
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
        // v4：桌面端主动停止 → 显式给所有连着的手机 socket 广播 `kicked` 事件，
        // 紧接着主动 disconnect 这些 socket。这样手机端能立刻收到信号跳到
        // server-closed 错误页 + 清掉 URL 上的 sessionId，刷新也不会再连回来。
        // 不靠 axum graceful shutdown 的 TCP RST，避免某些环境下手机 io-client
        // 不立刻察觉的问题。
        let _ = self.io.emit("kicked", &());
        let _ = self.io.disconnect();
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
        self.state.bindings.lock().map(|v| v.len()).unwrap_or(0)
    }

    /// 当前绑定的客户端快照（v3 单设备模式）。None 表示尚未绑定。
    pub fn bound_client(&self) -> Option<BoundClient> {
        self.state.bound_client.lock().ok().and_then(|g| g.clone())
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

    /// 完整 QR 码 URL。v3：URL 中只携带 sessionId（不再嵌 OTP），
    /// 手机扫码后通过 Socket.IO hello 完成握手 + LAN 校验。
    /// `lang` 来自桌面 Settings.language（`"zh"`/`"en"`/`""`）；
    /// 为空时不附加 `lang` 参数，让移动端 SPA 走自己的语言检测。
    pub fn qr_url(&self, lang: Option<&str>) -> String {
        let base = format!(
            "http://{}:{}/?s={}",
            self.lan_ip, self.port, self.session_id
        );
        match lang {
            Some(l) if l == "zh" || l == "en" => format!("{}&lang={}", base, l),
            _ => base,
        }
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
    /// 本 server 实例的 sessionId（v3：来自上层 store，跨重启稳定）
    session_id: String,
    /// v3：启动时缓存的本机网卡列表，handle_hello 用来做 LAN 同子网校验
    local_nics: Vec<crate::webchat_net::LocalNic>,
    /// v3：当前已绑定的唯一客户端（单设备模式）。None 表示尚未绑定。
    /// 用作"占座"哨兵：不同 clientId 来 hello 时直接拒绝 ALREADY_BOUND。
    bound_client: SyncMutex<Option<BoundClient>>,
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
}

#[derive(Clone, Debug)]
struct Binding {
    user_token_hash: [u8; 32],
    client_id: String,
    /// Socket.IO socket id（Engine.IO Sid），用于 disconnect 时反查并移除 binding
    socket_sid: Sid,
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
    /// v3：手机端 localStorage 缓存的 sessionId（首次扫码时来自 QR 的 ?s= 参数）。
    /// server 校验该值必须与自身 session_id 完全一致，否则 SESSION_NOT_FOUND。
    #[serde(rename = "sessionId")]
    session_id: String,
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

/// v3：手机端主动断连协议消息。userToken 用来防止其他设备恶意触发断连。
#[derive(Debug, Deserialize)]
struct ByeMsg {
    #[serde(rename = "userToken")]
    user_token: String,
}

#[derive(Debug, Deserialize)]
struct TextMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    #[serde(rename = "clientMessageId")]
    client_message_id: String,
    text: String,
    /// true → 注入后用 submit_config 执行提交（等同桌面端「自动提交」一次）
    /// false（默认）→ 仅注入文本，不触发提交键
    #[serde(default)]
    submit: bool,
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
struct ScreenshotMsg {
    #[serde(rename = "userToken")]
    user_token: String,
    /// "screen" | "window"
    kind: String,
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
    button: String, // "left" | "right"
    action: String, // "down" | "up"
    #[serde(rename = "clickCount", default = "default_click_count")]
    click_count: u32,
}

fn default_click_count() -> u32 {
    1
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
    "Undo",
    "Redo",
    "SelectAll",
    "Copy",
    "Cut",
    "Paste",
    "DocTop",
    "DocBottom",
    "DesktopLeft",
    "DesktopRight",
    "MissionControl",
    "AppExpose",
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

    // hello（v3）：校验 sessionId + LAN 同子网 + 单设备 bound_client 哨兵，签发 userToken。
    // ack 保持 Ok/Err 形状供前端做 discriminated union。
    socket.on(
        "hello",
        |socket: SocketRef,
         Data::<HelloMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
            let result = handle_hello(&socket, &msg, state.clone()).await;
            match result {
                Ok(user_token) => {
                    let _ = ack.send(&HelloAck::Ok {
                        ok: true,
                        user_token,
                        session_id: state.session_id.clone(),
                    });
                }
                Err(reason) => {
                    let _ = ack.send(&HelloAck::Err { ok: false, reason });
                }
            }
        },
    );

    // bye（v3）：手机端用户主动断连。校验 userToken 后立即清 bindings + bound_client，
    // 通知桌面 UI 即时刷新（不必等 on_disconnect 的 ~3-5s socket close 延迟），
    // 然后关闭手机 socket。失败时 ack 失败但不动状态。
    socket.on(
        "bye",
        |socket: SocketRef,
         Data::<ByeMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
            match handle_bye(&msg, state.clone()) {
                Ok(()) => {
                    let _ = ack.send(&GenericAck {
                        success: true,
                        reason: None,
                    });
                    // 通知桌面 UI 状态变化
                    (state.notify_bind_change)();
                    // 主动关闭 socket，确保手机端立刻拿到 disconnected 信号
                    let _ = socket.disconnect();
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

    // text：入 FIFO 队列；AckSender 暂存到 pending_acks，等 injector 注入完成后
    // 上层 Bridge 调 deliver_ack 回调给手机。如果 enqueue 本身就失败（校验错 / 内存
    // 错），立即 ack 失败。
    socket.on(
        "text",
        |_socket: SocketRef,
         Data::<TextMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
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
        |_socket: SocketRef,
         Data::<ImageMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
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
        |_socket: SocketRef,
         Data::<KeyMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
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
        |_socket: SocketRef,
         Data::<KeyComboMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
            if let Err(e) = verify_user_token(&msg.user_token, &state) {
                let _ = ack.send(&GenericAck {
                    success: false,
                    reason: Some(e),
                });
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
            let result =
                tokio::task::spawn_blocking(move || crate::injector::key_combo(&combo)).await;
            let ok = match result {
                Ok(Ok(())) => GenericAck {
                    success: true,
                    reason: None,
                },
                Ok(Err(e)) => GenericAck {
                    success: false,
                    reason: Some(e),
                },
                Err(e) => GenericAck {
                    success: false,
                    reason: Some(e.to_string()),
                },
            };
            let _ = ack.send(&ok);
        },
    );

    // screenshot：截图到剪贴板（kind = "screen" | "window"），有 ack
    socket.on(
        "screenshot",
        |_socket: SocketRef,
         Data::<ScreenshotMsg>(msg),
         ack: AckSender,
         State(state): State<Arc<ServerState>>| async move {
            if let Err(e) = verify_user_token(&msg.user_token, &state) {
                let _ = ack.send(&GenericAck {
                    success: false,
                    reason: Some(e),
                });
                return;
            }
            touch_active(&msg.user_token, &state);
            let kind = msg.kind.clone();
            // 只允许 "screen" 和 "window"
            if kind != "screen" && kind != "window" {
                let _ = ack.send(&GenericAck {
                    success: false,
                    reason: Some(format!("unsupported screenshot kind: {kind}")),
                });
                return;
            }
            let result =
                tokio::task::spawn_blocking(move || crate::injector::screenshot(&kind)).await;
            let ok = match result {
                Ok(Ok(())) => GenericAck {
                    success: true,
                    reason: None,
                },
                Ok(Err(e)) => GenericAck {
                    success: false,
                    reason: Some(e),
                },
                Err(e) => GenericAck {
                    success: false,
                    reason: Some(e.to_string()),
                },
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
            let (button, action, click_count) = (msg.button.clone(), msg.action.clone(), msg.click_count);
            tokio::task::spawn_blocking(move || {
                let _ = crate::injector::mouse_click(&button, &action, click_count);
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
            let sid = socket.id;
            tracing::info!("[webchat] client disconnected: sid={}", sid);
            let removed = {
                match state.bindings.lock() {
                    Ok(mut bindings) => {
                        let before = bindings.len();
                        bindings.retain(|b| b.socket_sid != sid);
                        let now_len = bindings.len();
                        // v3：bindings 空了 → 同步清 bound_client，允许新设备重新绑定
                        if now_len == 0 {
                            if let Ok(mut bc) = state.bound_client.lock() {
                                *bc = None;
                            }
                        }
                        now_len < before
                    }
                    Err(_) => false,
                }
            };
            if removed {
                tracing::info!(
                    "[webchat] binding removed for sid={}, notifying bridge",
                    sid
                );
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
    // v3 协议：3 道关
    //   1. sessionId 必须匹配本 server（否则手机连到的是旧实例 → SESSION_NOT_FOUND）
    //   2. 客户端 peer IP 必须落在本机任一网卡的子网内（LAN 校验，防公网/异网段误用）
    //   3. bound_client 单例：同 clientId 重连允许（手机刷新），不同 clientId 拒绝 ALREADY_BOUND

    // 1. sessionId 校验
    if msg.session_id != state.session_id {
        tracing::warn!(
            "[webchat] hello rejected SESSION_NOT_FOUND: msg.sid={} server.sid={}",
            msg.session_id,
            state.session_id
        );
        return Err("SESSION_NOT_FOUND");
    }

    // 2. LAN 校验：从 socket 拿 peer 的 ConnectInfo<SocketAddr>，比对本机各网卡子网
    let peer_ip = socket
        .req_parts()
        .extensions
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|ci| ci.0.ip());
    match peer_ip {
        Some(ip) if crate::webchat_net::is_in_lan(ip, &state.local_nics) => {
            tracing::debug!("[webchat] hello LAN check passed: peer_ip={}", ip);
        }
        Some(ip) => {
            tracing::warn!("[webchat] hello rejected OUT_OF_LAN: peer_ip={}", ip);
            return Err("OUT_OF_LAN");
        }
        None => {
            tracing::warn!("[webchat] hello rejected OUT_OF_LAN: peer_ip unknown");
            return Err("OUT_OF_LAN");
        }
    }

    // 3. bound_client 单设备哨兵
    {
        let mut bound = state.bound_client.lock().map_err(|_| "LOCK_POISONED")?;
        match bound.as_ref() {
            Some(existing) if existing.client_id == msg.client_id => {
                // 同设备重连（手机刷新 / 重启浏览器）→ 更新元数据
                if let Some(b) = bound.as_mut() {
                    b.bound_at_ms = now_ms();
                    if let Some(ua) = &msg.ua {
                        b.ua = ua.clone();
                    }
                }
            }
            Some(existing) => {
                tracing::warn!(
                    "[webchat] hello rejected ALREADY_BOUND: existing_client_id={} incoming={}",
                    existing.client_id,
                    msg.client_id
                );
                return Err("ALREADY_BOUND");
            }
            None => {
                *bound = Some(BoundClient {
                    client_id: msg.client_id.clone(),
                    ua: msg.ua.clone().unwrap_or_default(),
                    bound_at_ms: now_ms(),
                });
            }
        }
    }

    // 4. 签 userToken（与 v2 一致）
    let user_token = generate_token();
    let user_token_hash = sha256_hash(user_token.as_bytes());
    {
        let mut bindings = state.bindings.lock().map_err(|_| "LOCK_POISONED")?;
        let socket_sid = socket.id;
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

    // v3 fix（BUG1+4）：hello 成功也要通知桌面 UI 刷新快照。
    // 此前只在 on_disconnect / idle-evict 时回调，导致手机扫码成功 / 刷新重连后
    // 桌面端 UI 直到切 tab 触发重渲染才看到新的 bound_client 状态。
    (state.notify_bind_change)();

    Ok(user_token)
}

/// v3：手机端主动断连处理。校验 userToken 后清掉对应 binding，
/// 若 bindings 已空则释放 bound_client（允许其他设备重新绑定）。
/// 注意：socket 关闭和 notify_bind_change 由调用方负责。
fn handle_bye(msg: &ByeMsg, state: Arc<ServerState>) -> Result<(), String> {
    // 1. 校验 userToken 必须属于当前 bindings 中的某条记录
    verify_user_token(&msg.user_token, &state)?;

    // 2. 移除对应 binding，并在 bindings 清空时同步释放 bound_client
    let token_hash = sha256_hash(msg.user_token.as_bytes());
    {
        let mut bindings = state.bindings.lock().map_err(|_| "LOCK_POISONED")?;
        let before = bindings.len();
        bindings.retain(|b| b.user_token_hash != token_hash);
        let after = bindings.len();
        tracing::info!(
            "[webchat] bye: bindings shrank from {} to {}",
            before,
            after
        );

        if after == 0 {
            if let Ok(mut bc) = state.bound_client.lock() {
                *bc = None;
            }
        }
    }

    Ok(())
}

async fn handle_text(msg: &TextMsg, state: Arc<ServerState>) -> Result<String, String> {
    verify_user_token(&msg.user_token, &state)?;
    touch_active(&msg.user_token, &state);
    ingest_text(&msg.client_message_id, &msg.text, msg.submit, &state)
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
    if bindings
        .iter()
        .any(|b| constant_time_eq(&b.user_token_hash, &h))
    {
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

fn ingest_text(
    client_message_id: &str,
    text: &str,
    submit: bool,
    state: &ServerState,
) -> Result<String, String> {
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
    // submit=true → no_auto_submit=false → worker 按 submit_config 配置的组合键提交
    // submit=false → no_auto_submit=true  → 仅注入文本，提交由手机端另行决定
    state.injector.enqueue(QueuedMessage {
        id: composite.clone(),
        channel: ChannelId::WebChat,
        source_message_id: source_id,
        text: text.to_string(),
        image_path: None,
        image_mime: None,
        key: None,
        no_auto_submit: !submit,
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
    state.injector.enqueue(QueuedMessage {
        id: composite.clone(),
        channel: ChannelId::WebChat,
        source_message_id: source_id,
        text: String::new(),
        image_path: Some(rel_path),
        image_mime: Some(mime.to_string()),
        key: None,
        // WebChat 由手机端选择是否发 Enter，不走桌面端「自动提交」
        no_auto_submit: true,
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

    state.injector.enqueue(QueuedMessage {
        id: composite.clone(),
        channel: ChannelId::WebChat,
        source_message_id: source_id,
        text: String::new(),
        image_path: None,
        image_mime: None,
        key: Some(code.to_string()),
        no_auto_submit: true, // key 事件走独立分支，此字段不生效但保持一致
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

pub(crate) fn generate_session_id() -> String {
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
