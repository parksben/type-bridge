# §三十五 WebChat 渠道（本地局域网 + Socket.IO）

> **模块归属**：WebChat v2 重构，本机 HTTP + Socket.IO server，同 WiFi 手机直连

---

## 三十五、WebChat 渠道（本地局域网 + Socket.IO）

> **v2 重构**：原方案（Netlify 中继 + HTTP 轮询 + 前端 WASM Whisper）在国内网络下下载慢、并发硬顶，v2 彻底简化为"**桌面 App 内嵌本地 HTTP + Socket.IO server，同 WiFi 手机直连**"。不依赖任何云端服务。

### 35.1 总体架构

```
┌─────────────────────────────┐                ┌──────────────────────────┐
│ 桌面 App (Tauri Rust)       │                │ 手机浏览器（同 WiFi）   │
│                             │                │                          │
│ WebChatConnectionTab        │                │  扫 QR                   │
│   点"启动会话"              │                │  http://192.168.1.5:8723 │
│     ▼                       │                │          ▼                │
│  WebChatBridge              │                │  SPA (Vite/React)        │
│   ├─ webchat_server.rs      │                │   ├─ UA 检测（PC 拦截）  │
│   │   axum + socketioxide   │◄──socket.io───►│   ├─ OTP 握手            │
│   │   绑 0.0.0.0:8723       │    over HTTP   │   ├─ 聊天界面（文/图）   │
│   ├─ webchat_net.rs         │                │   └─ 控制键面板（↑↓←→ 等）│
│   │   LAN IP + WiFi SSID    │                └──────────────────────────┘
│   └─ 静态资源（SPA dist）   │
│     (Tauri resources)       │
│                             │
│ → injector queue (已有)     │
│   → 注入到焦点输入框        │
└─────────────────────────────┘
```

**关键不同点 vs. v1**：
- ❌ Netlify 中继 / Blobs 存储 / 9 个 HTTP endpoint → ✅ 本机 server 单域 `/socket.io` + 静态资源
- ❌ 桌面长轮询 `/api/pull` → ✅ Socket.IO 推送
- ❌ `getUserMedia` + WASM Whisper → ✅ 引导用户用手机输入法麦克风
- ❌ 自签证书 HTTPS → ✅ 明文 HTTP（局域网内部，服务仅本机可达）
- ❌ IM 内置浏览器拦截 → ✅ 除 PC 外全放行

### 35.2 Socket.IO 事件协议

**命名空间**：`/webchat`

**客户端 → 服务端**（`socket.emit`）：

| event | payload | ack |
|---|---|---|
| `hello` | `{otp, clientId}` | `{ok:true,userToken,wifiName}` 或 `{ok:false,reason}` |
| `text` | `{clientMessageId, text}` | `{success, reason?}`（注入完成回调） |
| `image` | `{clientMessageId, data:base64, mime}` | `{success, reason?}` |
| `key` | `{clientMessageId, code}` | `{success, reason?}` 控制键事件，详见 §35.11 |

**服务端 → 客户端**（`socket.emit`）：

| event | payload |
|---|---|
| `session_closed` | `{reason:"server_stopped"\|"session_expired"\|"kicked"}` |

**好处 vs. 原生 WebSocket**：
- 重连：`io.connect({reconnection: true})` 内置指数退避
- 心跳：Socket.IO 内建 `pingInterval / pingTimeout`
- ack：`socket.emit(event, data, ackCb)` 自带 RPC 语义，替代自定义 clientMessageId 追踪
- 多设备：服务端 `io.to("session_xxx").emit(...)` 房间机制 broadcast

### 35.3 内存模型（Rust 侧）

**Session**（单会话单 instance；启动会话即创建，停止即销毁）：

```rust
struct WebChatSession {
    session_id: String,           // ses_<random>
    otp_hash: [u8; 32],           // sha256(otp)
    otp_plain: String,            // 仅在内存，UI 展示用
    otp_attempts: u8,             // 0..5
    otp_locked: bool,
    created_at: Instant,
    expires_at: Instant,          // created + 5min（未握手前）
    bindings: HashMap<String, ClientBinding>, // clientId -> 绑定信息
}

struct ClientBinding {
    user_token_hash: [u8; 32],
    bound_at: Instant,
    ua: String,                   // 简化展示用
    socket_id: Option<String>,    // socketioxide 的 SocketRef
}
```

**不持久化**：进程退出全部消失。

### 35.4 桌面端 webchat.rs + webchat_server.rs

**生命周期管理**：
- 启动："启动会话" command → `WebChatServer::start`
- 停止："停止会话" command → `stop()` + drop session
- 应用退出：`tauri::Builder.on_window_event(CloseRequested)` → 调 `stop()`
- Drop：`impl Drop for WebChatServer` 调 `cancel.cancel()`（同步，tokio task 会在后台清理）
- 端口冲突：8723→8732 递增尝试；全占报错给 UI

