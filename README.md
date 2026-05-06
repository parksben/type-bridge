<p align="center">
  <img src="src/assets/icons/typebridge.png" alt="TypeBridge Logo" width="96" height="96" />
</p>

<h1 align="center">TypeBridge</h1>
<p align="center"><strong>手机上说话 · 电脑上输入</strong></p>

<p align="center">
  <a href="https://typebridge.parksben.xyz"><strong>官网</strong></a>
  &nbsp;·&nbsp;
  <a href="https://typebridge.parksben.xyz/#download"><strong>下载</strong></a>
  &nbsp;·&nbsp;
  <a href="README.en.md">English</a>
</p>

<p align="center"><strong>手机输入，Mac 落字。中间只需要一座桥。</strong></p>

```mermaid
flowchart LR
  phone["手机端<br/>IM / WebChat / 语音转文字"] --> bridge["TypeBridge<br/>统一队列"]
  bridge --> paste["剪贴板 + Cmd+V<br/>文本和图片都可注入"]
  paste --> target["Mac 当前应用<br/>聚焦的输入框"]
  target -. "可选自动 Enter" .-> done["发送 / 执行"]
  bridge -. "状态反馈" .-> phone
```

---

## 👋 TypeBridge 是什么？

TypeBridge 是一款 macOS 菜单栏应用，用来把手机上的输入送到 Mac 当前正在编辑的位置。

你可以在飞书、钉钉、企业微信机器人里发消息，也可以用内置的 WebChat。TypeBridge 收到后，会把内容放进一个统一队列，再通过系统剪贴板和 `Cmd+V` 粘贴到当前聚焦的输入框。

## 🧩 它解决什么问题？

很多时候，手机反而是更顺手的输入设备：语音转文字快，随手打几句也方便。麻烦的是把这些内容搬到电脑上——复制、转发给自己、再切回桌面，几步下来思路很容易断。

TypeBridge 做的事很简单：**手机上说完或打完，Mac 上的光标位置就能收到这段内容。**

## ✨ 主要能力

| 能力 | |
|---|---|
| **四个入口，一条队列** | 飞书、钉钉、企业微信、WebChat 都可以接入；多条消息按 FIFO 顺序处理，不会抢焦点打架。 |
| **通用粘贴策略** | 通过剪贴板 + `Cmd+V` 注入，VS Code、Terminal、浏览器、Obsidian、Slack 等常见应用都能用。 |
| **可选自动提交** | 粘贴后可以自动按 `Enter`，也可以换成你自己的提交按键。适合聊天、终端、AI 对话框。 |
| **图片也能传** | IM 里发来的图片会写入系统剪贴板，再粘贴到目标应用。 |
| **内置 WebChat** | 不想配 IM 机器人时，直接启动局域网 WebChat，手机扫码输入 OTP 即可连接。 |
| **局域网优先** | WebChat 不走云端，消息只在同一局域网内流转。 |

## 🔄 工作流程

1. 在桌面端连接一个渠道：WebChat、飞书、钉钉或企业微信。
2. 在手机上发文字、语音转文字，或发送图片。
3. TypeBridge 收到消息后写入本地队列。
4. 轮到该消息时，写入系统剪贴板并模拟 `Cmd+V`。
5. 如果开启了自动提交，再补一个 `Enter` 或自定义按键。

## 📡 支持渠道

| 渠道 | 需要什么 | 适用场景 |
|---|---|---|
| **WebChat** | 无需账号。启动会话，扫码即连。 | 个人使用、快速试用、离线场景 |
| **飞书** | 自建应用（App ID + Secret） | 已在用飞书的团队 |
| **钉钉** | 企业内部应用（Client ID + Secret，Stream 模式） | 已在用钉钉的团队 |
| **企业微信** | 智能机器人（Bot ID + Secret） | 已在用企业微信的团队 |

## 🖥️ 系统要求

macOS 13+（Apple Silicon 或 Intel）

首次启动会申请**辅助功能**权限。它只用于向前台应用发送 `Cmd+V` 和提交按键；TypeBridge 不会读取或监控屏幕内容。

## 🛠️ 开发

### 环境要求

| 依赖 | 版本 |
|---|---|
| Node.js | 20+ |
| Rust | stable (1.95+) |
| Go | 1.21+ |
| Xcode Command Line Tools | 必须安装 |

### 快速开始

```bash
npm install

# 编译 Go sidecar（aarch64）
for bridge in feishu-bridge dingtalk-bridge wecom-bridge; do
  (cd "$bridge" && GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 \
    go build -o "../src-tauri/binaries/${bridge}-aarch64-apple-darwin" .)
done

# 启动开发模式
npm run tauri dev
```

### 项目结构

```
type-bridge/
├── src/                     前端（Vite + Tailwind + Zustand）
├── src-tauri/               Tauri / Rust 后端
│   └── src/
│       ├── injector.rs      文本注入（CGEventPost + NSPasteboard）
│       ├── sidecar.rs       Go sidecar 进程管理
│       ├── webchat.rs       内置局域网 WebChat 服务宿主
│       ├── queue.rs         FIFO 注入队列 + 反馈
│       └── ...
├── feishu-bridge/           飞书 Go sidecar（长连接 WebSocket）
├── dingtalk-bridge/         钉钉 Go sidecar（Stream 模式）
├── wecom-bridge/            企业微信 Go sidecar（WSS + AES 图片解密）
├── website/                 官网（Next.js，单页落地页）
├── webchat-local/           WebChat 手机端 SPA（Vite + React + TS）
└── docs/
    ├── REQUIREMENTS.md      产品规格（做什么 & 为什么）
    └── TECH_DESIGN.md       架构与技术决策（怎么做）
```

### 开发时注意

- **Go sidecar 需手动重新编译** — `tauri dev` 不会自动编译 Go。修改 `.go` 文件后需手动 `go build` 对应 bridge，然后重启 `tauri dev`。
- **前端 HMR** 对 `src/` 的修改自动生效。
- **Rust 修改** 会被 `tauri dev` 自动检测（cargo 增量编译）。
- 完整的开发流程、架构细节和跨进程事件约定见 [CLAUDE.md](CLAUDE.md)。

### 构建与打包

```bash
# 单架构
npm run tauri build -- --target aarch64-apple-darwin

# 双架构
./scripts/build-all.sh
```

产物：`src-tauri/target/{arch}/release/bundle/dmg/TypeBridge_*.dmg`

### CI/CD

推送 `v*` 标签或通过 GitHub Actions 手动触发 `Release` workflow。详见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) 和 [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)。

## 📄 许可证

[MIT](LICENSE)
