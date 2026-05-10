# §一~§五 技术选型、完整技术栈、关键数据流、打包与分发、已确认决策

> **模块归属**：技术选型基础，覆盖 TECH_DESIGN.md §一到§五

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

**决策：统一使用 `NSPasteboard + Cmd+V`（剪贴板粘贴策略）**

**方案说明：**
- 文本写入 `NSPasteboard`（`NSPasteboardTypeString`），图片写入 `NSPasteboard`（`NSPasteboardTypePNG`）
- 写入后通过 `CGEventPost` 模拟 `Cmd+V` 触发粘贴，内容落入当前前台应用
- 粘贴前通过 `NSWorkspace.frontmostApplication.bundleIdentifier` 校验前台不是 TypeBridge 自己

**为什么不用 `AXSetValue`：**
- `AXSetValue` 直接替换整个字段值，不触发输入事件（`onChange`、`input` 等），导致 VSCode、浏览器内的富文本输入框无响应

**为什么放弃旧的 AX + CGEventPost 逐字符方案（v0.4 之前）：**
- `AXUIElement` 查焦点在 Electron 类应用（VSCode / Slack / Discord / Figma 等）上返回 `AXError=-25212 NoValue`——webview 内容未通过标准 AX 接口暴露焦点
- 结果：TypeBridge 对所有 Electron 应用判"无焦点"，消息无法输入
- 已整体替换为剪贴板 + Cmd+V 方案，不再需要 AX 焦点查询

**注入流程：**
```
收到消息
  ↓
check_accessibility（确认辅助功能权限）
  ↓
is_frontmost_self（防止打回 TypeBridge 自己）
  ├─ 是 TypeBridge → 拒绝，返回 failure_reason
  └─ 不是 TypeBridge →
        NSPasteboard 写入文本/图片
        CGEventPost 模拟 Cmd+V → 当前前台应用
        （可选）CGEventPost 模拟提交按键
```

**注意事项：**
- `CGEventPost` 模拟按键事件仍需「辅助功能」权限（macOS TCC 要求），首次使用时主动引导授权
- `NSPasteboard` 操作本身不需要辅助功能权限
- 详细演进背景见 [07-input-strategy.md §二十一](./07-input-strategy.md)

---

### 1.3 前端技术栈

**决策：React + Vite + TypeScript + Tailwind CSS**

| 依赖 | 版本策略 | 用途 |
|------|---------|------|
| React | 19.x | UI 渲染 |
| Vite | 7.x | 构建工具（Tauri 官方推荐） |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 3.x | 样式 |
| Zustand | 5.x | 轻量全局状态管理 |
| `@tauri-apps/api` | 2.x | 与 Rust 后端通信 |

---

## 二、完整技术栈总览

