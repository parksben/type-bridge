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

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex as SyncMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::get;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use socketioxide::extract::{AckSender, Data, SocketRef, State};
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
const SESSION_TTL_SECS: u64 = 5 * 60; // 未握手前 5 分钟
const MAX_OTP_ATTEMPTS: u8 = 5;

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
    pub otp_plain: String,
    pub expires_at_unix_ms: i64,
}

impl WebChatServer {
    /// 启动一个新 server。
    /// `spa_dir` 指向 webchat-local 的构建产物目录（含 index.html），由外部 resolve
    /// tauri resource 后传进来。若目录不存在，server 也能起来，但静态资源路由会 404。
    pub async fn start(ctx: Arc<AppContext>, spa_dir: PathBuf) -> Result<Self, String> {
        let lan_ip = crate::webchat_net::primary_lan_ip()
            .ok_or_else(|| "未检测到可用的局域网 IP（请先连接 WiFi 或以太网）".to_string())?;
        let wifi_name = crate::webchat_net::current_wifi_ssid();

        // 本地生成 sessionId / OTP / OTP hash
        let session_id = generate_session_id();
        let otp_plain = generate_otp();
        let otp_hash = sha256_hash(otp_plain.as_bytes());
        let expires_at_unix_ms = now_ms() + (SESSION_TTL_SECS as i64) * 1000;

        let state = Arc::new(ServerState {
            session_id: session_id.clone(),
            otp_hash,
            otp_attempts: AtomicU8::new(0),
            otp_locked: AtomicBool::new(false),
            bindings: SyncMutex::new(Vec::new()),
            injector: ctx.injector.clone(),
            history: ctx.history.clone(),
            expires_at_unix_ms,
        });

        // 构建 Socket.IO layer
        let (io_layer, io) = SocketIo::builder()
            .with_state(state.clone())
            .build_layer();
        io.ns("/", on_connect);

        // 静态资源：用 tower-http ServeDir 提供 webchat-local/dist/ 下所有文件；
        // SPA 路由 fallback 到 index.html，让前端 React Router（如有）自行处理
        let index_path = spa_dir.join("index.html");
        let serve_dir = ServeDir::new(&spa_dir)
            .append_index_html_on_directories(true)
            .fallback(ServeFile::new(&index_path));

        // 如果 SPA 目录不存在（dev 未构建前端等），给一个占位 fallback，避免
        // server 完全没响应
        let router = axum::Router::new()
            .route("/healthz", get(healthz))
            .route("/__placeholder", get(serve_placeholder))
            .layer(io_layer)
            .layer(tower_http::cors::CorsLayer::very_permissive())
            .fallback_service(serve_dir);

        // 端口递增 fallback
        let (listener, port) = bind_with_fallback(lan_ip).await?;
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

        Ok(Self {
            state,
            cancel,
            handle: SyncMutex::new(Some(handle)),
            port,
            lan_ip,
            wifi_name,
            session_id,
            otp_plain,
            expires_at_unix_ms,
        })
    }

    /// 优雅关闭。返回后 server task 已经结束。
    pub async fn stop(&self) {
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

    /// 完整 QR 码 URL。
    pub fn qr_url(&self) -> String {
        format!("http://{}:{}/?s={}", self.lan_ip, self.port, self.session_id)
    }

    /// 会话是否锁定（OTP 5 次错）。
    pub fn is_locked(&self) -> bool {
        self.state.otp_locked.load(Ordering::SeqCst)
    }
}

// ──────────────────────────────────────────────────────────────
// 内部共享状态
// ──────────────────────────────────────────────────────────────

struct ServerState {
    #[allow(dead_code)] // 后续 ack 回流 / 多 server 识别时会用到
    session_id: String,
    otp_hash: [u8; 32],
    otp_attempts: AtomicU8,
    otp_locked: AtomicBool,
    bindings: SyncMutex<Vec<Binding>>,
    injector: Arc<crate::queue::Injector>,
    history: Arc<crate::history::HistoryStore>,
    expires_at_unix_ms: i64,
}

#[derive(Clone, Debug)]
struct Binding {
    user_token_hash: [u8; 32],
    client_id: String,
    bound_at_ms: i64,
    ua: String,
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
            let result = handle_hello(&socket, &msg, state).await;
            match result {
                Ok(user_token) => {
                    let _ = ack.send(&HelloAck::Ok {
                        ok: true,
                        user_token,
                        session_id: socket.ns().to_string(),
                    });
                }
                Err(reason) => {
                    let _ = ack.send(&HelloAck::Err { ok: false, reason });
                }
            }
        },
    );

    // text：入 FIFO 队列，立即 ack success；真实注入结果由 typebridge://message-status 事件回流（P2b-2 阶段再补）
    socket.on(
        "text",
        |_socket: SocketRef, Data::<TextMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            let result = handle_text(&msg, state).await;
            let _ = ack.send(&to_generic_ack(result));
        },
    );

    // image
    socket.on(
        "image",
        |_socket: SocketRef, Data::<ImageMsg>(msg), ack: AckSender, State(state): State<Arc<ServerState>>| async move {
            let result = handle_image(&msg, state).await;
            let _ = ack.send(&to_generic_ack(result));
        },
    );

    socket.on_disconnect(|socket: SocketRef| async move {
        tracing::info!("[webchat] client disconnected: sid={}", socket.id);
    });
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

