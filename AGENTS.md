# AGENTS.md

本文件为 AI 编码助手（Claude Code、GitHub Copilot、Cursor 等）提供本仓库的上下文参考。

## 开发协作约定（重要）

- **先文档后代码**：每次收到新的想法 / 需求 / 补充，先更新 [docs/REQUIREMENTS/README.md](docs/REQUIREMENTS/README.md) 和 [docs/TECH_DESIGN/README.md](docs/TECH_DESIGN/README.md)，再动代码。文档与实现必须保持同步。
- **README 也是文档的一部分**：[README.md](README.md) 要与实现实时同步。凡是影响快速开始 / 构建命令 / 环境要求 / 项目结构 / 头部功能描述 的改动，必须同 commit 更新 README。
- **小步 commit**：每完成一个功能点或一次非平凡的重构，立即创建一次 commit。不要把多个不相关的修改攒成大 commit。
- **commit 即 push**：每次 commit 完成后立即 `git push` 到 origin，不要攒多个本地 commit。
- **UI icon 一律用 [lucide-react](https://lucide.dev)**：禁止在 UI 中使用 emoji（包括 ✓ ✗ → ◌ ⌘ 等装饰性 unicode 字符），统一用 lucide 图标提升可读性与一致性。仅在文档 / commit message / 日志文本中允许 emoji。
- 文档是两份：REQUIREMENTS 记"做什么、为什么"，TECH_DESIGN 记"怎么做、为什么选这个方案"。改动影响用户可见行为 → 两份都要更；仅影响内部实现 → 只更 TECH_DESIGN。

## 项目概览

TypeBridge 是 macOS 菜单栏应用：接收飞书机器人消息 → 通过 Accessibility API 注入当前聚焦的输入框。仅支持飞书**自建应用**（长连接不支持商店应用）。

## 常用命令

> 📖 **首次在新机器上搭建开发环境**，请先阅读 [docs/DEV_SETUP.md](docs/DEV_SETUP.md)。  
> 该文档详细记录了前置依赖安装、Go sidecar 编译、webchat-local 构建等一次性步骤，以及常见报错与解法。

```bash
# 开发模式（首次编译约 5-10 分钟，之后秒级增量）
npm run tauri dev

# 打包 .dmg（单架构）
npm run tauri build -- --target aarch64-apple-darwin

# 双架构打包
./scripts/build-all.sh

# 单独编译 Go sidecar（修改任意 *-bridge/*.go 后必须手动重编对应 bridge）
cd feishu-bridge && GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 \
  go build -o ../src-tauri/binaries/feishu-bridge-aarch64-apple-darwin . && cd ..

# 只检查 Rust 编译错误（比 tauri dev 快很多）
cd src-tauri && cargo check
```

**Go sidecar 必须手动重编** — `tauri dev` 不会触发 Go 的重新编译。改完 `.go` 文件必须跑上面那行 `go build`，然后重启 `tauri dev`。  
**webchat-local/dist 需手动构建** — `tauri dev` 不会触发 `webchat-local` 的构建。修改 `webchat-local/` 源码后需手动 `cd webchat-local && npm run build`。

## 镜像配置（国内网络）

详见 [docs/DEV_SETUP.md § 镜像配置](docs/DEV_SETUP.md#镜像配置国内网络)。速查：

| 工具 | 配置 |
|---|---|
| npm | `npm config set registry https://registry.npmmirror.com` |
| Go | 构建命令内加 `GOPROXY=https://goproxy.cn,direct` |
| Cargo | `~/.cargo/config.toml` 配置 USTC sparse index |
| Rustup | `export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static` |
| Homebrew | `export HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles` |

## 架构：三进程 IPC + WebChat 本地 Socket.IO server

```
飞书 / 钉钉 / 企微 开放平台              同 WiFi 手机浏览器
   │ WebSocket (sidecar 内)                  │ Socket.IO
   ▼                                          ▼
{feishu,dingtalk,wecom}-bridge (Go)    webchat_server.rs (axum + socketioxide)
   │ stdout JSON Lines                       │ 绑 LAN IP:8723
   ▼                                          ▼
              Tauri Core (Rust)   ◄── Tauri events ──►   WebView (React)
                     │
                     ▼ CGEventPost / NSPasteboard
                当前焦点输入框
```

- **Go sidecar**（feishu / dingtalk / wecom）作为外部二进制打包在 `.app` 内，由 `tauri-plugin-shell` 启动
- **WebChat**（本地局域网扫码渠道）**不走 sidecar 也不走云端**，桌面 App 启动一个本机 HTTP + Socket.IO server（`axum` + `socketioxide`），同 WiFi 下手机直连。完全离线可用。详见 [docs/TECH_DESIGN.md §三十五](docs/TECH_DESIGN.md)
- **Rust ↔ Go** 仅单向 stdout JSON Lines（IM SDK 协议细节都封在 Go 侧）
- **Rust ↔ React** 用 Tauri events（`typebridge://...` 前缀）+ `#[tauri::command]` 双向通信

### 关键 event 名称（跨层契约）

改动任何一方都要同步另一方：

| Event | 方向 | 载荷 |
|-------|------|------|
| `typebridge://status` | Rust → React | `{channel, connected}` |
| `typebridge://message` | Rust → React | `{channel, sender, text, ts}` |
| `typebridge://image` | Rust → React | `{channel, message_id, data, mime, text}` |
| `typebridge://inject-result` | Rust → React | `{channel, success, reason?}` |
| `typebridge://message-status` | Rust → React | `{id, status, reason?}`（webchat_server 据此回 Socket.IO ack） |
| `typebridge://webchat-session-update` | Rust → React | WebChat 专用：`{phase, session_id, otp, lan_ip, port, wifi_name, bound_devices, ...}` |

Go sidecar stdout 输出的 JSON Lines `type` 字段：`status` / `message` / `image` / `error`，由 [sidecar.rs](src-tauri/src/sidecar.rs) 的 `SidecarEvent` enum 解析。

## 关键模块

### Rust (`src-tauri/src/`)

- **[lib.rs](src-tauri/src/lib.rs)** — 入口，注册 plugin、command、tray + window、`AppContext`；`.build()?.run()` 流程里挂 `RunEvent::Reopen` handler，处理 macOS Dock 单击 → 唤回主窗口
- **[sidecar.rs](src-tauri/src/sidecar.rs)** — 启动 Go 进程，解析 JSON Lines，派发事件，指数退避重连（2s→60s）
- **[webchat.rs](src-tauri/src/webchat.rs)** — WebChat 渠道本机 server 宿主：管理 session 生命周期（启动/停止/过期），委托 `webchat_server.rs` 做实际的 axum + socketioxide 服务
- **[webchat_server.rs](src-tauri/src/webchat_server.rs)** — axum HTTP server（serve SPA 静态资源）+ socketioxide（Socket.IO 事件 handler），绑 LAN IP:8723 递增 fallback
- **[webchat_net.rs](src-tauri/src/webchat_net.rs)** — LAN IP 枚举 + macOS CoreWLAN FFI 获取 WiFi SSID
- **[injector.rs](src-tauri/src/injector.rs)** — 核心注入逻辑，直接 FFI 调 `AXUIElement` / `CGEventPost` / `NSPasteboard`。**不要改用 `AXSetValue`** — 它不触发 `onChange`，VSCode / 浏览器富文本框会无响应
- **[tray.rs](src-tauri/src/tray.rs)** — 托盘 icon（仅图标，无下拉菜单），单击转给 `window::show_or_create_main_window`
- **[window.rs](src-tauri/src/window.rs)** — 主窗口生命周期：build / show / 拦截 close 改 hide。Dock 单击和托盘单击都走这里的 `show_or_create_main_window`
- **[store.rs](src-tauri/src/store.rs)** — 凭据和设置持久化，所有字段存同一个 `config.json`
- **[logger.rs](src-tauri/src/logger.rs)** — 文件日志按天滚动到 `~/Library/Logs/TypeBridge/`，保留 30 天

### 前端 (`src/`)

- **[App.tsx](src/App.tsx)** 按 `window.location.pathname === "/log"` 分流到 LogWindow 或 ConfigWindow（单 SPA 双窗口）
- Zustand store 只保存前端状态（`connected` / `logs[]` 等）；真正的凭据和设置在 Rust 侧

### Go (`feishu-bridge/`)

- **[main.go](feishu-bridge/main.go)** — `larkws.NewClient` + `dispatcher.NewEventDispatcher` 注册 `OnP2MessageReceiveV1` 回调
- **[handler.go](feishu-bridge/handler.go)** — 消息类型分发：`text` / `image` / `post`（图文混合）。图片用 `client.Im.MessageResource.Get` 下载原始字节，base64 编码后输出
- `resp.RawBody` 在 oapi-sdk-go v3 中是 `[]byte`（不是 `io.Reader`）— 不要错写成 `io.ReadAll`

### 官网 (`website/`)

- Next.js 15 (App Router) + Tailwind CSS v4 + lucide-react 单页营销落地页
- 部署于 Netlify：`typebridge.parksben.xyz`，`netlify.toml` + `@netlify/plugin-nextjs` 驱动零手动配置
- 支持浅色/深色双模式主题切换（CSS 变量 + class，内联脚本防闪烁），默认深色
- **一句话记忆点**：聊天即打字
- 顶部固定导航栏：首页 / 场景 / 流程 / 下载（锚点导航 + Scroll Spy）+ GitHub 入口 + 语言切换 + 主题切换
- 页面结构（单页 `/`）：
  - `#hero` — Hero 第一屏（logo + slogan + 概念动画 Banner + 双 CTA）
  - `#scenes` — 4 场景 pill tab 轮播（触控板 / 打字输入 / 语音输入 / 快捷指令）
  - `#flow` — SVG 使用流程图
  - `#download` — 动态版本号 + 双架构下载卡片
- 路由：
  - `/api/latest-version` — 检查更新 API，透传 GitHub Release 信息，5 分钟 ISR 缓存
  - `/download/[arch]` — Route Handler，代理转发 GitHub Release .dmg 流式透传
- **Hero Banner**：纯 CSS/SVG 动画概念图（输入源 → 桥接弧线/粒子 → 桌面光标），零外部依赖
- 中英文双语支持（`app/lib/i18n.ts`，React Context + 静态字典）
- 页脚仅品牌 + 版权，无 GitHub 外链（仓库为私有）
- 本地开发：`cd website && npm run dev`

### WebChat 移动端 SPA (`webchat-local/`)

- Vite + React 19 + TypeScript + Tailwind v4 + `socket.io-client` 的单页应用
- **不部署到任何公网**：构建产物 `webchat-local/dist/` 作为 Tauri resource 打包进 `.app`，运行时由桌面 App 内嵌的 Rust server 提供
- 单页 SPA 状态机：`loading → UA分流（PC 拦截 / mobile） → handshake → chat | error-screens`
- **UA 检测**（`src/lib/ua.ts`）：仅对 **PC 浏览器**渲染拦截页；IM 内置浏览器（微信 / 钉钉 / 飞书 / QQ）全部放行（不依赖 `getUserMedia`）
- **Socket.IO 通信**（`src/lib/socket.ts`）：hello 握手 + text/image 发送 + ack 回调，内置重连/心跳/自动重发
- 安全：OTP 由桌面显示（不进网络），Socket.IO `hello` 事件提交 OTP + clientId 本地校验，通过后 ack 返回 userToken；后续所有事件必须带 userToken
- **无语音识别**：语音按钮点击 → 弹 modal 引导用手机输入法自带麦克风；`.app` 不打包任何 ML 模型
- 本地开发：`cd webchat-local && npm run dev`（Vite dev server 在 5173）

## 权限模型

- **Accessibility** — `AXIsProcessTrustedWithOptions` 检查；首次注入前调用 [injector.rs](src-tauri/src/injector.rs) 的 `request_accessibility_with_prompt()` 跳转系统设置
- **Notifications** — `lib.rs` 的 setup 里 `app.notification().request_permission()` 启动时请求
- Tauri 侧权限声明在 [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)

## 打包与签名

- 架构：当前只编 `aarch64-apple-darwin`。如需 Intel 支持，需额外编译 `x86_64-apple-darwin` 的 Go 二进制并调整 `tauri.conf.json` 的 `externalBin`
- `externalBin: ["binaries/feishu-bridge"]` 会自动匹配当前 target triple 的二进制
- 真机验收需要 Apple Developer 签名，否则 Gatekeeper 会拦截辅助功能权限申请

## CI/CD（GitHub Actions）

- Workflow 文件：`.github/workflows/release.yml`
- **两种触发**：
  - `workflow_dispatch` — 手动触发，输入 `version` 参数，任意版本号可重复构建
  - `push tags v*` — 打 `v0.2.0` 之类 tag 推送即自动构建发布
- **版本覆写**：CI 通过 `sed` 在运行时覆写 `tauri.conf.json` + `Cargo.toml` 的 `version`，不改 git 内版本号
- **双架构**：在 `macos-latest` runner 上交叉编译 arm64 + x86_64，产两个 `.dmg`
- **产物发布**：通过 `softprops/action-gh-release@v2` 创建/更新 GitHub Release + 上传 assets
- **注意**：CI 产出的 `.dmg` 未签名（无 Apple Developer 证书），仅用于内部测试分发
- 详细设计见 [docs/TECH_DESIGN.md §24](docs/TECH_DESIGN.md)