```
typebridge/
├── src/                        # React 前端（Vite + Tailwind + Zustand）
│   ├── App.tsx                 # 路由分流（pathname == "/log" → 日志窗口，否则 → 主窗口）
│   ├── components/
│   │   ├── MainWindow.tsx      # 主窗口框架（侧边栏 + 内容区）
│   │   ├── ConnectionHub.tsx   # 渠道连接 Tab（横向子 tab：WebChat / 飞书 / 钉钉 / 企微）
│   │   ├── SideBar.tsx         # 竖向侧边栏（tab 导航 + 状态指示）
│   │   ├── AccessibilityGate.tsx  # 辅助功能权限 blocking gate 模态
│   │   └── ...
│   ├── store/
│   │   └── index.ts            # Zustand 全局状态
│   └── main.tsx
│
├── src-tauri/                  # Tauri / Rust 后端
│   ├── src/
│   │   ├── lib.rs              # 入口：注册 plugin / command / tray / window；AppContext 构造
│   │   ├── main.rs             # Tauri entry point
│   │   ├── tray.rs             # 托盘图标（无菜单，单击唤回主窗口）
│   │   ├── window.rs           # 主窗口生命周期：build / show / 拦截 close 改 hide
│   │   ├── sidecar.rs          # 三个 Go sidecar 进程管理（启动/停止/重连/解析 JSON Lines）
│   │   ├── injector.rs         # NSPasteboard + CGEventPost(Cmd+V) 注入逻辑
│   │   ├── queue.rs            # FIFO 注入队列 + 反馈状态机
│   │   ├── webchat.rs          # WebChat 渠道 session 生命周期管理
│   │   ├── webchat_server.rs   # axum HTTP server + socketioxide（Socket.IO）
│   │   ├── webchat_net.rs      # LAN IP 枚举 + CoreWLAN FFI 获取 WiFi SSID
│   │   ├── channel.rs          # ChannelId 枚举与渠道能力矩阵
│   │   ├── history.rs          # 消息历史（读写 / 删除 / 清空）
│   │   ├── about.rs            # 版本号查询与检查更新
│   │   ├── store.rs            # 凭据与设置持久化（tauri-plugin-store）
│   │   └── logger.rs           # 按天滚动文件日志（~/Library/Logs/TypeBridge/）
│   ├── binaries/
│   │   ├── feishu-bridge-aarch64-apple-darwin
│   │   ├── dingtalk-bridge-aarch64-apple-darwin
│   │   └── wecom-bridge-aarch64-apple-darwin
│   └── tauri.conf.json
│
├── feishu-bridge/              # 飞书 Go sidecar（larkws 官方 SDK 长连接）
├── dingtalk-bridge/            # 钉钉 Go sidecar（Stream Mode 官方 SDK）
├── wecom-bridge/               # 企微 Go sidecar（手写 WSS 协议）
├── website/                    # 产品官网（Next.js，单页落地页）
└── webchat-local/              # WebChat 手机端 SPA（Vite + React + TS + Socket.IO）
```

---

## 三、关键数据流

### 3.1 消息接收与注入

```
飞书 / 钉钉 / 企微服务器
    │ WebSocket / Stream Mode / WSS
    ▼
{feishu,dingtalk,wecom}-bridge (Go)
    │ stdout JSON Lines
    │ {"type":"message","channel":"feishu","sender":"...","text":"...","ts":"..."}
    ▼
sidecar.rs (Rust) — 解析 & 派发
    ├──► 前端（实时日志 / 历史消息展示）
    └──► queue.rs → FIFO 注入队列
              ▼
         injector.rs
              ├─ NSPasteboard 写入文本/图片
              └─ CGEventPost 模拟 Cmd+V → 当前前台应用
```

### 3.2 凭据配置流

```
前端 ConnectionHub（各渠道配置表单）
    │ invoke("save_settings", {feishu_app_id, feishu_app_secret, ...})
    ▼
store.rs — 写入 tauri-plugin-store（config.json）
    │
    ▼
sidecar.rs — 以环境变量方式传入对应 bridge
    │ FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx ./feishu-bridge
    │ DINGTALK_CLIENT_ID=xxx DINGTALK_CLIENT_SECRET=xxx ./dingtalk-bridge
    │ WECOM_BOT_ID=xxx WECOM_SECRET=xxx ./wecom-bridge
    ▼
bridge (Go) — 建立长连接，连接结果写 stdout
    │ {"type":"status","channel":"feishu","connected":true}
    ▼
前端 — 更新渠道连接状态显示（子 tab 绿点）
```

---

## 四、打包与分发

- 目标平台：macOS 13+，**双架构分别出包**：`aarch64-apple-darwin`（Apple Silicon）+ `x86_64-apple-darwin`（Intel）
- 打包产物：两个独立 `.dmg` 安装包（不使用 universal binary，避免体积翻倍 + lipo 合并的额外复杂度）
- 代码签名：需要 Apple Developer 证书（否则 Gatekeeper 拦截辅助功能权限申请）

### 4.1 Go sidecar 双架构编译

三个 sidecar 各编两份独立二进制放入 `src-tauri/binaries/`：

```bash
for bridge in feishu-bridge dingtalk-bridge wecom-bridge; do
  cd "$bridge"
  GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 go build \
    -o "../src-tauri/binaries/${bridge}-aarch64-apple-darwin" .
  GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=amd64 go build \
    -o "../src-tauri/binaries/${bridge}-x86_64-apple-darwin" .
  cd ..
done
```

