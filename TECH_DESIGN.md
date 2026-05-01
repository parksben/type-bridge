# TypeBridge — 技术方案文档

> 记录关键技术选型决策及其依据

---

## 一、技术选型决策

### 1.1 飞书长连接实现方式

**决策：使用飞书官方 Go SDK，编译为独立二进制，作为 Tauri Sidecar 运行**

**方案说明：**
- 飞书官方提供 [lark-oapi-sdk-golang](https://github.com/larksuite/oapi-sdk-go)，原生支持 WebSocket 长连接模式
- 将 Go SDK 封装为一个独立的 CLI 程序（`feishu-bridge`），负责：
  - 建立并维护飞书长连接
  - 接收消息后通过 `stdout` / Unix Domain Socket 传递给 Tauri 主进程
  - 自动处理 token 刷新、重连等飞书协议细节
- Tauri 主进程通过 `tauri-plugin-shell` 启动并管理该 sidecar 进程

**优点：**
- 复用官方 SDK，避免自行实现飞书协议的兼容性风险
- Go 编译产物为单一静态二进制，打包进 `.app` 体积增加约 8-12 MB，可接受
- 飞书协议升级时只需更新 Go 依赖，不影响 Rust/前端代码

**进程通信方式：**
```
Tauri (Rust) ──stdin/stdout──► feishu-bridge (Go)
                ◄─────────────
```
Go sidecar 收到消息后向 stdout 输出 JSON 行（JSON Lines 格式），Rust 侧逐行解析并派发事件到前端。

---

### 1.2 文字注入策略

**决策：优先使用 `CGEventPost` 模拟逐键输入**

**方案说明：**
- 使用 macOS `CoreGraphics` 框架的 `CGEventCreateKeyboardEvent` + `CGEventPost` 模拟键盘按键序列
- 对于中文等 Unicode 字符，使用 `CGEventKeyboardSetUnicodeString` 直接设置事件的 Unicode 内容
- 注入前通过 `AXUIElement` 检测当前焦点元素是否为可写输入框（`AXRole == AXTextField / AXTextArea / AXWebArea`），做前置校验

**为什么不用 `AXSetValue`：**
- `AXSetValue` 直接替换整个字段值，不触发输入事件（`onChange`、`input` 等），导致 VSCode、浏览器内的富文本输入框无响应
- `CGEventPost` 模拟真实按键，所有应用均可正常接收

**注入流程：**
```
收到消息
  ↓
AXUIElement 检查焦点元素
  ├─ 有可写焦点 → CGEventPost 逐字符注入
  └─ 无焦点     → 暂存消息 + 发送系统通知
```

**注意事项：**
- 需要「辅助功能」权限（`kAXTrustedCheckOptionPrompt`），首次使用时主动引导授权
- 注入速度：每字符间隔约 5-10ms，避免部分应用丢字；可配置

---

### 1.3 前端技术栈

**决策：React + Vite + TypeScript + Tailwind CSS**

| 依赖 | 版本策略 | 用途 |
|------|---------|------|
| React | 18.x | UI 渲染 |
| Vite | 5.x | 构建工具（Tauri 官方推荐） |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 3.x | 样式 |
| Zustand | 4.x | 轻量全局状态管理 |
| `@tauri-apps/api` | 2.x | 与 Rust 后端通信 |

---

## 二、完整技术栈总览

```
typebridge/
├── src/                        # React 前端
│   ├── components/
│   │   ├── ConfigWindow.tsx    # 配置 & 连接窗口
│   │   └── LogWindow.tsx       # 日志窗口
│   ├── store/
│   │   └── index.ts            # Zustand 状态
│   └── main.tsx
│
├── src-tauri/                  # Tauri / Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口、窗口管理
│   │   ├── tray.rs             # 托盘图标与菜单
│   │   ├── sidecar.rs          # feishu-bridge 进程管理
│   │   ├── injector.rs         # CGEventPost 注入逻辑
│   │   ├── notification.rs     # 系统通知
│   │   ├── store.rs            # 凭据持久化
│   │   └── logger.rs           # 日志文件管理
│   ├── binaries/
│   │   └── feishu-bridge-aarch64-apple-darwin  # 编译好的 Go 二进制
│   └── tauri.conf.json
│
└── feishu-bridge/              # Go sidecar 源码
    ├── main.go                 # 入口：读取 appId/appSecret，建立长连接
    ├── handler.go              # 消息处理：格式化为 JSON Lines 输出
    └── go.mod
```

---

## 三、关键数据流

### 3.1 消息接收与注入

```
飞书服务器
    │ WebSocket
    ▼
feishu-bridge (Go)
    │ stdout JSON Lines
    │ {"type":"message","sender":"张三","text":"...","ts":"..."}
    ▼
sidecar.rs (Rust) — 解析 & 派发
    ├──► 前端 LogWindow（实时日志展示）
    └──► injector.rs
              ├─ 有焦点 → CGEventPost → 目标输入框
              └─ 无焦点 → notification.rs → 系统推送
```

### 3.2 凭据配置流

```
前端 ConfigWindow
    │ invoke("save_credentials", {appId, appSecret})
    ▼
store.rs — 加密写入 tauri-plugin-store
    │
    ▼
sidecar.rs — 以环境变量方式传入 feishu-bridge
    │ FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx ./feishu-bridge
    ▼
feishu-bridge — 建立长连接，连接结果写 stdout
    │ {"type":"status","connected":true}
    ▼
前端 — 更新连接状态显示
```

---

## 四、打包与分发

- 目标平台：macOS 13+（Apple Silicon 优先，兼容 Intel）
- 打包产物：`.dmg` 安装包
- 代码签名：需要 Apple Developer 证书（否则 Gatekeeper 拦截辅助功能权限申请）
- Go 二进制需与 Tauri `externalBin` 配置对应，按目标架构分别编译：
  - `feishu-bridge-aarch64-apple-darwin`（Apple Silicon）
  - `feishu-bridge-x86_64-apple-darwin`（Intel，按需）

---

## 五、已确认决策汇总

| 决策点 | 结论 |
|--------|------|
| 飞书应用类型 | **自建应用**（长连接仅支持自建，已确认） |
| 消息类型范围 | 纯文本直接注入；图片下载后写剪贴板 + Cmd+V 粘贴 |
| 注入前确认 | 默认**关闭**（直接注入）；设置开关可切换，状态持久化 |

---

## 六、图片注入技术方案

### 6.1 图片下载（Go sidecar）

飞书图片消息的 `image_key` 需通过 API 下载原始字节：

```go
// 使用 lark-oapi-sdk-golang 下载图片
req := larkim.NewGetMessageResourceReqBuilder().
    MessageId(msgId).
    FileKey(imageKey).
    Type("image").
    Build()
resp, _ := client.Im.MessageResource.Get(ctx, req)
// resp.RawBody 即图片字节流
```

下载完成后，通过 stdout 输出图片（Base64 编码）：

```json
{"type":"image","message_id":"xxx","data":"<base64>","mime":"image/png","text":"同消息中的文本（可为空）"}
```

### 6.2 图片写入剪贴板（Rust）

```rust
// 使用 objc2 / cocoa crate 操作 NSPasteboard
let pasteboard = NSPasteboard::generalPasteboard();
pasteboard.clearContents();
pasteboard.setData_forType(image_data, NSPasteboardTypePNG);
```

### 6.3 粘贴触发

```rust
// 模拟 Cmd+V
let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState).unwrap();
let v_down = CGEvent::new_keyboard_event(source.clone(), 0x09, true).unwrap();
v_down.set_flags(CGEventFlags::CGEventFlagCommand);
v_down.post(CGEventTapLocation::HID);
// key up ...
```

### 6.4 图文混合顺序

1. 若消息含文本 → 先 `CGEventPost` 注入文本
2. 再将图片写入剪贴板 → 模拟 `Cmd+V`
3. 若粘贴失败（目标不支持图片）→ 写日志，剪贴板内容保留，用户可手动粘贴

---

## 七、设置项持久化方案

所有设置与凭据统一存储在 `tauri-plugin-store` 的同一个 JSON 文件中（`~/.typebridge/config.json`）：

```json
{
  "feishu_app_id": "cli_xxxx",
  "feishu_app_secret": "xxxx",
  "confirm_before_inject": false
}
```

Rust 侧提供两个 command 供前端调用：

```rust
#[tauri::command]
fn get_settings() -> Settings { ... }

#[tauri::command]
fn save_settings(settings: Settings) { ... }
```

`confirm_before_inject` 变更后立即生效，无需重启。
