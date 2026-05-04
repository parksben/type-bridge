// WebChat 渠道：桌面端通过 HTTP 轮询与官方中继通信，二维码 + OTP + 移动端浏览器
// 实现"扫码即用"的输入桥。详见 TECH_DESIGN §三十五 / REQUIREMENTS §2.10。
//
// 与飞书 / 钉钉 / 企微的差异：
//   1. 不走 Go sidecar 进程；本模块在 Rust 内用 reqwest 直接和中继通信
//   2. OTP 在桌面侧本地校验，明文不出桌面（中继只存 sha256 哈希）
//   3. 反馈走独立的 /api/ack endpoint（监听 typebridge://message-status 事件）
//
// 状态机：
//   Idle → Pending（已注册，等手机扫码）→ Bound（已握手，开始 pull）
//                  ↓ 5 分钟未握手               ↓ 24 小时 / 用户主动停止
//                  Expired                       Idle

use crate::channel::{parse_composite_id, ChannelId};
use crate::queue::ingest_message;
use crate::sidecar::AppContext;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

const DEFAULT_RELAY_URL: &str = "https://webchat-typebridge.parksben.xyz";
// Heartbeat 搭车到 pull：/api/pull 服务端在处理时会自动更新 ownerLastSeenAt，
// 所以只要 pull 持续执行就不需要额外心跳。这里保留常量作为"pull 长时间
// 未成功时"的兜底窗口说明，不再被主循环使用。
const _HEARTBEAT_GRACE_SECS: u64 = 30;
const PULL_INTERVAL_MS: u64 = 1000;
// 空闲阈值从 3s 放大到 10s：idle 会话占用的 Function-time 降 3 倍，
// 免费档并发承载量显著提升。10s < 中继 owner GC 阈值 45s，不会误伤。
const PULL_IDLE_INTERVAL_MS: u64 = 10000;
const HTTP_TIMEOUT_SECS: u64 = 30;
const HTTP_LONG_POLL_TIMEOUT_SECS: u64 = 15;

// ──────────────────────────────────────────────────────────────
// 状态 + 快照
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WebChatPhase {
    Idle,
    Pending,        // 已注册，等手机扫码 + OTP
    Bound,          // 已握手，进入消息泵
    Expired,        // session 过期
    Locked,         // OTP 5 次错误锁定
    AlreadyBound,   // 第二台设备扫码冲突
    Error,          // 其他不可恢复错误
}

#[derive(Debug, Clone, Serialize)]
pub struct WebChatSnapshot {
    pub phase: WebChatPhase,
    pub session_id: Option<String>,
    pub otp: Option<String>,
    pub expires_at: Option<i64>,
    pub bound_device_ua: Option<String>,
    pub bound_at: Option<i64>,
    pub error: Option<String>,
    pub relay_url: String,
    pub qr_url: Option<String>,
}

#[derive(Debug, Clone)]
struct InternalState {
    phase: WebChatPhase,
    session_id: Option<String>,
    owner_token: Option<String>,
    user_token_signed: bool,
    otp: Option<String>,
    expires_at: Option<i64>,
    bound_device_ua: Option<String>,
    bound_at: Option<i64>,
    error: Option<String>,
}

