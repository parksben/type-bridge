# TypeBridge

> macOS 菜单栏应用：接收飞书机器人消息，自动写入你当前聚焦的输入框。

典型场景：手机上用飞书发一段语音（转文字），桌面端同步将文本写入正在用的编辑器 / 终端 / 浏览器输入框，默认注入完即模拟一次 `Enter` 完成一键发送——实现"语音驱动桌面输入"。

详细功能规格见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)，技术方案见 [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)。

---

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| macOS | 13+ | Apple Silicon 优先，Intel 需额外交叉编译 Go 二进制 |
| Node.js | 20+ | 建议使用 nvm 管理 |
| Rust | stable（1.95+） | 首次安装用 `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Go | 1.21+ | `brew install go` |
| Xcode Command Line Tools | 必需 | `xcode-select --install` |

### 国内网络镜像（可选但推荐）

已在用户 dotfiles / 本项目构建命令中约定使用的镜像：

- **npm** → `https://registry.npmmirror.com`
- **Cargo** → USTC sparse index（`~/.cargo/config.toml`）
- **Rustup** → `RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static`
- **Go** → `GOPROXY=https://goproxy.cn,direct`
- **Homebrew** → `HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles`

---

## 快速开始

```bash
# 安装前端依赖
npm install

# 首次编译 Go sidecar（aarch64-apple-darwin）
cd feishu-bridge
GOPROXY=https://goproxy.cn,direct go build \
  -o ../src-tauri/binaries/feishu-bridge-aarch64-apple-darwin .
cd ..

# 启动开发模式（首次 Rust 编译约 5–10 分钟，之后秒级增量）
npm run tauri dev
```

应用首次启动会自动弹出配置窗口，填入飞书**自建应用**的 App ID / App Secret 后点"测试连接"即可。

---

## 开发工作流

### 修改前端（React + Tailwind）

改完 `src/**/*.{tsx,ts,css}` 文件 → **Vite HMR 自动热更新**，无需手动重启。

```bash
# 独立的类型检查（比 tauri dev 更快）
npx tsc --noEmit
```

### 修改 Rust 后端

改完 `src-tauri/src/**/*.rs` → `tauri dev` 自动重新编译并重启应用。

```bash
# 独立的快速编译检查（比 tauri dev 快很多）
cd src-tauri && cargo check
```

### 修改 Go sidecar

**`tauri dev` 不会自动重编 Go 代码。** 改完 `feishu-bridge/*.go` 必须手动重编，然后重启 `tauri dev`：

```bash
cd feishu-bridge
GOPROXY=https://goproxy.cn,direct go build \
  -o ../src-tauri/binaries/feishu-bridge-aarch64-apple-darwin .
```

### 修改 `tauri.conf.json` 或 `capabilities/*.json`

需要 Ctrl+C 停掉 `tauri dev`，再重启（配置文件只在启动时读）。

---

## 调试

| 要调什么 | 方法 |
|---------|------|
| 前端逻辑 / React state | 应用窗口里按 `Cmd + Option + I` 打开 DevTools |
| Rust 日志 | `tracing::info!` / `println!` 输出到运行 `tauri dev` 的终端 |
| Go sidecar 日志 | 由 Rust 捕获其 stdout 并以 `[sidecar]` 前缀转发到同一终端 |
| 应用运行时文件日志 | `~/Library/Logs/TypeBridge/typebridge-YYYY-MM-DD.log`（按天滚动，保留 30 天） |
| 应用内日志窗口 | 托盘菜单 → "消息日志" |
| 持久化配置 | `~/.typebridge/config.json`（通过 `tauri-plugin-store` 写入） |

---

## 打包

### 双架构分别出包（默认推荐）

仓库内 [`scripts/build-all.sh`](scripts/build-all.sh) 一条命令搞定 Apple Silicon + Intel 两个 `.dmg`：

```bash
./scripts/build-all.sh
```

脚本会：
1. 检查并按需安装 `x86_64-apple-darwin` Rust target
2. 交叉编译 Go sidecar 两份二进制（arm64 + amd64）
3. 分别跑 `npm run tauri build -- --target aarch64-apple-darwin` 和 `-- --target x86_64-apple-darwin`
4. 列出两个 `.dmg` 产物路径

