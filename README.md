<p align="center">
  <img src="src/assets/icons/typebridge.png" alt="TypeBridge Logo" width="96" height="96" />
</p>

<h1 align="center">TypeBridge</h1>
<p align="center"><strong>Speak on your phone. Type on your Mac.</strong></p>
<p align="center">手机上说话 · 电脑上输入</p>

<p align="center">
  <a href="https://typebridge.parksben.xyz"><strong>🌐 typebridge.parksben.xyz</strong></a>
  &nbsp;·&nbsp;
  <a href="https://typebridge.parksben.xyz/docs">📖 Docs / 使用文档</a>
  &nbsp;·&nbsp;
  <a href="https://typebridge.parksben.xyz/#download">⬇️ Download / 下载</a>
</p>

---

## What is TypeBridge? / 这是什么？

TypeBridge is a lightweight macOS menu bar app that bridges your phone and your Mac. Send a message from any supported IM app on your phone — TypeBridge instantly types it into whatever input field is focused on your Mac.

TypeBridge 是一款轻量的 macOS 菜单栏应用。**在手机 IM 里给机器人发消息，电脑上当前聚焦的输入框就会自动打出这些文字。**

---

## Why? / 为什么需要？

Typing on a phone keyboard is slow. Voice dictation on a phone is fast, but transferring dictated text to your desktop is a hassle — copy, paste, email yourself… it breaks your flow.

手机打字慢，语音转文字快——但把文字弄到电脑上却很折腾：复制粘贴、发给自己、切来切去，思路全断。

TypeBridge eliminates that friction. Dictate on your phone. Text appears on your Mac. One seamless motion.

TypeBridge 消灭了这个摩擦：**手机上说完话，电脑上字已经到了。**

---

## Key Features / 核心能力

| Feature | |
|---|---|
| 🔗 **4 channels, 1 queue** | Feishu, DingTalk, WeCom & built-in WebChat — all feed into a single FIFO queue. Use whichever is most convenient. |
| 📋 **Universal paste** | Uses system clipboard + simulated `Cmd+V`. Works in *any* macOS app: VS Code, Terminal, Chrome, Obsidian, Slack… |
| ⚡ **Auto-submit** | Optionally presses `Enter` (or any custom key) right after pasting — one-shot send into chat apps, terminals, AI assistants. |
| 🖼️ **Image support** | Images sent from IM are also injected as clipboard images. |
| 📡 **Offline WebChat** | No IM account? No cloud dependency. Built-in local WiFi server — scan a QR, enter OTP, start chatting. Works fully offline. |
| 🔐 **Privacy-first** | WebChat runs entirely on your LAN. No messages ever leave your local network. |

| 能力 | |
|---|---|
| 🔗 **四渠道统一队列** | 飞书、钉钉、企微、内置 WebChat 四选一/多开，消息按 FIFO 顺序逐条注入。 |
| 📋 **通用粘贴** | 剪贴板 + 模拟 Cmd+V，任何 macOS 应用都能用。 |
| ⚡ **自动提交** | 可选粘贴后自动按 Enter（或自定义按键），聊天/终端/AI 对话一键发送。 |
| 🖼️ **支持图片** | IM 端发送的图片同样通过剪贴板注入。 |
| 📡 **离线 WebChat** | 无需任何 IM 账号，桌面 App 内置局域网服务器，手机扫码 + OTP 即连。完全离线可用。 |
| 🔐 **隐私优先** | WebChat 数据不出局域网，不依赖任何云服务。 |

---

## How It Works / 工作原理

```
Phone (IM / Browser)          Mac (TypeBridge)            Target App
    │                              │                          │
    ├─ Send message ──→  Bot / Socket.IO ──→ Queue ──→  Cmd+V ──→  Focused input
    │                              │                          │
    └── ◀── Status feedback ──────┘              ←── (optional Enter)
```

1. **Connect** a channel: fill in bot credentials for Feishu / DingTalk / WeCom, or start a local WebChat session.
2. **Send** text (or voice→text) from your phone to that bot.
3. TypeBridge **receives** the message and queues it.
4. It **pastes** the content into your Mac's currently focused input field.
5. **Done.** No copy-paste. No context switch.