**OTP 轮换语义（vs. server 重启）**：

把"轮换 OTP"和"重启 server"拆成两个独立操作：

| 操作 | 改动 | 保留 |
|---|---|---|
| `rotate_otp` | 新 `otp_plain` / `otp_hash` / `expires_at_unix_ms` + 重置 `otp_attempts` / `otp_locked` | `session_id`、`bindings`、`port`、`lan_ip`、server task 本身 |
| `stop_webchat` | 整个 server drop，所有 bindings 清空，`pending_acks` 全部以 failure 回调 | 无 |

`session_id` 是绑在 QR URL 里（`/?s=ses_XXX`）的，轮换 OTP 时**不变**，所以手机扫到的 QR 不会失效，只需输入新 OTP 即可。

实现上把 OTP 相关字段合并进一个 `Mutex<OtpState>`，`rotate_otp()` 一把锁全量替换：

```rust
struct OtpState {
    plain: String,
    hash: [u8; 32],
    expires_at_ms: i64,
    attempts: u8,
    locked: bool,
}

impl WebChatServer {
    pub fn rotate_otp(&self) {
        let plain = generate_otp();
        let hash = sha256_hash(plain.as_bytes());
        let expires_at_ms = now_ms() + SESSION_TTL_SECS as i64 * 1000;
        let mut g = self.state.otp.lock().unwrap();
        *g = OtpState { plain, hash, expires_at_ms, attempts: 0, locked: false };
    }
}
```

UI 触发：前端 `WebChatConnectionTab` 用 setInterval 维持 1Hz 倒计时，`remainingSecs === 0` 时自动 `invoke("webchat_rotate_otp")`，Tauri command 调 `rotate_otp()` + emit `typebridge://webchat-session-update` 刷新 snapshot，前端拿到新 OTP + 新 expires_at，进度条回满。

**axum router 关键顺序**：

```rust
// ⚠️ axum 0.7 坑：`.layer()` 只作用于调用它之前已注册的 routes/fallback。
// 所以 `fallback_service` 必须在 `.layer(io_layer)` 之前挂上，否则
// `/socket.io/*` 会落到 fallback（ServeDir）被 404 吃掉，socketioxide
// 永远看不到握手请求，手机端表现为「握手超时」。
let app = axum::Router::new()
    .fallback_service(serve_dir)   // 先挂 fallback
    .layer(io_layer);              // 再挂 layer，此时会包住 fallback
```

**ack 回流**：queue worker 注入完成后 emit 全局 `typebridge://message-status` 事件，webchat_server 订阅该事件根据 clientMessageId 找到对应 `AckSender` 回调给手机。

### 35.5 webchat_net.rs（LAN IP + WiFi SSID）

```rust
pub fn primary_lan_ip() -> Result<IpAddr> {
    // local-ip-address crate
    // 优先 WiFi 网卡（en0 on macOS），跳过 VPN / 回环
    let ifaces = local_ip_address::list_afinet_netifas()?;
    for (name, ip) in ifaces {
        if is_wifi_interface(&name) && ip.is_ipv4() && !ip.is_loopback() {
            return Ok(ip);
        }
    }
    // Fallback：任意非回环 IPv4
    local_ip_address::local_ip()
}

pub fn current_wifi_ssid() -> Result<String> {
    // macOS: 调 CoreWLAN FFI（objc2）
    //   CWWiFiClient.shared().interface().ssid()
    // 失败则 None，UI 展示 "未知 WiFi"
    #[cfg(target_os = "macos")]
    { core_wlan_ffi::current_ssid() }
}
```

### 35.6 前端工程（webchat-local/）

```
webchat-local/
├── package.json              # vite + react + ts + tailwind + socket.io-client
├── vite.config.ts
├── src/
│   ├── App.tsx               # 状态机路由
│   ├── lib/
│   │   ├── ua.ts             # PC / mobile 检测
│   │   └── socket.ts         # socket.io-client 封装
│   ├── components/
│   │   ├── PCBlockView.tsx   # PC 拦截页
│   │   ├── HandshakeForm.tsx # 6 位 OTP 输入
│   │   ├── ChatPage.tsx      # 移动端聊天页
│   │   ├── MessageBubble.tsx
│   │   ├── ComposerBar.tsx
│   │   ├── ImagePicker.tsx
│   │   └── ShortcutKeysPanel.tsx  # 控制键面板
│   └── styles/
│       └── globals.css
```

**状态机**：
```
loading → 读 URL ?s=<sessionId> 并 UA 检查
  ├─ PC UA           → PCBlockView
  └─ Mobile UA       → Handshake
                        └─ OTP 正确 → Chat
                        └─ OTP 错 5 次 → ErrorScreen("locked")
                        └─ 桌面断开 → ErrorScreen("disconnected")
```

**语音入口已下线**：早期版本曾在输入栏内放 `VoiceButton`，点击弹 `VoiceHintModal` 引导用户用输入法麦克风。该按钮 + 弹层均已**整体移除**——它本身不做任何事，只起"教用户去点系统键盘麦克风"的作用，但反而让 WebChat 看起来像有语音功能、点了又什么都没发生，造成误解。原 VoiceButton 在 ComposerBar 中占据的位置改放"控制键面板展开/收起"切换按钮（详见 §35.11.4）。

### 35.7 Tauri 集成

**tauri.conf.json**：
```json
{
  "build": {
    "beforeBuildCommand": "cd webchat-local && npm run build && cd .. && npm run build"
  },
  "bundle": {
    "resources": ["resources/webchat-local/**/*"]
  }
}
```

本地 dev (`npm run tauri dev`) 通过根 `package.json` 的 `dev` 脚本用 `concurrently` 同时拉起：
1. **桌面前端 Vite**（端口 1420）—— Tauri 主窗口
2. **WebChat SPA Vite**（端口 5173，host `0.0.0.0`，LAN 可达）—— 同 WiFi 手机能直连

dev 模式下 `webchat_server.rs` 的 fallback 行为切换为 **302 重定向到 5173**，让手机端通过 Vite dev server 加载页面，HMR 原生工作。

**dev 链路（`cfg!(debug_assertions)` 分支）**：
```
手机扫 QR  →  http://<lan_ip>:8723/?s=<sid>
                    │
                    ▼  Rust dev fallback handler
        302 Location: http://<lan_ip>:5173/?s=<sid>&apiPort=8723
                    │
                    ▼