### 单独某个架构

```bash
# 仅 Apple Silicon
npm run tauri build -- --target aarch64-apple-darwin

# 仅 Intel（首次需 rustup target add x86_64-apple-darwin）
npm run tauri build -- --target x86_64-apple-darwin
```

产物位置：
- `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/TypeBridge_*.dmg`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/TypeBridge_*.dmg`

> 真机分发需要 Apple Developer 证书签名，否则 Gatekeeper 会拦截辅助功能权限申请。详见 [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)。

---

## 项目结构

```
type-bridge/
├── src/                          React 前端
│   ├── components/
│   │   ├── ConfigWindow.tsx      配置 & 连接窗口
│   │   ├── LogWindow.tsx         日志窗口
│   │   └── ConfirmOverlay.tsx    输入前确认浮层
│   ├── store/index.ts            Zustand 全局状态（前端侧）
│   ├── styles/globals.css        设计 tokens + 组件样式
│   └── main.tsx
│
├── src-tauri/                    Tauri / Rust 后端
│   ├── src/
│   │   ├── lib.rs                入口 + plugin 注册 + AppState
│   │   ├── tray.rs               托盘图标 + 窗口生命周期
│   │   ├── sidecar.rs            feishu-bridge 进程管理 + 事件派发
│   │   ├── injector.rs           AXUIElement + CGEventPost 注入
│   │   ├── store.rs              凭据和设置持久化
│   │   ├── notification.rs       系统推送
│   │   └── logger.rs             按天滚动日志
│   ├── binaries/                 Go sidecar 编译产物（不入库）
│   ├── capabilities/             Tauri 权限声明
│   └── tauri.conf.json
│
├── feishu-bridge/                Go sidecar 源码
│   ├── main.go                   入口：读环境变量，建立长连接
│   ├── handler.go                消息分发：text / image / post
│   └── go.mod
│
└── docs/
    ├── REQUIREMENTS.md           做什么、为什么
    └── TECH_DESIGN.md            怎么做、为什么选这个方案

scripts/
└── build-all.sh                  一键双架构打包
```

架构大图与跨层 event 契约见 [CLAUDE.md](CLAUDE.md)。

---

## 权限

- **Accessibility（辅助功能）** — 检测焦点输入框并注入文字。首次注入前应用会主动引导跳转「系统设置 → 隐私与安全性 → 辅助功能」。
- **Notifications（通知）** — 无焦点输入框时系统推送提示。应用启动时申请。
- **Network** — 连接飞书开放平台、下载图片。Tauri 默认允许。

---

## 常见问题

**Q: 改了 Go 代码但行为没变？**
A: Tauri 不监听 Go 文件。必须手动跑 `go build` 重新生成二进制，再重启 `tauri dev`。

**Q: 首次 `tauri dev` 卡在 `Compiling tauri v2.x` 很久？**
A: 首次会编译 400+ Rust 依赖，5–10 分钟正常。之后有 `target/` 缓存就秒级。

**Q: 应用启动后托盘看不见？**
A: macOS 菜单栏图标可能被 Bartender / 系统刘海挤出显示区域。托盘 id 是 `main-tray`，运行后用菜单栏管理工具找一下。

**Q: "测试连接"之后一直是"连接中"？**
A: 检查 `tauri dev` 终端里 `[sidecar]` 前缀的日志。常见原因：App ID / Secret 错误、应用没启用"事件订阅 v2 长连接"、网络到飞书开放平台不通。

**Q: 注入到 VSCode / 浏览器输入框后内容被覆盖？**
A: 应该不会 —— 项目用 `CGEventPost` 模拟按键而非 `AXSetValue`。若遇到请在 issue 里附上目标应用名。

---

## 开发协作约定

本仓库遵循严格的工作约定，详见 [CLAUDE.md](CLAUDE.md)：

- **先文档后代码**：任何改动先更 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) / [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)，再动代码；README 也属于一级文档，构建/环境/结构/功能描述有变必须同 commit 更新
- **小步 commit + 即时 push**：每个功能点独立 commit，commit 后立即 push
- **UI 图标一律用 lucide-react**：禁止 emoji 或装饰性 unicode 字符作为 UI 元素

---

## License

TBD