Tauri `externalBin: ["binaries/feishu-bridge", "binaries/dingtalk-bridge", "binaries/wecom-bridge"]` 会在 `cargo build --target <triple>` 时自动按 triple 后缀选对应二进制，无需改配置。

### 4.2 Tauri 双架构打包

前提：`rustup target add x86_64-apple-darwin`（Apple Silicon 上首次需装 Intel target）

```bash
# Apple Silicon 包
npm run tauri build -- --target aarch64-apple-darwin

# Intel 包
npm run tauri build -- --target x86_64-apple-darwin
```

产物分别位于：
- `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/TypeBridge_0.1.0_aarch64.dmg`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/TypeBridge_0.1.0_x64.dmg`

### 4.3 一键脚本

仓库内提供 [`scripts/build-all.sh`](../../scripts/build-all.sh)：顺序完成"检查 Rust target → 双架构 Go 编译 → 双架构 Tauri 打包 → 列产物"全流程。开发期按需用。

---

## 五、已确认决策汇总

| 决策点 | 结论 |
|--------|------|
| 飞书应用类型 | **自建应用**（长连接仅支持自建，已确认） |
| 消息类型范围 | 纯文本直接注入；图片下载后写剪贴板 + Cmd+V 粘贴 |
| 输入前确认 | **v0.4.3 已移除**。曾提供 `confirm_before_inject` toggle + ConfirmOverlay 浮层，实测开启后浮层本身抢焦点 → 粘贴目标丢失。整套逻辑全部清理，队列始终走 `Queued → Processing → Sent/Failed` 线性路径 |
| 消息卡片发送人展示 | **不展示**。WebSocket 事件里 `sender.sender_id.user_id` 是 opaque 的 `ou_xxx`，要拿真实用户名必须调 `client.Contact.User.Get`，需要 `contact:user.base:readonly` scope。评估后认为"加一个权限只为显示昵称"收益/风险比差，直接去掉。内部仍保留 `HistoryMessage.sender` 字段（装 user_id），供日志/调试使用 |
| 配置窗口关闭行为 | 拦截 `WindowEvent::CloseRequested`，调用 `prevent_close()` + `hide()`，应用退入 Dock + 托盘但不销毁窗口（保留 React state）。Dock 单击通过 `RunEvent::Reopen` 唤回窗口；托盘单击同样调 `show_or_create_main_window` |
| 托盘图标设计 | `logo-tray.svg`：橙红渐变(#f2682b→#d9480f)圆角矩形底 + 白色桥拱(stroke)。通过 `include_bytes!` 编译期嵌入 `tray.rs`，`tauri.conf.json` 中不声明 `trayIcon`（声明会先于 `setup()` 用运行时路径创建图标，与编译期嵌入冲突→旧图标残留）。**v0.7.x 起托盘不挂下拉菜单**——参考微信桌面端，单击直达窗口；Cmd+Q / Dock 右键退出已经覆盖了"退出应用"诉求 |
| UI 架构 | 单主窗口 + 3 tab（连接 / 消息历史 / 系统日志），废弃独立日志窗口 |
| 消息队列 | 严格串行 FIFO，单 worker 消费；失败不自动重试，由用户手动重发 |
| 消息历史存储 | JSON 文件（`~/.typebridge/history.json`）+ 图片独立目录；上限 500 条，FIFO 淘汰 |
| 飞书回复 | 表情反应为主（EYES / DONE / SAD 或飞书等价值）；仅失败时额外在 thread 下回复文字说明 |
| 输入后自动提交 | 默认**开启**；注入完成后用 CGEventPost 模拟按下用户自定义的"提交按键"（默认 Enter）。按键存 e.code + 四个 modifier flag；Rust 侧维护 e.code → macOS virtual keycode 映射表 |
| 双架构打包 | 分别出 `aarch64-apple-darwin` 和 `x86_64-apple-darwin` 的 `.dmg`，不走 universal binary；Go sidecar 按 target triple 提前交叉编译 |
