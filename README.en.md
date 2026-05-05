<p align="center">
  <img src="src/assets/icons/typebridge.png" alt="TypeBridge Logo" width="96" height="96" />
</p>

<h1 align="center">TypeBridge</h1>
<p align="center"><strong>Speak on your phone. Type on your Mac.</strong></p>

<p align="center">
  <a href="https://typebridge.parksben.xyz"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://typebridge.parksben.xyz/#download"><strong>Download</strong></a>
  &nbsp;·&nbsp;
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="public/readme-hero-concept.png" alt="TypeBridge phone-to-desktop input concept graphic" width="760" />
</p>

---

## What is TypeBridge?

TypeBridge is a lightweight macOS menu bar app that bridges your phone and your Mac. Send a message from any supported IM app on your phone — TypeBridge instantly types it into whatever input field is focused on your Mac.

## Why?

Typing on a phone keyboard is slow. Voice dictation on a phone is fast, but transferring dictated text to your desktop is a hassle — copy, paste, email yourself… it breaks your flow.

TypeBridge eliminates that friction. Dictate on your phone. Text appears on your Mac. One seamless motion.

## Key Features

| Feature | |
|---|---|
| **4 channels, 1 queue** | Feishu, DingTalk, WeCom & built-in WebChat — all feed into a single FIFO queue. Use whichever is most convenient. |
| **Universal paste** | Uses system clipboard + simulated `Cmd+V`. Works in *any* macOS app: VS Code, Terminal, Chrome, Obsidian, Slack… |
| **Auto-submit** | Optionally presses `Enter` (or any custom key) right after pasting — one-shot send into chat apps, terminals, AI assistants. |
| **Image support** | Images sent from IM are also injected as clipboard images. |
| **Offline WebChat** | No IM account? No cloud dependency. Built-in local WiFi server — scan a QR, enter OTP, start chatting. Works fully offline. |
| **Privacy-first** | WebChat runs entirely on your LAN. No messages ever leave your local network. |

## How It Works

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

## Supported Channels

| Channel | What you need | Best for |
|---|---|---|
| **WebChat** | Nothing. Just start session, scan QR. | Quick start, no accounts, offline use |
| **Feishu** | Self-built app (App ID + Secret) | Teams already using Feishu |
| **DingTalk** | Internal app (Client ID + Secret, Stream Mode) | Teams already using DingTalk |
| **WeCom** | Smart Bot (Bot ID + Secret) | Teams already using WeCom |

## System Requirements

macOS 13+ (Apple Silicon or Intel)

First launch will prompt for **Accessibility** permission — this is required for the simulated paste to work. TypeBridge does not read or monitor your screen content.

## For Developers

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

Push a `v*` tag or trigger the `Release` workflow manually via GitHub Actions. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) and [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md).

## License

[MIT](LICENSE)