1. **接入渠道**：填写飞书/钉钉/企微机器人的凭据，或启动内置 WebChat 局域网会话。
2. **手机发消息**：在 IM 里给机器人发文字（或语音转文字）。
3. TypeBridge **收到消息**，进入队列。
4. 自动**粘贴**到 Mac 当前聚焦的输入框。
5. **完成。** 无需任何复制粘贴操作。

---

## Supported Channels / 支持渠道

| Channel | What you need | Best for |
|---|---|---|
| **WebChat** | Nothing. Just start session, scan QR. | Quick start, no accounts, offline use |
| **Feishu / 飞书** | Self-built app (App ID + Secret) | Teams already using Feishu |
| **DingTalk / 钉钉** | Internal app (Client ID + Secret, Stream Mode) | Teams already using DingTalk |
| **WeCom / 企业微信** | Smart Bot (Bot ID + Secret) | Teams already using WeCom |

> Detailed setup guides: [typebridge.parksben.xyz/docs](https://typebridge.parksben.xyz/docs)
>
> 详细接入教程：[typebridge.parksben.xyz/docs](https://typebridge.parksben.xyz/docs)

---

## Download / 下载

Get the latest `.dmg` from our website:

前往官网下载最新版本：

<p align="center">
  <a href="https://typebridge.parksben.xyz/#download"><strong>⬇️ Download TypeBridge / 下载 TypeBridge</strong></a>
</p>

**System requirements / 系统要求：** macOS 13+ (Apple Silicon or Intel)

First launch will prompt for **Accessibility** permission — this is required for the simulated paste to work. TypeBridge does not read or monitor your screen content.

首次启动会申请**辅助功能**权限——粘贴注入需要它。TypeBridge 不会读取或监控你的屏幕内容。

---

## For Developers / 开发者

### Prerequisites

| Dependency | Version |
|---|---|
| Node.js | 20+ |
| Rust | stable (1.95+) |
| Go | 1.21+ |
| Xcode Command Line Tools | required |

### Quick Start

```bash
npm install

# Build Go sidecars (aarch64)
for bridge in feishu-bridge dingtalk-bridge wecom-bridge; do
  (cd "$bridge" && GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 \
    go build -o "../src-tauri/binaries/${bridge}-aarch64-apple-darwin" .)
done

# Start dev mode
npm run tauri dev
```

### Project Layout

```
type-bridge/
├── src/                     React frontend (Vite + Tailwind + Zustand)
├── src-tauri/               Tauri / Rust backend
│   └── src/
│       ├── injector.rs      Text injection via CGEventPost + NSPasteboard
│       ├── sidecar.rs       Go sidecar process management
│       ├── webchat.rs       Built-in LAN WebChat server host
│       ├── queue.rs         FIFO injection queue + feedback
│       └── ...
├── feishu-bridge/           Feishu Go sidecar (long-connection WebSocket)
├── dingtalk-bridge/         DingTalk Go sidecar (Stream Mode)
├── wecom-bridge/            WeCom Go sidecar (WSS + AES image decrypt)
├── website/                 Product site (Next.js, single-page landing)
├── webchat-local/           WebChat mobile SPA (Vite + React + TS)
└── docs/
    ├── REQUIREMENTS.md      Product spec (what & why)
    └── TECH_DESIGN.md       Architecture & technical decisions (how)
```

### Development Notes

- **Go sidecars require manual rebuild** — `tauri dev` does not recompile Go. After editing `.go` files, run `go build` for the affected bridge, then restart `tauri dev`.
- **Frontend HMR** works automatically for `src/` changes.
- **Rust changes** are picked up automatically by `tauri dev` (cargo rebuild).
- For full development workflow, architecture details, and inter-process event contracts, see [CLAUDE.md](CLAUDE.md).

### Build & Package

```bash
# Single arch
npm run tauri build -- --target aarch64-apple-darwin

# Both archs
./scripts/build-all.sh
```

Output: `src-tauri/target/{arch}/release/bundle/dmg/TypeBridge_*.dmg`

### CI/CD

Push a `v*` tag or trigger the `Release` workflow manually via GitHub Actions. Detailed docs: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

---

## License

TBD

