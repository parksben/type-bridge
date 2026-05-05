<p align="center">
  <img src="src/assets/icons/typebridge.png" alt="TypeBridge Logo" width="96" height="96" />
</p>

<h1 align="center">TypeBridge</h1>
<p align="center"><strong>手机上说话 · 电脑上输入</strong></p>

<p align="center">
  <a href="https://typebridge.parksben.xyz"><strong>typebridge.parksben.xyz</strong></a>
  &nbsp;·&nbsp;
  <a href="README.md">English</a>
</p>

---

## 这是什么？

TypeBridge 是一款轻量的 macOS 菜单栏应用。**在手机 IM 里给机器人发消息，电脑上当前聚焦的输入框就会自动打出这些文字。**

## 为什么需要？

手机打字慢，语音转文字快——但把文字弄到电脑上却很折腾：复制粘贴、发给自己、切来切去，思路全断。

TypeBridge 消灭了这个摩擦：**手机上说完话，电脑上字已经到了。**

## 核心能力

| 能力 | |
|---|---|
| **四渠道统一队列** | 飞书、钉钉、企微、内置 WebChat 四选一/多开，消息按 FIFO 顺序逐条注入。 |
| **通用粘贴** | 剪贴板 + 模拟 Cmd+V，任何 macOS 应用都能用。 |
| **自动提交** | 可选粘贴后自动按 Enter（或自定义按键），聊天/终端/AI 对话一键发送。 |
| **支持图片** | IM 端发送的图片同样通过剪贴板注入。 |
| **离线 WebChat** | 无需任何 IM 账号，桌面 App 内置局域网服务器，手机扫码 + OTP 即连。完全离线可用。 |
| **隐私优先** | WebChat 数据不出局域网，不依赖任何云服务。 |

## 工作原理

```
手机端 (IM / 浏览器)          Mac (TypeBridge)            目标应用
    │                              │                          │
    ├─ 发送消息 ──→  机器人 / Socket.IO ──→ 队列 ──→  Cmd+V ──→  聚焦的输入框
    │                              │                          │
    └── ◀── 状态反馈 ──────────────┘              ←── (可选 Enter)
```

1. **接入渠道**：填写飞书/钉钉/企微机器人的凭据，或启动内置 WebChat 局域网会话。
2. **手机发消息**：在 IM 里给机器人发文字（或语音转文字）。
3. TypeBridge **收到消息**，进入队列。
4. 自动**粘贴**到 Mac 当前聚焦的输入框。
5. **完成。** 无需任何复制粘贴操作。

## 支持渠道

| 渠道 | 需要什么 | 适用场景 |
|---|---|---|
| **WebChat** | 无需任何账号。启动会话，扫码即连。 | 快速上手，离线使用 |
| **飞书** | 自建应用（App ID + Secret） | 已在用飞书的团队 |
| **钉钉** | 企业内部应用（Client ID + Secret，Stream 模式） | 已在用钉钉的团队 |
| **企业微信** | 智能机器人（Bot ID + Secret） | 已在用企业微信的团队 |

## 系统要求

macOS 13+（Apple Silicon 或 Intel）

首次启动会申请**辅助功能**权限——粘贴注入需要它。TypeBridge 不会读取或监控你的屏幕内容。

## 开发者

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

### 开发注意事项

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

推送 `v*` 标签或通过 GitHub Actions 手动触发 `Release` workflow。详见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。

## 许可证

[MIT](LICENSE)