impl Default for InternalState {
    fn default() -> Self {
        Self {
            phase: WebChatPhase::Idle,
            session_id: None,
            owner_token: None,
            user_token_signed: false,
            otp: None,
            expires_at: None,
            bound_device_ua: None,
            bound_at: None,
            error: None,
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Bridge 主体
// ──────────────────────────────────────────────────────────────

pub struct WebChatBridge {
    state: Arc<Mutex<InternalState>>,
    cancel: Arc<Mutex<Option<CancellationToken>>>,
    task: Arc<Mutex<Option<JoinHandle<()>>>>,
    relay_url: Arc<Mutex<String>>,
    http: reqwest::Client,
}

impl Default for WebChatBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl WebChatBridge {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .user_agent(format!("TypeBridge-Desktop/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("build reqwest client");
        Self {
            state: Arc::new(Mutex::new(InternalState::default())),
            cancel: Arc::new(Mutex::new(None)),
            task: Arc::new(Mutex::new(None)),
            relay_url: Arc::new(Mutex::new(DEFAULT_RELAY_URL.to_string())),
            http,
        }
    }

    pub fn set_relay_url(&self, url: String) {
        let trimmed = url.trim().trim_end_matches('/').to_string();
        let mut g = self.relay_url.lock().unwrap();
        *g = if trimmed.is_empty() {
            DEFAULT_RELAY_URL.to_string()
        } else {
            trimmed
        };
    }

    pub fn relay_url(&self) -> String {
        self.relay_url.lock().unwrap().clone()
    }

    pub fn is_connected(&self) -> bool {
        matches!(self.state.lock().unwrap().phase, WebChatPhase::Bound)
    }

    pub fn snapshot(&self) -> WebChatSnapshot {
        let s = self.state.lock().unwrap().clone();
        let relay_url = self.relay_url();
        let qr_url = s
            .session_id
            .as_ref()
            .map(|sid| format!("{}/?s={}", relay_url, sid));
        WebChatSnapshot {
            phase: s.phase,
            session_id: s.session_id,
            otp: s.otp,
            expires_at: s.expires_at,
            bound_device_ua: s.bound_device_ua,
            bound_at: s.bound_at,
            error: s.error,
            relay_url,
            qr_url,
        }
    }

    fn set_state<F: FnOnce(&mut InternalState)>(&self, f: F) {
        let mut g = self.state.lock().unwrap();
        f(&mut g);
    }

    /// 启动一次新会话。会先停掉旧会话（如有）。
    pub async fn start<R: Runtime>(self: &Arc<Self>, app: AppHandle<R>) -> Result<(), String> {
        // 1. 先停掉旧会话
        self.stop().await;

        // 2. 本地生成 sessionId（中继签发） / OTP；OTP 哈希后发给中继（明文不出本机）
        let otp = generate_otp();
        let otp_hash = sha256_hex(otp.as_bytes());

        // 3. 注册
        let relay = self.relay_url();
        let resp: ApiResp<RegisterResp> = self
            .http
            .post(format!("{}/api/register", relay))
            .json(&serde_json::json!({
                "otpHash": otp_hash,
            }))
            .send()
            .await
            .map_err(|e| format!("register failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("register parse failed: {}", e))?;

        let data = resp.into_data().map_err(|e| format!("register: {}", e))?;

        self.set_state(|s| {
            s.phase = WebChatPhase::Pending;
            s.session_id = Some(data.session_id.clone());
            s.owner_token = Some(data.owner_token.clone());
            s.otp = Some(otp.clone());
            s.expires_at = Some(data.expires_at);
            s.bound_device_ua = None;
            s.bound_at = None;
            s.error = None;
            s.user_token_signed = false;
        });

        emit_session_update(&app, &self.snapshot());

        // 4. spawn 主任务
        let cancel = CancellationToken::new();
        *self.cancel.lock().unwrap() = Some(cancel.clone());

        let bridge = Arc::clone(self);
        let app_clone = app.clone();
        let task = tokio::spawn(async move {
            bridge.main_loop(app_clone, cancel).await;
        });
        *self.task.lock().unwrap() = Some(task);

        Ok(())
    }

    pub async fn stop(&self) {
        // 取消任务
        if let Some(c) = self.cancel.lock().unwrap().take() {
            c.cancel();
        }
        if let Some(t) = self.task.lock().unwrap().take() {
            // 不 await：避免重入死锁；JoinHandle drop 后任务自然终止
            t.abort();
        }
        self.set_state(|s| *s = InternalState::default());
    }

    /// 主循环：先 long-poll handshake，握手通过后进入 pull/heartbeat 循环。
    async fn main_loop<R: Runtime>(
        self: Arc<Self>,
        app: AppHandle<R>,
        cancel: CancellationToken,
    ) {
        // 阶段 1：等握手
        let handshake_outcome = tokio::select! {
            _ = cancel.cancelled() => return,
            r = self.handshake_phase(&app, &cancel) => r,
        };
        match handshake_outcome {
            Ok(()) => {}
            Err(reason) => {
                self.transition_to_error(&app, reason);
                return;
            }
        }

        // 阶段 2：消息泵
        tokio::select! {
            _ = cancel.cancelled() => {}
            _ = self.message_pump_phase(&app, &cancel) => {}
        }
    }

    async fn handshake_phase<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        cancel: &CancellationToken,
    ) -> Result<(), String> {
        loop {
            // 检查 session 是否已过期
            let now = now_ms();
            let exp = self.state.lock().unwrap().expires_at.unwrap_or(0);
            if exp > 0 && now > exp {
                return Err("EXPIRED".to_string());
            }

            // long-poll handshake
            let (sid, owner_token) = {
                let g = self.state.lock().unwrap();
                (
                    g.session_id.clone().ok_or("no session id")?,
                    g.owner_token.clone().ok_or("no owner token")?,
                )
            };
            let url = format!("{}/api/poll-handshake?sessionId={}", self.relay_url(), urlencode(&sid));

            let req = self
                .http
                .get(&url)
                .timeout(Duration::from_secs(HTTP_LONG_POLL_TIMEOUT_SECS))
                .bearer_auth(&owner_token)
                .send();

            let resp = tokio::select! {
                _ = cancel.cancelled() => return Err("cancelled".into()),
                r = req => r,
            };

            let resp = match resp {
                Ok(r) => r,
                Err(e) => {
                    tracing::warn!("[webchat] poll-handshake error: {}, retrying", e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            let status = resp.status();
            if status == reqwest::StatusCode::NO_CONTENT {
                continue; // 立即重 poll
            }
            if status == reqwest::StatusCode::GONE {
                return Err("EXPIRED".into());
            }
            if !status.is_success() {
                tracing::warn!("[webchat] poll-handshake bad status: {}", status);
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }

            let api: ApiResp<PollHandshakeResp> = match resp.json().await {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!("[webchat] poll-handshake parse: {}", e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };
            let data = match api.into_data() {
                Ok(d) => d,
                Err(code) if code == "EXPIRED" || code == "OWNER_LOST" => return Err("EXPIRED".into()),
                Err(e) => {
                    tracing::warn!("[webchat] poll-handshake api error: {}", e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            // 拿到 OTP，本地校验
            let local_otp = self.state.lock().unwrap().otp.clone();
            let accepted = match local_otp {
                Some(o) => o == data.otp,
                None => false,
            };

            // 回写裁决
            let new_user_token = generate_token();
            let body = if accepted {
                serde_json::json!({
                    "sessionId": sid,
                    "handshakeId": data.handshake_id,
                    "accepted": true,
                    "userToken": new_user_token,
                })
            } else {
                serde_json::json!({
                    "sessionId": sid,
                    "handshakeId": data.handshake_id,
                    "accepted": false,
                    "reason": "INVALID_OTP",
                })
            };

            let r = self
                .http
                .post(format!("{}/api/handshake-result", self.relay_url()))
                .bearer_auth(&owner_token)
                .json(&body)
                .send()
                .await;
            if let Err(e) = r {
                tracing::warn!("[webchat] handshake-result post error: {}", e);
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }

            if accepted {
                let bound_at = now_ms();
                self.set_state(|s| {
                    s.phase = WebChatPhase::Bound;
                    s.bound_device_ua = Some(data.device_ua);
                    s.bound_at = Some(bound_at);
                    s.user_token_signed = true;
                });
                emit_session_update(app, &self.snapshot());
                let _ = app.emit(
                    "typebridge://status",
                    serde_json::json!({
                        "channel": ChannelId::WebChat,
                        "connected": true,
                    }),
                );
                return Ok(());
            }
            // 不通过：5 次错则中继自动锁；这里只更新 UI，不结束 phase
            // (中继会在下次 poll-handshake 返回 410 EXPIRED / 423 OTP_LOCKED)
        }
    }

    async fn message_pump_phase<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        cancel: &CancellationToken,
    ) {
        let mut idle_streak = 0u32;

        loop {
            if cancel.is_cancelled() {
                return;
            }

            // heartbeat 搭车到 pull：/api/pull 服务端会自动 touch
            // ownerLastSeenAt，桌面端无需再单独打 /api/heartbeat。
            // pull 网络错误时靠下面 sleep(2s) + continue，通常 45s 内一定恢复。
            let pulled = self.pull_once(app).await;
            match pulled {
                PullOutcome::Messages(n) if n > 0 => {
                    idle_streak = 0;
                }
                PullOutcome::Messages(_) => {
                    idle_streak = idle_streak.saturating_add(1);
                }
                PullOutcome::Expired => {
                    self.transition_to_error(app, "EXPIRED".into());
                    return;
                }
                PullOutcome::NetworkError => {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            }

            let interval = if idle_streak > 5 {
                PULL_IDLE_INTERVAL_MS
            } else {
                PULL_INTERVAL_MS
            };
            tokio::select! {
                _ = cancel.cancelled() => return,
                _ = tokio::time::sleep(Duration::from_millis(interval)) => {}
            }
        }
    }

    async fn pull_once<R: Runtime>(&self, app: &AppHandle<R>) -> PullOutcome {
        let (sid, owner_token) = {
            let g = self.state.lock().unwrap();
            match (g.session_id.clone(), g.owner_token.clone()) {
                (Some(s), Some(t)) => (s, t),
                _ => return PullOutcome::Expired,
            }
        };
        let url = format!(
            "{}/api/pull?sessionId={}&max=5",
            self.relay_url(),
            urlencode(&sid)
        );
        let resp = self.http.get(&url).bearer_auth(&owner_token).send().await;
        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("[webchat] pull error: {}", e);
                return PullOutcome::NetworkError;
            }
        };

        let status = resp.status();
        if status == reqwest::StatusCode::GONE {
            return PullOutcome::Expired;
        }
        if !status.is_success() {
            return PullOutcome::NetworkError;
        }

        let api: ApiResp<PullResp> = match resp.json().await {
            Ok(v) => v,
            Err(_) => return PullOutcome::NetworkError,
        };
        let data = match api.into_data() {
            Ok(d) => d,
            Err(c) if c == "EXPIRED" || c == "OWNER_LOST" => return PullOutcome::Expired,
            Err(_) => return PullOutcome::NetworkError,
        };

        let n = data.messages.len();
        for m in data.messages {
            self.dispatch_pulled_message(app, m);
        }
        PullOutcome::Messages(n)
    }

    fn dispatch_pulled_message<R: Runtime>(&self, app: &AppHandle<R>, m: PulledMessage) {
        let ctx: Arc<AppContext> = match app.try_state::<Arc<AppContext>>() {
            Some(s) => s.inner().clone(),
            None => return,
        };

        let sender = "WebChat 用户".to_string();
        match m.kind.as_str() {
            "text" => {
                let text = m.text.unwrap_or_default();
                let _ = app.emit(
                    "typebridge://message",
                    serde_json::json!({
                        "channel": ChannelId::WebChat,
                        "message_id": m.message_id,
                        "sender": sender,
                        "text": text,
                        "ts": m.ts,
                    }),
                );
                let bridge = ctx.bridges.get(ChannelId::WebChat);
                ingest_message(
                    app,
                    &ctx.history,
                    &ctx.injector,
                    &bridge,
                    ChannelId::WebChat,
                    m.message_id,
                    sender,
                    text,
                    None,
                    None,
                );
            }
            "image" => {
                let img = match m.image {
                    Some(i) => i,
                    None => return,
                };
                let bytes = match base64::engine::general_purpose::STANDARD.decode(&img.data) {
                    Ok(b) => b,
                    Err(e) => {
                        tracing::error!("[webchat] image base64 decode: {}", e);
                        return;
                    }
                };
                let rel = match ctx
                    .history
                    .save_image(ChannelId::WebChat, &m.message_id, &img.mime, &bytes)
                {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::error!("[webchat] save image: {}", e);
                        return;
                    }
                };
                let _ = app.emit(
                    "typebridge://image",
                    serde_json::json!({
                        "channel": ChannelId::WebChat,
                        "message_id": m.message_id,
                        "sender": sender,
                        "text": m.text.clone().unwrap_or_default(),
                        "mime": img.mime,
                    }),
                );
                let bridge = ctx.bridges.get(ChannelId::WebChat);
                ingest_message(
                    app,
                    &ctx.history,
                    &ctx.injector,
                    &bridge,
                    ChannelId::WebChat,
                    m.message_id,
                    sender,
                    m.text.unwrap_or_default(),
                    Some(rel),
                    Some(img.mime),
                );
            }
            other => {
                tracing::warn!("[webchat] unknown message kind: {}", other);
            }
        }
    }

    /// 当队列 worker emit message-status 之后，把对应的 ack 回写给中继。
    /// 由 lib.rs 在 setup 里 listen 全局事件触发。
    pub async fn ack_message(&self, source_message_id: String, success: bool, reason: Option<String>) {
        let (sid, owner_token) = {
            let g = self.state.lock().unwrap();
            match (g.session_id.clone(), g.owner_token.clone()) {
                (Some(s), Some(t)) => (s, t),
                _ => return,
            }
        };
        let body = serde_json::json!({
            "sessionId": sid,
            "messageId": source_message_id,
            "success": success,
            "reason": reason,
        });
        let r = self
            .http
            .post(format!("{}/api/ack", self.relay_url()))
            .bearer_auth(&owner_token)
            .json(&body)
            .send()
            .await;
        if let Err(e) = r {
            tracing::warn!("[webchat] ack failed: {}", e);
        }
    }

    fn transition_to_error<R: Runtime>(&self, app: &AppHandle<R>, code: String) {
        let phase = match code.as_str() {
            "EXPIRED" | "OWNER_LOST" => WebChatPhase::Expired,
            "OTP_LOCKED" => WebChatPhase::Locked,
            "ALREADY_BOUND" => WebChatPhase::AlreadyBound,
            _ => WebChatPhase::Error,
        };
        self.set_state(|s| {
            s.phase = phase.clone();
            s.error = Some(code);
        });
        let _ = app.emit(
            "typebridge://status",
            serde_json::json!({
                "channel": ChannelId::WebChat,
                "connected": false,
            }),
        );
        emit_session_update(app, &self.snapshot());
    }
}

// ──────────────────────────────────────────────────────────────
// 中继 API 响应模型
// ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiResp<T> {
    ok: bool,
    data: Option<T>,
    error: Option<ApiError>,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    code: String,
    #[allow(dead_code)]
    message: String,
}

impl<T> ApiResp<T> {
    fn into_data(self) -> Result<T, String> {
        if self.ok {
            self.data.ok_or_else(|| "missing data".to_string())
        } else {
            Err(self.error.map(|e| e.code).unwrap_or_else(|| "UNKNOWN".to_string()))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterResp {
    session_id: String,
    owner_token: String,
    expires_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PollHandshakeResp {
    handshake_id: String,
    otp: String,
    device_ua: String,
}

#[derive(Debug, Deserialize)]
struct PullResp {
    messages: Vec<PulledMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PulledMessage {
    message_id: String,
    #[allow(dead_code)]
    client_message_id: String,
    kind: String,
    text: Option<String>,
    image: Option<PulledImage>,
    ts: i64,
}

#[derive(Debug, Deserialize)]
struct PulledImage {
    data: String,
    mime: String,
}

enum PullOutcome {
    Messages(usize),
    Expired,
    NetworkError,
}

// ──────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────

fn random_bytes(len: usize) -> Vec<u8> {
    let mut v = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut v);
    v
}

fn generate_otp() -> String {
    let bytes = random_bytes(4);
    let n = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    format!("{:06}", n % 1_000_000)
}

fn generate_token() -> String {
    let bytes = random_bytes(32);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn sha256_hex(input: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(input);
    let out = h.finalize();
    let mut s = String::with_capacity(64);
    for b in out.iter() {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

fn urlencode(s: &str) -> String {
    // 仅给字母数字 + `_-.~` 透传，其它转 %XX。够 sessionId / auxCode 用。
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn emit_session_update<R: Runtime>(app: &AppHandle<R>, snap: &WebChatSnapshot) {
    let _ = app.emit("typebridge://webchat-session-update", snap);
}

// ──────────────────────────────────────────────────────────────
// Tauri 命令
// ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_webchat<R: Runtime>(app: AppHandle<R>) -> Result<WebChatSnapshot, String> {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    let bridge = ctx.webchat.clone();
    bridge.start(app.clone()).await?;
    Ok(bridge.snapshot())
}

#[tauri::command]
pub async fn stop_webchat<R: Runtime>(app: AppHandle<R>) {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.webchat.stop().await;
    let _ = app.emit(
        "typebridge://status",
        serde_json::json!({
            "channel": ChannelId::WebChat,
            "connected": false,
        }),
    );
    emit_session_update(&app, &ctx.webchat.snapshot());
}

#[tauri::command]
pub fn webchat_snapshot<R: Runtime>(app: AppHandle<R>) -> WebChatSnapshot {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.webchat.snapshot()
}

#[tauri::command]
pub fn set_webchat_relay_url<R: Runtime>(app: AppHandle<R>, url: String) {
    let ctx: Arc<AppContext> = app.state::<Arc<AppContext>>().inner().clone();
    ctx.webchat.set_relay_url(url);
}

// ──────────────────────────────────────────────────────────────
// 全局 message-status 监听 → ack
// ──────────────────────────────────────────────────────────────

/// 在 lib.rs setup 里调用一次：监听 typebridge://message-status，
/// 当 webchat 渠道的消息变成 sent / failed 时，向中继 POST /api/ack。
pub fn install_ack_listener<R: Runtime>(app: &AppHandle<R>) {
    use tauri::Listener;
    let app_handle = app.clone();
    app.listen("typebridge://message-status", move |event| {
        let payload = event.payload().to_string();
        let parsed: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(_) => return,
        };
        let id = parsed.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let status = parsed.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let reason = parsed.get("reason").and_then(|v| v.as_str()).map(String::from);

        if !id.starts_with("webchat:") {
            return;
        }
        let success = match status.as_str() {
            "sent" => true,
            "failed" => false,
            _ => return, // queued / processing 不上报
        };

        let (_chan, source_id) = parse_composite_id(&id);
        let source_id = source_id.to_string();
        let app_clone = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(ctx) = app_clone.try_state::<Arc<AppContext>>() {
                ctx.webchat.ack_message(source_id, success, reason).await;
            }
        });
    });
}
