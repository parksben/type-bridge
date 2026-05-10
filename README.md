<div align="center">
  <img src="src/assets/icons/typebridge.png" alt="TypeBridge Logo" width="96" height="96" />
<h1>TypeBridge</h1>
<p><strong>Phone as Keyboard &amp; Mouse</strong></p>
</div>

<p align="center">
  <img src="https://typebridge.parksben.xyz/api/badge/version?v=1" alt="latest version" />
  <img src="https://typebridge.parksben.xyz/api/badge/downloads?v=1" alt="total downloads" />
</p>

<p align="center">
  <a href="https://typebridge.parksben.xyz"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://typebridge.parksben.xyz/#download"><strong>Download</strong></a>
  &nbsp;·&nbsp;
  <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="public/readme-hero-concept.png" alt="TypeBridge phone-as-keyboard-and-mouse concept graphic" />
</p>

---

## 👋 What is TypeBridge?

TypeBridge is a macOS desktop app. Open the app, scan a code — your phone instantly becomes a wireless keyboard and trackpad for your Mac. Type, control the cursor, or use your voice, all from one device.

You can also send messages through Feishu, DingTalk, or WeCom bots — they'll land right where your cursor is on the desktop.

## 🧩 Why does this exist?

Presenting slides from across the room? Browsing from the couch and don't want to get up? Tired of copying text back and forth between your phone and AI coding tools?

TypeBridge does one thing well: **turn your phone into a wireless keyboard and trackpad for your Mac**. Type, move the cursor, use your voice — just scan a code and you're set.

## ✨ Highlights

| Feature | |
|---|---|
| **Trackpad mode** | Move the cursor with one finger, scroll with two, tap to click. No Bluetooth. No pairing. Scan and go. |
| **Text input** | Type on your phone, text appears on your Mac — wherever the cursor is. Voice-to-text works too, using your phone's built-in input method. |
| **Quick commands** | One-tap shortcuts: arrow keys, Cmd+Z/X/C/V, Enter, Escape, and more. No need to reach for the keyboard. |
| **Built-in WebChat** | No bot setup needed. Start a local WebChat session, scan the QR code, enter the OTP, and you're connected. Traffic stays on your LAN. |
| **IM bot support** | Feishu, DingTalk, and WeCom bots feed into the same FIFO queue. Messages are handled one at a time — no focus conflicts. |
| **Works by pasting** | TypeBridge writes to the clipboard and simulates `Cmd+V`, keeping it compatible with VS Code, Terminal, browsers, Obsidian, Slack, and more. |
| **Image support** | Images sent through IM channels are injected via the system clipboard. |
| **Optional auto-submit** | After pasting, TypeBridge can press `Enter` or a custom key. Handy for chat windows, terminals, and AI assistants. |

## 🔄 How it works

1. Launch TypeBridge on your Mac and start a WebChat session.
2. Scan the QR code on your phone, enter the OTP, and switch to typing or trackpad mode.
3. Type, use voice input, or control the cursor — your Mac responds instantly.
4. With auto-submit enabled, TypeBridge sends `Enter` or your configured key after each paste.
5. You can also use Feishu, DingTalk, or WeCom bots — messages go into the same FIFO queue.

## 📡 Supported channels

| Channel | What you need | Best for |
|---|---|---|
| **WebChat** | No account. Start a session and scan the QR code. | Personal use, quick trials, offline workflows |
| **Feishu** | Self-built app (App ID + Secret) | Teams already using Feishu |
| **DingTalk** | Internal app (Client ID + Secret, Stream Mode) | Teams already using DingTalk |
| **WeCom** | Smart Bot (Bot ID + Secret) | Teams already using WeCom |

## 🖥️ System requirements

macOS 13+ (Apple Silicon or Intel)

On first launch, TypeBridge asks for **Accessibility** permission. It is used to send `Cmd+V` and optional submit keys to the frontmost app; TypeBridge does not read or monitor your screen.

## 🛠️ Development

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
```

### Development notes

- **Go sidecars require manual rebuild** — `tauri dev` does not recompile Go. After editing `.go` files, run `go build` for the affected bridge, then restart `tauri dev`.
- **Frontend HMR** works automatically for `src/` changes.
- **Rust changes** are picked up automatically by `tauri dev` (cargo rebuild).

### Build & Package

```bash
# Single arch
npm run tauri build -- --target aarch64-apple-darwin

# Both archs
./scripts/build-all.sh
```

Output: `src-tauri/target/{arch}/release/bundle/dmg/TypeBridge_*.dmg`

## 📄 License

[MIT](LICENSE)
