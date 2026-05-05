# TypeBridge

> macOS 菜单栏应用：接收飞书 / 钉钉 / 企业微信 / 官方 WebChat 网页机器人消息，自动写入你当前聚焦的输入框。

典型场景：手机上用任一家 IM（或扫桌面 QR 码进官方 WebChat 网页）给机器人发一段语音（转文字），桌面端同步将文本写入正在用的编辑器 / 终端 / 浏览器输入框，默认注入完即模拟一次 `Enter` 完成一键发送——实现"语音驱动桌面输入"。

四个渠道平等共存，消息进同一个 FIFO 队列依次粘到当前焦点。消息入队 / 成功 / 失败都会给来源侧一个可见反馈（飞书 emoji reaction；钉钉一次性 `✅ 已输入` / `❌ 输入失败`；企微同一条消息原地从 `🟡 处理中...` 更新为 `✅ 已输入` / `❌ 输入失败`；WebChat 在手机聊天页消息底部显示 `已收到` / `已注入` / `失败：原因`）。

> WebChat 渠道无需任何 IM 账号 —— 桌面端启动会话时在本机起一个局域网 HTTP + Socket.IO server，手机在同一 WiFi 下扫码 + 输 OTP 即可开聊。完全不依赖任何云端服务。

🌐 产品官网：[typebridge.parksben.xyz](https://typebridge.parksben.xyz) — 包含使用文档和各渠道应用接入教程。

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

# 首次编译三个 Go sidecar（aarch64-apple-darwin）
for bridge in feishu-bridge dingtalk-bridge wecom-bridge; do
  (cd "$bridge" && GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 \
    go build -o "../src-tauri/binaries/${bridge}-aarch64-apple-darwin" .)
done

# 启动开发模式（首次 Rust 编译约 5–10 分钟，之后秒级增量）
npm run tauri dev
```

应用首次启动会自动弹出配置窗口。在「连接 TypeBridge」tab 下任选一家填好凭据即可：
- WebChat：无需凭据，点「启动会话」在本机启动局域网服务，手机同 WiFi 扫码即用
- 飞书：App ID / App Secret（仅支持自建应用）
- 钉钉：Client ID / Client Secret（Stream Mode）
- 企微：Bot ID / Secret（智能机器人长连接模式）

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

**`tauri dev` 不会自动重编 Go 代码。** 改完 `{feishu,dingtalk,wecom}-bridge/*.go` 必须手动重编对应 sidecar，然后重启 `tauri dev`：

```bash
# 例：改了 wecom-bridge
cd wecom-bridge
GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 \
  go build -o ../src-tauri/binaries/wecom-bridge-aarch64-apple-darwin .
```

### 修改 `tauri.conf.json` 或 `capabilities/*.json`

需要 Ctrl+C 停掉 `tauri dev`，再重启（配置文件只在启动时读）。

### 官网开发 (`website/`)

```bash
cd website
npm install        # 首次需要
npm run dev        # Next.js 开发模式，http://localhost:3000
```

官网是独立的 Next.js 项目，修改 `website/**/*.tsx` 会自动热更新。部署到 Netlify 后访问 `typebridge.parksben.xyz`。

### 新版单页落地页 (`website-v2/`)

```bash
cd website-v2
npm install        # 首次需要
npm run dev        # Next.js 开发模式，http://localhost:3000
```

`website-v2/` 是**单页滚动营销站**，与旧版多页文档站 `website/` 并存。定位差异见 [docs/REQUIREMENTS.md §9.8](docs/REQUIREMENTS.md)。当前仍以旧站为线上官网，新站跑通后再切换。

### WebChat 移动端 SPA (`webchat-local/`)

```bash
cd webchat-local
npm install        # 首次需要
npm run build      # 一次性构建，产物在 dist/（被 Tauri resource 打包）
# 或独立开发：
npm run dev        # Vite 开发模式，http://localhost:5173
```

`webchat-local/` 是独立的 Vite + React + TypeScript SPA 工程，是 WebChat 渠道的移动端页面源码。

**完整工作流**（生产）：
- `npm run tauri build` 会自动先跑 `webchat-local` 的 `npm install && npm run build`，再打包主 App；构建产物 `webchat-local/dist/` 通过 `tauri.conf.json` 的 `bundle.resources` 映射到 .app 内 `Resources/webchat-local/dist/`
- 运行时由桌面 App 内嵌的 Rust server（`axum + socketioxide + tower-http ServeDir`）从本机 8723 端口提供
- **不部署到任何公网**，完全本地化运行

**开发模式**（`npm run tauri dev`）：
- 根 `package.json` 的 `dev` 脚本通过 `concurrently` 同时拉起两个 Vite：桌面 (1420) + WebChat SPA (5173，`host: 0.0.0.0` LAN 可达)
- WebChat 桌面 server 在 `cfg!(debug_assertions)` 下会把所有非 `/socket.io/*` 的 HTTP 请求 **302 重定向到 5173**（同时把 `apiPort=<server_port>` 追加到 query），手机端从 Vite dev server 加载页面 → **HMR 原生工作，改源码无需手动刷新 / 重新 `npm run build`**
- Socket.IO 仍然连桌面 server（跨源；CORS 已 permissive），消息链路正常
- 真机联调：手机和电脑同一 WiFi，扫桌面 App 显示的 QR 码即可（URL 形如 `http://192.168.x.x:8723/?s=ses_xxx`，浏览器会被 302 到 5173）
- 生产 build (`npm run tauri build`)：上述 dev redirect 不生效，桌面 server 直接 `ServeDir` 加载 `webchat-local/dist/`

---

## 调试

| 要调什么 | 方法 |
|---------|------|
| 前端逻辑 / React state | 应用窗口里按 `Cmd + Option + I` 打开 DevTools |
| Rust 日志 | `tracing::info!` / `println!` 输出到运行 `tauri dev` 的终端 |
| Go sidecar 日志 | 由 Rust 捕获其 stdout 并以 `[sidecar]` 前缀转发到同一终端 |
| WebChat 本地 server 日志 | `[webchat]` 前缀；启动时会输出 `Server started at http://<LAN-IP>:<port>` |
| 应用运行时文件日志 | `~/Library/Logs/TypeBridge/typebridge-YYYY-MM-DD.log`（按天滚动，保留 30 天） |
| 应用内日志窗口 | 主窗口侧边栏 → "系统日志" tab |
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

### CI 自动发布

推送 `v*` 格式的 tag 或通过 GitHub Actions UI 手动触发 `Release` workflow，即可自动完成双架构构建并发布到 [GitHub Releases](https://github.com/parksben/type-bridge/releases)。详见 [docs/REQUIREMENTS.md §8](docs/REQUIREMENTS.md#八-cicd-发布流水线)。

> 真机分发需要 Apple Developer 证书签名，否则 Gatekeeper 会拦截辅助功能权限申请。详见 [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)。

---

## 项目结构

```
type-bridge/
├── src/                          React 前端
│   ├── components/
│   │   ├── MainWindow.tsx        主窗口（SideBar + 4 tab 路由）
│   │   ├── SideBar.tsx           左侧导航（连接 / 输入设置 / 历史 / 日志）
│   │   ├── ConnectionHub.tsx     连接 tab 内的四渠道子 tab 容器（WebChat / 飞书 / 钉钉 / 企微）
│   │   ├── tabs/                 各 tab 页面（WebChat / Feishu / DingTalk / WeCom Connection、Input、History、Log）
│   │   ├── HistoryCard.tsx       单条历史消息卡片
│   │   ├── SelftestChecklist.tsx selftest 结果清单（按渠道差异化）
│   │   ├── StatusTag.tsx / ChannelTag.tsx / KeyBindInput.tsx / AccessibilityGate.tsx / ErrorBoundary.tsx
│   │   └── LogWindow.tsx         独立日志窗口
│   ├── store/index.ts            Zustand 全局状态（前端侧）
│   ├── styles/globals.css        设计 tokens + 组件样式
│   └── main.tsx
│
├── src-tauri/                    Tauri / Rust 后端
│   ├── src/
│   │   ├── lib.rs                入口 + plugin 注册 + AppContext
│   │   ├── channel.rs            ChannelId + Capability + 复合 id 工具
│   │   ├── tray.rs               托盘 icon（无下拉菜单，单击唤起窗口）
│   │   ├── window.rs             主窗口生命周期 + Dock click 唤回
│   │   ├── sidecar.rs            飞书 / 钉钉 / 企微 sidecar 进程管理 + 事件派发
│   │   ├── webchat.rs            WebChat 渠道本机 server 宿主
│   │   ├── queue.rs              注入队列 + worker + 反馈（reaction / reply）
│   │   ├── history.rs            消息历史持久化（history.json + 图片归档）
│   │   ├── injector.rs           AXUIElement + CGEventPost 注入
│   │   ├── store.rs              凭据和设置持久化
│   │   ├── notification.rs       系统推送
│   │   └── logger.rs             按天滚动日志
│   ├── binaries/                 Go sidecar 编译产物（不入库）
│   ├── capabilities/             Tauri 权限声明
│   └── tauri.conf.json
│
├── feishu-bridge/                飞书 Go sidecar 源码
├── dingtalk-bridge/              钉钉 Go sidecar 源码
├── wecom-bridge/                 企微 Go sidecar 源码（手写 WSS + AES 图片解密）
│
├── website/                      产品官网 (Next.js，多页文档站，当前线上)
│   ├── netlify.toml              Netlify 零手动部署配置
│   ├── app/                      Next.js 15 App Router
│   │   ├── page.tsx              首页 (Hero / 工作原理 / 特性 / 接入教程 / 下载)
│   │   ├── docs/
│   │   │   ├── page.tsx          文档中心（四渠道导航入口）
│   │   │   ├── webchat/page.tsx  WebChat 接入教程（自维护）
│   │   │   ├── feishu/page.tsx   飞书自建应用接入教程（自维护）
│   │   │   ├── dingtalk/page.tsx 钉钉企业内部应用接入教程（自维护）
│   │   │   └── wecom/page.tsx    企业微信自建应用接入教程（自维护）
│   │   └── download/[arch]       GitHub Release .dmg 代理转发
│   └── package.json
│
├── website-v2/                   新版单页营销站 (Next.js，与 website/ 并存)
│   ├── app/
│   │   ├── page.tsx              单页拼装 (Hero / 使用场景 / 流程 / 下载)
│   │   ├── components/           TopNav / Hero / Scenes / Flow / Download / Footer
│   │   └── download/[arch]       GitHub Release .dmg 代理转发（同 website/）
│   ├── netlify.toml
│   └── package.json
│
├── webchat-local/                WebChat 移动端 SPA (Vite + React + TS)
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx               状态机路由（PC 拦截 / 握手 / 聊天）
│   │   ├── lib/                  UA 检测 / socket.io-client 封装
│   │   └── components/           OTP 输入 / 消息流 / 文本/图片/语音引导
│   └── package.json              （构建产物 dist/ 打包进 .app，不入库）
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

- **Accessibility（辅助功能）** — 用于 `CGEventPost` 模拟 `Cmd+V` 粘贴 + 自定义"提交按键"。macOS TCC 对跨应用按键事件要求此权限。启动即检查，未授予时配置 tab 顶部展示 banner 引导跳转系统设置。
- **Network** — 连接飞书开放平台、下载图片。Tauri 默认允许。

---

## 常见问题

**Q: 改了 Go 代码但行为没变？**
A: Tauri 不监听 Go 文件。必须手动跑 `go build` 重新生成二进制，再重启 `tauri dev`。

**Q: 首次 `tauri dev` 卡在 `Compiling tauri v2.x` 很久？**
A: 首次会编译 400+ Rust 依赖，5–10 分钟正常。之后有 `target/` 缓存就秒级。

**Q: 应用启动后托盘看不见？**
A: macOS 菜单栏图标可能被 Bartender / 系统刘海挤出显示区域。托盘 id 是 `main-tray`，运行后用菜单栏管理工具找一下。点 Dock 图标也能唤起窗口（v0.7.x 起 `RunEvent::Reopen` handler 已修复 Dock click 不响应的 bug）。

**Q: "测试连接"之后一直是"连接中"？**
A: 检查 `tauri dev` 终端里 `[sidecar]` 前缀的日志。常见原因：App ID / Secret 错误、应用没启用"事件订阅 v2 长连接"、网络到飞书开放平台不通。

**Q: 注入到 VSCode / 浏览器输入框后内容被覆盖？**
A: 应该不会 —— 项目用 `CGEventPost` 模拟按键而非 `AXSetValue`。若遇到请在 issue 里附上目标应用名。

**Q: WebChat tab 提示"启动会话"失败？**
A: 看终端 `[webchat]` 前缀日志查具体错误。常见原因：端口 8723-8732 全被占用（换端口 / 关其他应用）、无法获取 LAN IP（电脑没连 WiFi / 有线）。

**Q: 手机扫了 WebChat 的 QR 但打不开页面？**
A: 确认手机和电脑在**同一个 WiFi** 下。WebChat 服务绑在本机局域网 IP，跨 WiFi / 跨网段访问不到。不方便切 WiFi 时请改用飞书/钉钉/企微渠道。

**Q: WebChat 聊天页的语音按钮点了没反应？**
A: WebChat 不自研语音识别。点语音会弹提示引导用**手机输入法自带的麦克风按钮**（搜狗/百度/讯飞/iOS 系统键盘都内置）完成语音转文字。

---

## 开发协作约定

本仓库遵循严格的工作约定，详见 [CLAUDE.md](CLAUDE.md)：

- **先文档后代码**：任何改动先更 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) / [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md)，再动代码；README 也属于一级文档，构建/环境/结构/功能描述有变必须同 commit 更新
- **小步 commit + 即时 push**：每个功能点独立 commit，commit 后立即 push
- **UI 图标一律用 lucide-react**：禁止 emoji 或装饰性 unicode 字符作为 UI 元素

---

## License

TBD