async fn handle_hello(
    _socket: &SocketRef,
    msg: &HelloMsg,
    state: Arc<ServerState>,
) -> Result<String, &'static str> {
    if state.otp_locked.load(Ordering::SeqCst) {
        return Err("OTP_LOCKED");
    }
    if now_ms() > state.expires_at_unix_ms {
        return Err("SESSION_EXPIRED");
    }

    // 用 constant-time 对比哈希避免 timing attack
    let submitted_hash = sha256_hash(msg.otp.as_bytes());
    if !constant_time_eq(&submitted_hash, &state.otp_hash) {
        let attempts = state.otp_attempts.fetch_add(1, Ordering::SeqCst) + 1;
        if attempts >= MAX_OTP_ATTEMPTS {
            state.otp_locked.store(true, Ordering::SeqCst);
            return Err("OTP_LOCKED");
        }
        return Err("OTP_INVALID");
    }

    // 通过：签发 userToken
    let user_token = generate_token();
    let user_token_hash = sha256_hash(user_token.as_bytes());
    {
        let mut bindings = state.bindings.lock().map_err(|_| "LOCK_POISONED")?;
        // 同一 clientId 二次握手（手机刷新）→ 替换旧 binding
        if let Some(existing) = bindings.iter_mut().find(|b| b.client_id == msg.client_id) {
            existing.user_token_hash = user_token_hash;
            existing.bound_at_ms = now_ms();
            if let Some(ua) = &msg.ua {
                existing.ua = ua.clone();
            }
        } else {
            bindings.push(Binding {
                user_token_hash,
                client_id: msg.client_id.clone(),
                bound_at_ms: now_ms(),
                ua: msg.ua.clone().unwrap_or_default(),
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

async fn handle_text(msg: &TextMsg, state: Arc<ServerState>) -> Result<(), String> {
    verify_user_token(&msg.user_token, &state)?;
    ingest_text(&msg.client_message_id, &msg.text, &state)
}

async fn handle_image(msg: &ImageMsg, state: Arc<ServerState>) -> Result<(), String> {
    verify_user_token(&msg.user_token, &state)?;
    ingest_image(&msg.client_message_id, &msg.data, &msg.mime, &state)
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

fn ingest_text(client_message_id: &str, text: &str, state: &ServerState) -> Result<(), String> {
    // client_message_id 当前未用于 ack 回流（P2b-2 阶段再补），仅留作调试日志
    let _ = client_message_id;
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
            id: composite,
            channel: ChannelId::WebChat,
            source_message_id: source_id,
            text: text.to_string(),
            image_path: None,
            image_mime: None,
        })?;

    Ok(())
}

fn ingest_image(
    client_message_id: &str,
    base64_data: &str,
    mime: &str,
    state: &ServerState,
) -> Result<(), String> {
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
            id: composite,
            channel: ChannelId::WebChat,
            source_message_id: source_id,
            text: String::new(),
            image_path: Some(rel_path),
            image_mime: Some(mime.to_string()),
        })?;

    Ok(())
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