手机加载 5173 (Vite) → HMR 走 5173 (ws://lan:5173)
SPA 内 socket.io-client 看到 ?apiPort=8723 → 显式连 8723
```

为什么不做完整反向代理：完整代理需要 Rust 侧 reqwest + tokio-tungstenite 处理 HTTP+WS 双向转发，~150 行；302 redirect 仅 ~10 行实现等价收益，唯一差异是浏览器地址栏从 `8723` 跳到 `5173`，dev 自用无影响。

**前端识别 dev 链路**：[App.tsx](../../webchat-local/src/App.tsx) 启动时读 `URLSearchParams` 的 `apiPort`：
- 命中 → `WebChatClient({ url: "http://" + window.location.hostname + ":" + apiPort })`
- 缺失（生产）→ `WebChatClient({})` 同源连接

### 35.8 安全模型

- OTP 只在桌面内存（明文 + hash）；进程退出即消失
- ownerToken 概念删除（不再有 owner/user 对等关系，桌面直接持 session 状态）
- userToken 每次握手独立签发（32 字节 base64url），仅通过 Socket.IO ack 传回给对应设备；中间人无法劫持（局域网 ARP 攻击除外，视作可接受风险）
- server 绑 LAN IP 不绑 0.0.0.0：`bind(lan_ip)` 更安全；如果用户切换 WiFi 则 server 失效需要重启

### 35.9 已解决的历史痛点

| 痛点 | v1 方案 | v2 方案 |
|---|---|---|
| 模型下载慢（国内到 Netlify） | 迁移 Netlify 加速、CDN 自托管 | **不下载，前端完全无 ASR 代码** |
| Netlify Function 并发硬顶 30-60 | 无解，只能升级 Pro | **不限并发，本机 tokio 直接接** |
| Web Speech API 国产 Android 不可用 | WASM Whisper 替代 | **放弃浏览器 ASR，用输入法** |
| q8 模型和 onnxruntime-web 不兼容 | 切 int8 | **不再使用 ONNX 模型** |
| 下载失败无自动重试 | 指数退避重试逻辑 | **不再下载** |
| 进度条抖动 + 99% 失败 | 固定分母 + monotonic | **不再下载** |

### 35.9.1 v2 踩过的坑：axum layer 顺序陷阱

**现象**：手机扫码后输入 OTP，前端报「握手超时，请检查 WiFi」。桌面端日志显示 server 启动正常、LAN IP 正确，但**整个会话周期 0 条「client connected: sid=...」** — socketioxide 从未收到过任何连接请求。

**根因**：`.layer(X)` 只作用于**它被调用时已经注册的**路由 / fallback。当代码写成

```rust
Router::new()
    .route("/healthz", ...)
    .layer(io_layer)               // ← 此时 fallback 还没挂
    .fallback_service(serve_dir);  // ← fallback 不被 layer 包住
```

时，`/socket.io/?EIO=4&transport=polling` 这类请求不匹配任何显式路由，直接落到 fallback（ServeDir）被 404 吃掉，`io_layer` 根本没机会拦截。

**修复**：把 `fallback_service` 挪到 `.layer()` 之前调用即可。

```rust
Router::new()
    .route("/healthz", ...)
    .fallback_service(serve_dir)   // 先挂 fallback
    .layer(io_layer)                // layer 包住 routes + fallback
    .layer(cors);
```

### 35.10 v2 主动放弃的能力

- **WebChat 网页里没有一键录音按钮**：无语音识别能力，引导用户用手机输入法自带麦克风
- **无法跨 WiFi 使用**：手机必须和电脑同 WiFi；跨网段场景请用飞书/钉钉/企微渠道
- **不支持 WAN 接入**：需要公网穿透 / IPv6 / Tailscale 等基础设施，v2 不提供

### 35.11 控制键事件（手机端快捷按键 → 桌面键盘事件）

WebChat 移动端的"控制键面板"发送的不是文本，而是离散按键事件（Enter / Backspace / Space / Arrow\*）。设计目标是：让事件**严格按用户点击的先后顺序**与文本/图片消息一起串行注入到桌面焦点输入框，避免回车插在粘贴中间提前提交。

#### 35.11.1 协议（Socket.IO 增量）

新增客户端 → 服务端事件：

| event | payload | ack |
|---|---|---|
| `key` | `{userToken, clientMessageId, code}` | `{success, reason?}`（注入完成回调，与 text/image 一致） |

`code` 是 W3C `KeyboardEvent.code` 字符串，**取值受 server 白名单约束**（见 35.11.3）。

#### 35.11.2 队列模型扩展（Rust 侧）

`QueuedMessage` 新增可选字段 `key: Option<String>`（KeyboardEvent.code）。三种载荷互斥：

- `key.is_some()` → worker 跳过剪贴板/粘贴流程，直接调 `injector::simulate_submit(SubmitKey { key: code, ..no_modifiers })`
- 否则按既有 `text` / `image_path` 分支走粘贴流程

worker 命中 key 分支时：
- **不发** reaction / streaming_reply / success_text_reply（按键事件没有 IM 来源消息可反馈）
- **不写** HistoryMessage（按键事件不应污染历史消息列表）
- 仍走 `cancelled` 集合判断 + 状态事件 `processing → sent/failed`，让 webchat_server 的 `pending_acks` 能在注入完成时回 ack 给手机

注入完成后**不**再触发 SubmitKey 的"自动提交"——这是用户主动按下的按键，本身就是提交意图，再叠加一次会导致双触发。

#### 35.11.3 安全：按键白名单

`webchat_server.rs` 的 `handle_key` 在 enqueue 前必须检查 `code` 是否在常量白名单内：

```rust
const ALLOWED_KEY_CODES: &[&str] = &[
    "Enter", "Backspace", "Space",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
];
```

不在白名单的 code 立即 ack `{success:false, reason:"unsupported key"}`，**绝不入队**。理由：手机端 SPA 是静态资源，理论上可能被改造成发送任意 code（包括 `KeyA` / `Cmd+...`），白名单是 server 侧的最后防线，避免 WebChat 变成"远程任意按键执行"通道。后续若要扩展按键集合（Tab、Esc 等），在此常量加入即可。

#### 35.11.4 前端组件（webchat-local）

新增 `components/ShortcutKeysPanel.tsx`：

- 单行水平排列 7 个按钮，**从左到右顺序固定为**：ArrowUp / ArrowDown / ArrowLeft / ArrowRight / Space / Enter / Backspace（删除键置最右）
- 全部用 `lucide-react` 图标（ArrowUp/Down/Left/Right / Space / CornerDownLeft / Delete）
- 接收 `onPress(code)` 回调；点击调用 `WebChatClient.sendKey(clientMessageId, code)`，不在本地 chat 列表显示气泡
- 失败时顶部短暂浮一行 toast 文案，复用现有 `imageError` 通道

`ComposerBar.tsx` 的"展开/收起"切换按钮**内嵌在输入栏右侧、原 VoiceButton 的位置**。按钮使用 lucide `Keyboard` 图标；激活态（面板展开）按钮整体填充 `--tb-accent` + 白色图标，未激活态使用普通 `--tb-bg` + `--tb-muted` 图标色。状态存 `localStorage["typebridge.shortcuts.expanded"]`，默认 `false`。

`WebChatClient.sendKey(clientMessageId, code)` 与 `sendText` / `sendImage` 同模式：emit + ack 超时 10s。
