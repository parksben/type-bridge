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

- 目标平台：macOS 13+，**双架构分别出包**：`aarch64-apple-darwin`（Apple Silicon）+ `x86_64-apple-darwin`（Intel）
- 打包产物：两个独立 `.dmg` 安装包（不使用 universal binary，避免体积翻倍 + lipo 合并的额外复杂度）
- 代码签名：需要 Apple Developer 证书（否则 Gatekeeper 拦截辅助功能权限申请）

### 4.1 Go sidecar 双架构编译

两份独立二进制放入 `src-tauri/binaries/`：

```bash
cd feishu-bridge
GOOS=darwin GOARCH=arm64 go build \
  -o ../src-tauri/binaries/feishu-bridge-aarch64-apple-darwin .
GOOS=darwin GOARCH=amd64 go build \
  -o ../src-tauri/binaries/feishu-bridge-x86_64-apple-darwin .
```

Tauri `externalBin: ["binaries/feishu-bridge"]` 会在 `cargo build --target <triple>` 时自动按 triple 后缀选对应二进制，无需改配置。

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

仓库内提供 [`scripts/build-all.sh`](../scripts/build-all.sh)：顺序完成"检查 Rust target → 双架构 Go 编译 → 双架构 Tauri 打包 → 列产物"全流程。开发期按需用。

---

## 五、已确认决策汇总

| 决策点 | 结论 |
|--------|------|
| 飞书应用类型 | **自建应用**（长连接仅支持自建，已确认） |
| 消息类型范围 | 纯文本直接注入；图片下载后写剪贴板 + Cmd+V 粘贴 |
| 输入前确认 | **v0.4.3 已移除**。曾提供 `confirm_before_inject` toggle + ConfirmOverlay 浮层，实测开启后浮层本身抢焦点 → 粘贴目标丢失。整套逻辑（toggle / overlay / 队列等待确认分支 / `feishu://confirm-request` event）全部清理，队列始终走 `Queued → Processing → Sent/Failed` 线性路径 |
| 消息卡片发送人展示 | **不展示**。WebSocket 事件里 `sender.sender_id.user_id` 是 opaque 的 `ou_xxx`，要拿真实用户名必须调 `client.Contact.User.Get`，需要 `contact:user.base:readonly` scope。评估后认为"加一个权限只为显示昵称"收益 / 风险比差，直接去掉卡片上的 `@sender` 展示。内部仍保留 `HistoryMessage.sender` 字段（装 user_id），供日志/调试使用 |
| 配置窗口关闭行为 | 拦截 `WindowEvent::CloseRequested`，调用 `prevent_close()` + `hide()`，应用退入 Dock + 托盘但不销毁窗口（保留 React state）。Dock 单击通过 `RunEvent::Reopen` 唤回窗口；托盘单击同样调 `show_or_create_main_window` |
| 托盘图标设计 | `logo-tray.svg` 任源：橙红渐变(#f2682b→#d9480f)圆角矩形底 + 白色桥拱(stroke)，背景与前景色与 app icon 白底橙桥配色反转。生成 44×44 px PNG（视觉面积约 22pt），适配 macOS 菜单栏标准高度（~24pt）。图标通过 `include_bytes!` 编译期嵌入 `tray.rs`，`tauri.conf.json` 中不声明 `trayIcon`（声明会先于 `setup()` 用运行时路径创建图标，与编译期嵌入冲突→旧图标残留）。**v0.7.x 起托盘不挂下拉菜单**——参考微信桌面端，单击直达窗口；Cmd+Q / Dock 右键退出已经覆盖了"退出应用"诉求 |
| UI 架构 | 单主窗口 + 3 tab（连接 / 消息历史 / 系统日志），废弃独立日志窗口 |
| 消息队列 | 严格串行 FIFO，单 worker 消费；失败不自动重试，由用户手动重发 |
| 消息历史存储 | JSON 文件（`~/.typebridge/history.json`）+ 图片独立目录；上限 500 条，FIFO 淘汰 |
| 飞书回复 | 表情反应为主（EYES / DONE / SAD 或飞书等价值）；仅失败时额外在 thread 下回复文字说明 |
| 输入后自动提交 | 默认**开启**；注入完成后用 CGEventPost 模拟按下用户自定义的"提交按键"（默认 Enter）。按键存 e.code + 四个 modifier flag；Rust 侧维护 e.code → macOS virtual keycode 映射表 |
| 双架构打包 | 分别出 `aarch64-apple-darwin` 和 `x86_64-apple-darwin` 的 `.dmg`，不走 universal binary；Go sidecar 按 target triple 提前交叉编译 |

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
  "dingtalk_client_id": "dingxxxx",
  "dingtalk_client_secret": "xxxx",
  "auto_submit": true,
  "submit_key": "enter"
}
```

Rust 侧提供两个 command 供前端调用：

```rust
#[tauri::command]
fn get_settings() -> Settings { ... }

#[tauri::command]
fn save_settings(settings: Settings) { ... }
```

设置变更后立即生效，无需重启。

---

## 八、UI 设计语言

> 目标：跳出"AI slop"通用美学（紫色渐变、Inter 字体、卡片堆叠），呈现一个有"工艺感"的 macOS 原生工具。

### 8.1 风格基调

**精炼极简 + 文学衬线点缀**（参考 Linear / Raycast / 1Password 的克制 + Anthropic 自家文档的温暖衬线）。

不走以下任何一种通用路线：
- ❌ Tailwind 默认蓝紫主色（`bg-blue-500` / `bg-indigo-600`）
- ❌ 卡片 + 阴影 + 圆角 12px 的标准 SaaS 模板
- ❌ Inter / Roboto 等大流量字体堆叠
- ❌ 居中标题 + 副标题 + CTA 三段式落地页结构

### 8.2 字体方案

| 用途 | 字体 | 来源 |
|------|------|------|
| Brand 标题（"TypeBridge"字样 + 桥拱 SVG 图标） | **Geist Sans Bold**（不再使用衬线体） | Google Fonts |
| 正文 / UI / 标签 | **Geist** | Google Fonts |
| 等宽（App ID 占位、日志时间戳） | **Geist Mono** | Google Fonts |

通过 `index.html` 引入（用 [bunny.net Fonts](https://fonts.bunny.net) 镜像 Google Fonts，国内可达且 GDPR 友好；Tauri webview 加载，无需额外 CSP 配置）：

```html
<link rel="preconnect" href="https://fonts.bunny.net">
<link href="https://fonts.bunny.net/css?family=geist:400,500,600|geist-mono:400,500|instrument-serif:400i&display=swap" rel="stylesheet">
```

字体加载失败时通过 CSS `font-family` fallback 链回退到 macOS 系统字体（`-apple-system, SF Pro Display, SF Pro Text, SF Mono`），保证最差情况下仍有 macOS 原生质感。

**品牌显示策略**：品牌标识使用 Geist Sans Bold（不再使用 Instrument Serif Italic）。导航栏 Logo 为桥拱 SVG 图标 + "TypeBridge" 加粗文字，与 accent 色联动。页面标题中需要强调的关键词（如"自动输入""原理""特性"等）也使用 `font-bold` + accent 色，保持中文站点的现代 sans-serif 视觉一致性。衬线体已全面移除——中文站点衬线斜体观感不佳，且与整体 Geist sans 体系冲突。

### 8.3 配色（CSS 变量 + dark mode 跟随系统）

```css
:root {
  --bg:        #faf9f6;    /* 暖白，不是纯白 */
  --surface:   #ffffff;
  --border:    #e7e5e1;
  --text:      #18181b;
  --muted:     #71717a;
  --accent:    #c2410c;    /* 暖橙 — 跳出蓝紫主流 */
  --accent-fg: #ffffff;
  --success:   #16a34a;    /* connected 状态 */
  --idle:      #a1a1aa;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:        #0e0e10;
    --surface:   #18181b;
    --border:    #27272a;
    --text:      #fafafa;
    --muted:     #a1a1aa;
    --accent:    #fb923c;
    --success:   #34d399;
    --idle:      #52525b;
  }
}
```

只用一个 accent 色（暖橙），辅以 success（绿）和 idle（灰）。**不引入第二个品牌色**——单色克制是质感来源。

### 8.4 视觉细节

- **窗口背景**：暖白 / 深灰底色 + 极轻 SVG 噪点纹理（opacity 4%）增加肌理感
- **输入框**：rest 状态低对比度（`bg-surface` + 1px `border`）；focus 时 accent 色 1.5px ring + 微 shadow
- **状态点**：12px 圆点，`connected` 时带 1.5s 慢呼吸 box-shadow 脉冲（CSS keyframes）
- **按钮**：accent 实色填充 + `box-shadow inset 0 -1px 0 rgba(0,0,0,.15)`（轻按压感）；hover 时 `translateY(-0.5px)` + 加深阴影
- **Toggle**：原生风格 segmented switch，颜色用 accent
- **入场动画**：窗口出现时整体 opacity 0→1 + translateY(4px)→0 over 240ms ease-out

### 8.5 实现路径

- 全局样式集中在 `src/styles/globals.css`（含 `@tailwind` 三件套 + CSS 变量 + 噪点 SVG data URL + keyframes）
- Tailwind config 用 `colors: { bg: 'var(--bg)', surface: 'var(--surface)', ... }` 把变量暴露成工具类
- 不引入 Framer Motion 等额外库，纯 CSS transition / animation 即可
- 字体使用 bunny.net Fonts CDN（国内可达），fallback 到 macOS 系统字体确保离线/弱网场景仍有 native 质感

### 8.6 图标规范（icon 强约束）

- 所有 UI 图标统一使用 [`lucide-react`](https://lucide.dev)
- **禁止**在 JSX / 模板中使用 emoji 或装饰性 unicode（`✓` `✗` `→` `←` `◌` `●` `⌘` `⚠` 等）作为 UI 元素
- **禁止**引入第二个 icon 库（Heroicons / Phosphor / Feather / FontAwesome / react-icons 等）
- 状态指示等几何元素（CSS 圆点 + 动画）不算 icon，可继续使用
- 文档（`.md`）、commit message、控制台日志字符串中允许 emoji（不属于"渲染 UI"）
- 图标尺寸约定：行内文本旁 14px、按钮内 16px、卡片标题旁 18px，统一 `strokeWidth={1.75}`（与 Geist 字体笔画粗细一致）

本约定属于全局工作流（参见 `~/.claude/skills/coding-plan`），项目级 [CLAUDE.md](../CLAUDE.md) 已同步声明。

### 8.7 App Logo 与图标资产

**Logo 设计**：桥拱 + 双支柱，暖橙渐变（`#f2682b → #d9480f → #9c340b`），线条圆头收边，负空间暗示光标形态。对应"桥接飞书消息 → 输入框"的产品隐喻。

**源文件**（SVG，位于 `public/`）：
- `logo-appicon.svg` — 应用图标，1024×1024 画布，macOS HIG squircle 形状已 bake 进 SVG
- `logo-tray.svg` — 托盘图标（64×64 viewBox），橙红渐变底 + 白色桥拱

**App icon 几何规范**（macOS HIG）：
- 画布 1024×1024，**四周保留 100px 透明 padding**
- 内容居中于 824×824 squircle body，圆角 ~185px（约 22.37% body 宽度）
- macOS **不会**自动给 app icon 切圆角（与 iOS 不同），squircle 形状必须自己烤进资源里——之前误以为系统会自动加 mask，结果生成的图标是直角矩形铺满画布，dock 中显示比邻居大约 1.24 倍且无圆角
- 桥拱几何坐标按 `(x − 512) × 0.805 + 512` 从画布中心整体缩放，确保留出 padding

**网站 Logo**：导航栏和 Footer 均使用桥拱 SVG（简化路径 `M 16 46 L 16 22 A 16 16 0 0 1 48 22 L 48 46`，stroke `var(--tb-accent)`）+ "TypeBridge" 加粗文字组合。桥拱路径源自 tray icon SVG，视觉上与应用/托盘图标保持一致。

**生成方式**（任选其一）：
- **首选** `npx tauri icon <path-to-1024.png>` — Tauri CLI 一键生成 32x32 / 128x128 / 128x128@2x / `.icns` / `.ico`。先用 `sharp` 把 `logo-appicon.svg` 渲染成 1024 PNG 喂给它即可
- **备选** `scripts/generate-icons.py`（依赖 `cairosvg` + `Pillow`，需在 `.venv-icons/` 中运行），一键重生成全部 PNG + `.icns` + `.ico` + `tray-icon.png`
- 注意 `tauri icon` 默认会额外生成 Windows / iOS / Android 的 `Square*Logo.png` / `StoreLogo.png` / `icon.png` / `android/` / `ios/` 等资源，因为本项目只发 macOS，需要清理掉这些多余文件，保留 `tauri.conf.json bundle.icon` 引用的 5 个文件 + `tray-icon.png`

**macOS .icns 生成**：通过 `iconutil -c icns` 从临时 `.iconset` 目录打包（10 种尺寸：16/32/128/256/512 @1x/@2x）；`tauri icon` 内部已封装这一步。

**DMG 安装背景**：`public/dmg-background.svg` 是安装窗口背景源文件，设计画布为 760×480 pt；`scripts/generate-icons.py` 用 `rsvg-convert` 按 2x 渲染为 `src-tauri/icons/dmg-background.png`（1520×960 px）。PNG 通过 144 DPI metadata 标记为 Retina 资源，让 Finder 以 760×480 pt 显示但在高分屏保持清晰。Tauri `bundle.macOS.dmg` 使用 760×480 的 Finder 窗口，App 图标和 Applications 文件夹分别放在左 / 右两个视觉留白区域中心。背景内只放安装标题、拖拽提示、未公证首次启动提示、品牌装饰与视觉导向，不绘制 App 名称 / Applications 名称，避免与 Finder 自带图标标签重复。

---

## 九、消息队列与状态机

### 9.1 队列模型

单 FIFO 队列 + 单 worker：

```
 Go sidecar stdout
        │ {"type":"message", ...}
        ▼
 sidecar.rs dispatcher
        │
        ├── 写 history（status=Queued）
        ├── emit feishu://history-update（前端刷新列表）
        ├── 发 reaction EYES → Go stdin
        └── 入队 tokio::sync::mpsc::Sender<QueuedMessage>
                             │
                             ▼
             injection_worker（单 tokio task）
                loop { msg = rx.recv().await; process(msg); }
```

**为什么严格单 worker：** 同一时刻只能有一条注入 CGEventPost，多条并发会互相"抢键盘"、目标焦点切换时序会乱。

### 9.2 状态机

```rust
enum MessageStatus {
    Queued,       // 入队，等待 worker 取
    Processing,   // worker 取到，正在注入（含等待用户确认的子阶段）
    Sent,         // 注入成功
    Failed { reason: String },
}
```

状态转换完全由 `injection_worker` 与用户操作（重发）触发，其他地方只读不写。

每次状态变更：
1. 更新 `history.json` 中的记录
2. emit `feishu://message-status` 事件给前端：`{id, status, reason?}`
3. 调用 Go sidecar 发相应表情反应（详见 §10）

### 9.3 状态转换轨迹

消息一进队就走 `Queued → Processing → Sent/Failed` 的线性流程，worker 直接消费、无中间人工闸门。（v0.4.3 曾存在 `confirm_before_inject` 开关和 ConfirmOverlay 浮层，实测开启后弹窗会抢焦点导致粘贴目标丢失，已完全移除。）

### 9.4 重发

用户在消息历史 tab 点"重发"：

1. 检查消息状态为 Sent 或 Failed（排队中的消息不允许重发）
2. 重置为 Queued，更新 updated_at
3. 重新入队（不改变 `id`，同一条消息的历史只有一条记录，每次重发覆盖之前的状态）
4. 触发整条状态机流水

---

## 十、飞书双向回复

### 10.1 通信方向

v0.1 架构：Rust ↔ Go 仅 **Rust ← Go（stdout 单向）**。
v0.3 架构：增加 **Rust → Go（stdin 双向）**，Rust 侧向 Go sidecar stdin 写 JSON Lines 命令。

```
Rust ──stdin JSON Lines──► Go sidecar
Rust ◄─stdout JSON Lines── Go sidecar
```

### 10.2 Rust → Go 命令协议

```json
{"cmd":"reaction","message_id":"om_xxx","emoji_type":"EYES","replace_prev":true}
{"cmd":"reply","message_id":"om_xxx","text":"失败原因：无焦点输入框"}
```

- `reaction.replace_prev`: 若为 true，先删除 bot 之前给这条消息打的表情再加新的（避免两个表情堆叠）
- `reply`: 在原消息 thread 下回复一条文字消息（使用 `reply_in_thread: true`）

### 10.3 Go sidecar 实现

Go 启一个专门的 goroutine 读 stdin：

```go
go func() {
    decoder := json.NewDecoder(os.Stdin)
    for {
        var cmd Command
        if err := decoder.Decode(&cmd); err != nil { return }
        switch cmd.Cmd {
        case "reaction": handleReaction(ctx, client, cmd)
        case "reply":    handleReply(ctx, client, cmd)
        }
    }
}()
```

**API 调用**（lark-oapi-sdk-golang v3）：

```go
// 表情反应
req := larkim.NewCreateMessageReactionReqBuilder().
    MessageId(cmd.MessageId).
    Body(larkim.NewCreateMessageReactionReqBodyBuilder().
        ReactionType(larkim.NewEmojiBuilder().EmojiType(cmd.EmojiType).Build()).
        Build()).
    Build()
client.Im.MessageReaction.Create(ctx, req)

// Thread 回复
replyReq := larkim.NewReplyMessageReqBuilder().
    MessageId(cmd.MessageId).
    Body(larkim.NewReplyMessageReqBodyBuilder().
        MsgType("text").
        Content(...).
        ReplyInThread(true).
        Build()).
    Build()
client.Im.Message.Reply(ctx, replyReq)
```

### 10.4 emoji_type 取值映射

| 阶段 | Rust 侧常量 | 飞书 emoji_type |
|------|-----------|----------------|
| 收到消息 | `EYES` | `"EYE_SPY"`（👀，待验证；若不存在退回 `"SHOCK"`） |
| 成功 | `DONE` | `"OK"`（✅ 对勾风格） |
| 失败 | `SAD` | `"CRY"` 或 `"SAD"`（❌/🥲） |

> 飞书 emoji_type 的确切枚举值需在开发时打开飞书官方文档 `/open-apis/im/v1/messages/:msg_id/reactions` 确认；若上述值不存在则用兜底值（`OK` → `THUMBSUP`，`CRY` → `NAY`）。代码中用常量集中管理，方便快速调整。

### 10.5 错误处理

- 表情/回复失败（网络抖动 / API 频控 / 权限不足）：记日志不抛异常，主流程继续
- Go sidecar stdin 被关闭：视为命令通道断开，只影响未来的回复，不影响已入队消息的注入

---

## 十一、消息历史持久化

### 11.1 存储格式

单个 JSON 数组文件：`~/.typebridge/history.json`

```json
[
  {
    "id": "om_xxxxxx",
    "received_at": 1730000000,
    "updated_at": 1730000002,
    "sender": "张三",
    "text": "帮我写一个 React 组件",
    "image_path": null,
    "status": "sent"
  },
  {
    "id": "om_yyyyyy",
    "received_at": 1730000010,
    "updated_at": 1730000011,
    "sender": "李四",
    "text": "帮我看看这个错误",
    "image_path": "images/om_yyyyyy.png",
    "status": "failed",
    "failure_reason": "无焦点输入框"
  }
]
```

图片独立目录 `~/.typebridge/images/<message_id>.<ext>`，历史记录只存相对路径。

### 11.2 Rust 模块 `history.rs`

```rust
pub struct HistoryStore {
    path: PathBuf,
    messages: RwLock<Vec<HistoryMessage>>, // 按 received_at 升序存，读取时倒序
}

impl HistoryStore {
    pub fn load() -> Result<Self>;
    pub fn append(&self, msg: HistoryMessage);           // FIFO 淘汰超 500 条
    pub fn update_status(&self, id: &str, status: MessageStatus);
    pub fn delete(&self, id: &str);
    pub fn all_desc(&self) -> Vec<HistoryMessage>;       // 倒序返回
    fn flush(&self);                                     // 序列化到 history.json（写时锁）
}
```

**写时锁** + **整体重写**策略：数据量 500 条 × 平均 500B ≈ 250KB，全文件重写代价可忽略。

**并发安全**：`injection_worker`、Tauri command、Go 消息入口都会写 `HistoryStore`，用 `Arc<HistoryStore>` 共享，内部 `RwLock` 控并发。

### 11.3 新增 Tauri Commands

```rust
#[tauri::command] fn get_history() -> Vec<HistoryMessage>;
#[tauri::command] fn delete_history_message(id: String);
#[tauri::command] fn retry_history_message(id: String);
```

### 11.4 图片缓存清理

- 删除历史消息时，同步删除对应 `images/<id>.<ext>` 文件
- 500 条 FIFO 淘汰时，同步删除被淘汰项的图片
- 启动时做一次扫描：`images/` 下不属于任何历史记录的孤儿图片清理掉（防崩溃残留）

---

## 十二、UI Tab 架构

### 12.1 单主窗口 + 左侧 4-tab SideBar + ConnectionHub

不引入路由库，用 Zustand 存 `activeTab` 枚举，主入口组件 switch。v0.5 布局从"顶部水平 TabBar + 内容区"改为"左侧竖向 SideBar + 右侧内容区"；v0.6+ 再次收敛——将服务配置下原来的 3 个独立 tab（飞书 / 钉钉 / 企微）合并为**单一 sidebar tab + 内容页顶部横向子 tab**。

```ts
type TabId =
  | "connection"  // 连接 TypeBridge（Hub：内容页再分 WebChat/飞书/钉钉/企微）
  | "input"       // 输入设置
  | "history"     // 历史消息
  | "logs";       // 系统日志

// 仅 connection tab 用：内容页横向子 tab 的当前选中
type ConnectionChannel = ChannelId;  // "feishu" | "dingtalk" | "wecom"
```

```tsx
// src/components/MainWindow.tsx
function MainWindow() {
  const tab = useAppStore(s => s.activeTab);
  return (
    <div className="h-screen flex flex-row">
      <SideBar />                                     {/* 左侧 ~150px */}
      <div className="flex-1 overflow-hidden">
        {tab === 'connection' && <ConnectionHub />}   {/* v0.6+ 新 Hub 组件 */}
        {tab === 'input'      && <InputSettingsTab />}
        {tab === 'history'    && <HistoryTab />}
        {tab === 'logs'       && <SystemLogTab />}
      </div>
    </div>
  );
}
```

SideBar 退化为**纯平铺 4 tab**，不再有板块标签头 / 缩进层级——所有"板块"概念移到 ConnectionHub 内部的横向子 tab。

### 12.2 组件拆分

- `src/components/MainWindow.tsx` — 壳
- `src/components/SideBar.tsx` — 左侧平铺 4 tab + 底部连接状态
- `src/components/ConnectionHub.tsx` — **v0.6+ 新增**：连接 TypeBridge 壳（一句话说明 + 横向子 tab + 渠道面板）
- `src/components/tabs/ConnectionTab.tsx` — 连接飞书 Bot 面板
- `src/components/tabs/DingTalkConnectionTab.tsx` — 连接钉钉 Bot 面板
- `src/components/tabs/ComingSoonTab.tsx` — 占位，v0.6 仅企微使用（P3 落地后删除）
- `src/components/tabs/HistoryTab.tsx` — 历史消息
- `src/components/tabs/SystemLogTab.tsx` — 系统日志
- `src/components/tabs/InputSettingsTab.tsx` — 输入设置
- `src/components/HistoryCard.tsx` — 单条消息卡片
- `src/components/ChannelTag.tsx` — 渠道 tag
- `src/components/StatusTag.tsx` — 状态 tag

### 12.3 SideBar 数据结构

```ts
interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: "connection", label: "连接 TypeBridge", icon: Plug },
  { id: "input",      label: "输入设置",   icon: Settings2 },
  { id: "history",    label: "历史消息",   icon: History   },
  { id: "logs",       label: "系统日志",   icon: Terminal  },
];
```

active tab：3px accent 色左竖条 + `surface-2` 背景。不再需要 section label / indented 逻辑。

### 12.4 ConnectionHub 布局

内容区自上而下三段：

```
┌────────────────────────────────────────────┐
│ ⓘ 通过内置 WebChat 或 IM 应用机器人连接 TypeBridge 进行输入  │  ← intro（surface-2 底 + Info icon）
├────────────────────────────────────────────┤
│  飞书  │  钉钉  │  企微                    │  ← 横向子 tab
│  ━━━━                                      │     active 用 2px accent 下划线
├────────────────────────────────────────────┤
│                                            │
│ <当前渠道的配置面板，内部独立滚动>          │
│                                            │
└────────────────────────────────────────────┘
```

子 tab 选中状态存 Zustand `activeConnectionChannel`——切走 sidebar tab 再回来保留选中渠道；默认飞书。

### 12.5 引导 banner（连接飞书 Bot 面板内部）

ConnectionTab 自身内部第一行继续保留「还没有自建应用？先到飞书开发者后台创建一个」的飞书专属引导 banner；它与 ConnectionHub 顶部的一句话说明**不冲突**——后者是跨渠道的通用说明（"IM → 输入桥接"），前者是渠道特定的上手引导。

### 12.6 ComingSoonTab 占位组件

```tsx
interface Props { platform: "dingtalk" | "wecom"; }
```

v0.6 仅企微（wecom）使用。钉钉在 P1 已落地；wecom 在 P3 落地后该组件可删除。

### 12.7 v0.6 重构点（相对 v0.5）

**SideBar 平铺化**：4 板块（其中服务配置下辖 3 子 tab）→ 4 单 tab。TabId enum 从 6 项减少到 4 项。

**ConnectionHub 新建**：把三个渠道的配置面板统一挂在一个 sidebar tab 下，横向子 tab 切换。好处：
1. sidebar 更简洁（一眼看完 4 项，不用视觉解析缩进层级）
2. 跨渠道对比体验（切 tab 无需跳板块，一键看完三家）
3. 为未来加"通用渠道设置"（如全局日志级别）留扩展位

**移除的东西**：
- `SideBar.tsx` 里的 `SECTIONS: Section[]` 数据结构 + section label 渲染逻辑
- `MainWindow.tsx` 里的 `connection-dingtalk` / `connection-wecom` TabId 路由

### 12.8 路由兼容

原先用 `window.location.pathname === "/log"` 区分窗口，现在只有一个窗口，路由判断删除，App.tsx 直接渲染 MainWindow + AccessibilityGate。

---

## 十三、关键 event / command 清单（v0.3）

### Rust → React events

| Event | 载荷 | 触发时机 |
|-------|------|--------|
| `feishu://status` | `{connected}` | 连接/断开 |
| `feishu://message` | `{id, sender, text, ts, image_path?}` | 收到消息（已入历史） |
| `feishu://message-status` | `{id, status, reason?}` | 队列状态变化 |
| `feishu://history-update` | `()` | 历史记录结构变化（新增/删除/清理） |
| `feishu://inject-result` | `{success, reason?}` | 单次注入结果（保留兼容，可能逐步替换为 message-status） |

### React → Rust commands

| Command | 参数 | 作用 |
|---------|------|------|
| `get_settings` / `save_settings` | `Settings` | 既有 |
| `start_feishu` / `stop_feishu` | `app_id, app_secret` | 既有 |
| `inject_text_direct` | `text` | 既有（用于浮层"输入"按钮） |
| `check_accessibility` | - | 既有 |
| `get_log_dir` | - | 既有 |
| `get_history` | - | **新增**：返回倒序历史 |
| `delete_history_message` | `id` | **新增** |
| `retry_history_message` | `id` | **新增**，重新入队 |
| `confirm_pending_message` | `id, accept: bool` | **新增**：浮层里用户决定用这个替代 `inject_text_direct` |

---

## 十四、输入后自动提交

### 14.1 数据模型

在 `Settings` 里新增两个字段（沿用 `tauri-plugin-store` 同一 `config.json`）：

```rust
pub struct Settings {
    /* existing */
    pub auto_submit: bool,         // default true
    pub submit_key: SubmitKey,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SubmitKey {
    pub key: String,   // JavaScript KeyboardEvent.code 字面值（如 "Enter" / "KeyA" / "Space"）
    pub cmd: bool,
    pub shift: bool,
    pub option: bool,
    pub ctrl: bool,
}
```

默认值：`auto_submit = true`，`submit_key = { key: "Enter", cmd/shift/option/ctrl = false }`。

**为什么用 `e.code` 而不是 `e.key`**：`e.code` 与键盘物理位置绑定，与布局无关；`e.key` 在不同布局下会变（比如 Dvorak 下 "KeyA" 键位产生的 e.key 可能是 "a" 或其他）。存储 `e.code` 让注入行为稳定。

### 14.2 AppContext 共享

扩展 `AppContext`：

```rust
pub struct AppContext {
    /* existing */
    pub submit_config: Arc<Mutex<SubmitConfig>>,
}

pub struct SubmitConfig {
    pub auto_submit: bool,
    pub submit_key: SubmitKey,
}
```

`save_settings` command 更新 store 的同时同步 `Arc<Mutex<SubmitConfig>>`，让 injection worker 即时感知。

### 14.3 按键模拟（Rust）

复用已有 `core_graphics::event::CGEvent`。新增 `injector::simulate_submit(key: &SubmitKey)`：

```rust
fn simulate_submit(sk: &SubmitKey) -> Result<(), String> {
    let keycode = ecode_to_macos_keycode(&sk.key)
        .ok_or_else(|| format!("unsupported key: {}", sk.key))?;
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)?;
    let mut flags = CGEventFlags::empty();
    if sk.cmd    { flags |= CGEventFlags::CGEventFlagCommand; }
    if sk.shift  { flags |= CGEventFlags::CGEventFlagShift; }
    if sk.option { flags |= CGEventFlags::CGEventFlagAlternate; }
    if sk.ctrl   { flags |= CGEventFlags::CGEventFlagControl; }

    let down = CGEvent::new_keyboard_event(source.clone(), keycode, true)?;
    down.set_flags(flags);
    down.post(CGEventTapLocation::HID);

    let up = CGEvent::new_keyboard_event(source, keycode, false)?;
    up.set_flags(flags);
    up.post(CGEventTapLocation::HID);
    Ok(())
}
```

`ecode_to_macos_keycode` 维护一张常用键映射表（Enter / Tab / Escape / Space / Backspace / Arrow* / Letter* / Digit* / F1..F12），不在表内的返回 `None` 并在 UI 捕捉时提示不支持。

### 14.4 调用时机

在 `queue.rs` worker 的成功分支（`Sent` 状态之后，send_reaction DONE 之前）：

```rust
if ctx_submit.auto_submit {
    tauri::async_runtime::spawn_blocking({
        let sk = ctx_submit.submit_key.clone();
        move || injector::simulate_submit(&sk)
    }).await.ok();
}
```

图片粘贴完也统一走一次提交（复用同一把钥匙）。

### 14.5 UI 按键捕捉组件

新增 `src/components/KeyBindInput.tsx`：

- 点击显示字段进入 capturing 状态
- `onKeyDown` 捕捉：忽略纯 modifier keys（Shift/Meta/Control/Alt 本身）；Escape 取消不保存
- 捕到主键 + 当前 modifier 状态后立即保存、退出 capturing
- 展示用 lucide `Command` / `ArrowBigUp` / `Option` / `ChevronUp`（Ctrl）icon 配合主键字符串

按键字符串展示映射：
- `Enter` → "Enter"
- `Space` → "Space"
- `Tab` → "Tab"
- `KeyX` → "X"（全大写单字母）
- `DigitN` → "N"
- `FN` → "FN"

---

## 十五、v0.4 commands / events 增量

### 新 commands（React → Rust）

| Command | 参数 | 作用 |
|---------|------|------|
| `get_settings` / `save_settings` | `Settings`（含新字段 `auto_submit`、`submit_key`） | 扩展既有 |

（本次不新增独立 event，自动提交的成功/失败依然合并到既有 `feishu://inject-result` 与 `feishu://message-status` 的 Sent/Failed 状态，简单统一。）

---

## 十六、Sidecar 连接状态心跳

### 16.1 问题

v0.3 起 Go sidecar 只在 `emitStatus(false)` 初始化 + 每条消息**处理完**后 `emitStatus(true)` 这两个时机输出连接状态。WebSocket 握手成功但在用户发出第一条消息前，Rust 和前端都收不到 `connected: true`，UI 永久卡"连接中"。

### 16.2 修复策略

把 `wsClient.Start(ctx)`（阻塞调用）放到 goroutine，主线程用 `select` 在一个短的"连接建立宽限窗口"（2 秒）之后无条件广播 `connected: true`：

```go
errCh := make(chan error, 1)
go func() { errCh <- wsClient.Start(ctx) }()

select {
case err := <-errCh:
    // 2 秒内就返回 = 启动失败
    emitStatus(false)
    if err != nil { emitError(...) }
    os.Exit(1)
case <-time.After(2 * time.Second):
    // 2 秒内未失败，视作连接已建立
    emitStatus(true)
}

// 继续阻塞等 ws 终止
if err := <-errCh; err != nil {
    emitStatus(false)
    emitError(...)
    os.Exit(1)
}
emitStatus(false)
```

### 16.3 取舍

- **为什么不用回调**：`larkws.Client` 未暴露 `OnConnected` / `OnHandshakeComplete` 回调，强行走反射或私有字段代价大
- **2 秒宽限的依据**：经验值，覆盖网络正常时 WebSocket 握手 + token 刷新 + 事件订阅绑定全过程；极端网络下可能早报"已连接"但稍后 Start 失败 → Rust 侧 `SidecarEvent::Error` 会修正状态，UI 通过 `feishu://status` 事件刷回"未连接"
- **误报容忍**：2 秒虚假"已连接"带来的用户体验成本远小于长期卡"连接中"的困扰

本修复不改变协议契约，`feishu://status` event 语义不变。

---

## 十七、连接自检（selftest）

### 17.1 目标

"启动长连接"按钮负责建立 WebSocket 下行通道，但飞书自建应用有一个额外步骤：**需要在开发者后台 → 事件订阅里完成"长连接验证"**，否则机器人虽然上线但不会被推送消息。

"测试连接"按钮用来在这个步骤之后快速验证：
1. 凭据有效（能换到 `tenant_access_token`）
2. 网络到飞书开放平台可达
3. 应用权限范围包含 IM 读 API

一次通过的 selftest ≈ "下行 WebSocket + 上行 HTTP API 都就绪"，用户可以放心开始让机器人收消息。

### 17.2 协议

Rust → Go stdin 新增命令：

```json
{"cmd":"selftest"}
```

Go → Rust stdout 新增事件类型：

```json
{"type":"selftest_result","ok":true}
{"type":"selftest_result","ok":false,"reason":"tenant_access_token: code=10003 msg=..."}
```

### 17.3 Go 侧实现

用 `client.Im.Chat.List` 作为 ping 目标：

```go
case "selftest":
    go handleSelftest(ctx, client)

func handleSelftest(ctx context.Context, client *lark.Client) {
    req := larkim.NewListChatReqBuilder().PageSize(1).Build()
    resp, err := client.Im.Chat.List(ctx, req)
    ok, reason := true, ""
    if err != nil {
        ok, reason = false, fmt.Sprintf("网络请求失败: %v", err)
    } else if !resp.Success() {
        ok, reason = false, fmt.Sprintf("API 错误 code=%d msg=%s", resp.Code, resp.Msg)
    }
    b, _ := json.Marshal(map[string]interface{}{
        "type": "selftest_result", "ok": ok, "reason": reason,
    })
    fmt.Println(string(b))
}
```

**为什么用 `Im.Chat.List`**：
- 覆盖自建应用常见权限范围（`im:chat`），大部分接入飞书的 bot 都具备
- 即使 bot 在 0 个群里，`resp.Success()` 依然返回 true（data.items 是空数组）
- 失败时 `resp.Code` / `resp.Msg` 能清晰区分权限不足 / token 无效 / 网络错误

### 17.4 Rust 侧：同步 selftest command

用 oneshot 把异步的 stdout 回执转成同步 `Result`：

```rust
pub struct AppContext {
    // ... 已有字段
    pub pending_selftest: Arc<TokioMutex<Option<oneshot::Sender<SelftestResult>>>>,
}

#[tauri::command]
pub async fn run_selftest(app: AppHandle) -> Result<SelftestResult, String> {
    let ctx = app.state::<Arc<AppContext>>();
    let (tx, rx) = oneshot::channel();
    *ctx.pending_selftest.lock().await = Some(tx);

    ctx.bridge.send(&SidecarCommand::Selftest);

    tokio::time::timeout(Duration::from_secs(10), rx)
        .await
        .map_err(|_| "selftest 超时（10s），请检查网络与 sidecar 状态".into())?
        .map_err(|_| "selftest 通道被释放".into())
}
```

stdout 派发器收到 `SidecarEvent::SelftestResult` → take sender → send result。

### 17.5 前端：表单校验 + 双按钮

`ConnectionTab` 关键逻辑：

```tsx
function validate(): FieldErrors {
  const errs: FieldErrors = {};
  if (!appId.trim()) errs.appId = "App ID 不能为空";
  else if (!appId.trim().startsWith("cli_")) errs.appId = "App ID 应以 cli_ 开头";
  if (!appSecret.trim()) errs.appSecret = "App Secret 不能为空";
  return errs;
}

async function handleStart() {
  const errs = validate();
  setFieldErrors(errs);
  if (Object.keys(errs).length) return;
  await invoke("start_feishu", { appId, appSecret });
}

async function handleSelftest() {
  setSelftesting(true);
  try {
    const res = await invoke<SelftestResult>("run_selftest");
    setSelftestResult(res);
  } catch (e) {
    setSelftestResult({ ok: false, reason: String(e) });
  } finally {
    setSelftesting(false);
  }
}
```

失败 reason → 前端附加一段诊断建议：
- 含 "code=99991663" 或 "invalid app_id" → 建议检查 App ID
- 含 "invalid app_secret" → 建议检查 App Secret
- 含 "permission" / "scope" → 建议去开发者后台勾选 im:chat 权限并发布版本
- 网络相关 → 建议检查网络与代理
- 其他 → 通用建议"请去开发者后台确认长连接验证状态"


---

## 十八、Accessibility 权限与崩溃修复（v0.4.2）

### 18.1 背景

v0.4.1 出现过一次崩溃：Go sidecar 首次成功派发消息入队后，队列 worker 调
`AXUIElementCopyAttributeValue` 前应用进程直接退出，macOS 弹出系统设置的
「辅助功能」面板。

### 18.2 两个 root cause

#### (1) FFI 类型错误：把 `CFStringRef` 误声明为 `*const c_char`

原始绑定：

```rust
// 错误：把 CFStringRef 写成 c_char*
fn AXUIElementCopyAttributeValue(
    element: *mut std::ffi::c_void,
    attribute: *const std::ffi::c_char,   // ❌
    value: *mut *mut std::ffi::c_void,
) -> i32;
```

Apple 原型：

```c
AXError AXUIElementCopyAttributeValue(
    AXUIElementRef element,
    CFStringRef attribute,          // 不透明对象指针，不是 C 字符串
    CFTypeRef _Nullable *value);
```

调用时传 `b"AXFocusedUIElement\0".as_ptr()`——这是一段 ASCII 字节的地址，
macOS 侧把它当作 `CFStringRef`（对象起始地址）读取对象头字段，在权限未
授予时 AX API 会提前返回，但在**权限授予即将生效 / 半生效状态**下，API
会进入真正的解引用路径，读取非法内存段，进程 SIGSEGV。

**修复**：改用 `core_foundation::string::CFString` 构造真正的 CFString，
把 `as_concrete_TypeRef()` 作为 opaque 指针传入。

#### (2) 权限检查被动且副作用滥用

原始 `get_focused_element()` 逻辑：

```rust
if !check_accessibility() {
    request_accessibility_with_prompt(); // 打开系统设置！
    return None;
}
```

问题：
- 只有注入时才检查 → 启动期间用户完全不知道权限状态
- 每条消息未授权都会打开一次系统设置 → 用户已经在系统设置里给权限时，
  新消息又把窗口顶上来（焦点抢夺）
- 系统设置被反复调起本身不会崩，但和 (1) 的 FFI 崩溃叠加后定位变难

**修复**：
- `get_focused_element` 去掉对 `request_accessibility_with_prompt` 的副作用调用，只返回 `None`
- 启动期间在 `lib.rs::setup` 里 `check_accessibility()` 一次，未授予时 emit 事件告诉前端
- 新增独立 command `request_accessibility` 供 UI banner 按钮显式调用
- 队列 worker 注入前多一次 `check_accessibility()` 短路检查，拒绝的同时 fail() 标记消息为 Failed

### 18.3 权限状态事件契约

| 事件 | 方向 | 载荷 | 时机 |
|------|------|------|------|
| `typebridge://accessibility` | Rust → React | `{granted: bool}` | setup 时首次 emit；前端也可通过 `check_accessibility` command 主动拉 |

前端每 3s 通过 `check_accessibility` command 轮询；状态变为 `granted:true` 时停止轮询。

### 18.4 UI 反馈

ConnectionTab 顶部：未授权时显示黄色 banner——图标 + 文字 + "打开系统设置" 按钮，点击调 `request_accessibility`。banner 在 `granted:true` 时自动消失。

> **v0.5 已升级为启动模态**：banner 被 AccessibilityGate 模态替代，详见 §二十二。本节保留以说明 v0.4.2 时的历史形态。


---

## 十九、Go → Rust 结构化回调错误事件

### 19.1 背景

Go sidecar 此前把 reaction / reply 调用失败统一以 `emitError("reaction on X failed: ...")` 打成一条非结构化 `error` 事件。Rust 侧 dispatch 到 `SidecarEvent::Error { msg }` 时只做了两件事：

1. `tracing::error!` 写日志
2. `emit feishu://status {connected: false}` ←  **错误做法**：一个单次 API 调用失败不等于长连接断开

症状：某条消息回复失败（常见原因：`im:message:send` scope 未开通），系统日志变成"断开"；用户反复"连上又断开"，体验极差。

### 19.2 新事件协议

Go 新增 `feedback_error` 事件类型：

```json
{
  "type": "feedback_error",
  "message_id": "om_xxx",
  "kind": "reply",                // "reaction" | "reply"
  "code": 99991672,
  "msg": "Access denied. One of the following scopes is required: [im:message:send, ...]. 点击链接申请...: https://open.feishu.cn/app/cli_xxx/auth?q=..."
}
```

Go 侧新增 `emitFeedbackError(msgID, kind, code, msg)` helper，`addReaction` / `replyInThread` 失败分支调用它替代旧 `emitError`。

### 19.3 Rust 侧：落到 HistoryMessage

`HistoryMessage` 增加：

```rust
pub struct HistoryMessage {
    /* existing */
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_error: Option<FeedbackError>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FeedbackError {
    pub kind: String,     // "reaction" | "reply"
    pub code: i64,
    pub msg: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help_url: Option<String>,
}
```

`help_url` 由 Rust 在收到 `feedback_error` 时从 `msg` 里用正则提取，找不到就是 `None`。

dispatcher 收到 `feedback_error` 时：
1. `history.attach_feedback_error(message_id, feedback)` 把错误写到对应消息
2. emit `feishu://history-update`，前端刷新
3. **不**动 `feishu://status`

### 19.4 修复 Error 分支

旧分支不再广播连接状态（连接状态由 `status` 事件独占）：

```rust
SidecarEvent::Error { msg } => {
    tracing::error!("[feishu] {}", msg);
    // 不再 emit feishu://status
}
```

### 19.5 前端展示

`HistoryCard` 若 `message.feedback_error` 存在，卡片正文下方插入一块：

- 红色背景（`--error-soft`）+ 1px `--error` 边
- 标题："机器人回复被拒" / "机器人表情被拒"（按 kind 映射）
- 原始 msg，font-mono
- `help_url` 有的话，末尾"去开通权限 ↗"按钮，点击调 `openUrl`

此展示独立于 status 的 `已发送 / 失败` tag——消息可能**已发送**，仅双向反馈失败。


---

## 二十、两类失败的分层展示

### 20.1 为什么需要分层

`HistoryMessage` 上同时存在 `failure_reason` 和 `feedback_error` 两个字段，它们代表**完全不同层级**的失败：

| 字段 | 层级 | 典型场景 | 处理方 |
|------|------|---------|-------|
| `failure_reason` | 本地（macOS） | 无焦点输入框 / 辅助功能权限未授予 | 注入 worker 写入 |
| `feedback_error` | 飞书 API（上行） | scope 不足 / emoji_type 非法 / 频控 | Go sidecar 的 reaction/reply 调用失败后回传 |

工作流中**两者可以同时非空**：
1. 消息到达 → 注入 worker 尝试 `AXUIElement::get_focused_element`，失败（无焦点）
2. `fail()` 分支被触发：set `status=Failed` + `failure_reason="无焦点输入框"`
3. `fail()` 接着发 CRY 反应 + thread reply "❌ 输入失败：无焦点输入框" 给飞书
4. 飞书那边因 scope 不足拒了 reply，emit `feedback_error(code=99991672,...)`
5. Rust 把 feedback_error 写进同一条 HistoryMessage

所以卡片上必须**同时、但分开**展示两种错误，不能让用户误以为它们是同一件事的两种描述。

### 20.2 UI 文案

原先卡片上只有一行 "原因：无焦点输入框"，与下方红色 banner 并列，层级不清。v0.4.3 改为：

- **本地注入失败**：橙色图标 + "本地注入失败：无焦点输入框"（紧贴正文下方）
- **飞书反馈被拒**：红色 banner + "机器人回复被拒 code=99991672 ..."（放在注入失败下方）

两段之间留 `gap-2`，让层次清楚。

### 20.3 emoji_type 更换记录

v0.3 猜测的值 `EYES / DONE / CRY` 里触发过 `code=231001 reaction type is invalid`。我第一次诊断方向错了——以为 DONE / CRY 无效就把它们改成 OK / SAD；实际经用户验证后，真正**不在飞书枚举**里的是 `EYES`。按用户提供的验证过的值最终定为：

- `REACT_RECEIVED = "Get"`（"已收到" 语义，替换原 EYES）
- `REACT_SENT = "DONE"`（✅ 恢复为 DONE，之前误改为 OK）
- `REACT_FAILED = "CRY"`（😢 恢复为 CRY，之前误改为 SAD）

> **⚠ 大小写敏感**：`Get` 必须是首字母大写 + 后两位小写这种**混合大小写**形式；全大写 `GET` 或全小写 `get` 都会被飞书返回 `code=231001 reaction type is invalid`。看似不符合其它枚举（DONE / CRY 都是全大写）的命名惯例，但飞书侧就是按 `Get` 录的——不要"归一化"它。另外两个 `DONE` / `CRY` 维持全大写。

集中在 [`queue.rs`](../src-tauri/src/queue.rs) 顶部常量，后续再有 231001 只需单点修改。常用候选集（供未来扩展或兜底）：`Get / DONE / CRY`。

### 20.4 "注入"与"输入"的文案统一

此前代码和文档里混用了 **"注入"**（技术描述，来自 CGEventPost 注入系统事件）与 **"输入"**（用户友好描述，消息进到输入框）两个词。用户反馈："注入"对非技术用户不友好。

统一规则：
- **UI 可见文本**（React 组件的 JSX 文案、Rust 产生的 thread reply text、log 里发送到前端的描述）→ 全部用"输入"
- **源码注释、Rust 内部日志、变量/函数名、TECH_DESIGN 技术章节** → 保留"注入"表述，精确表达它是 macOS 事件模拟



---

## 二十一、输入策略重大变更：AX 逐字符 → 剪贴板 + Cmd+V

### 21.1 问题

v0.4 以前 `inject_text` 流程：
1. `AXUIElementCopyAttributeValue(system, AXFocusedUIElement)` 拿焦点
2. 读 `AXRole` 校验白名单
3. `CGEventKeyboardSetUnicodeString` + `CGEventPost` 逐字符发事件

在 Electron 类应用（VSCode / Slack / Discord / Figma 等）上第 1 步直接返回 `AXError=-25212 NoValue`——这些应用的 webview 内容没通过标准 AX 接口暴露出焦点。结果：TypeBridge 对所有 Electron 应用都判"无焦点"，消息无法输入。

### 21.2 新策略

**统一走 NSPasteboard + Cmd+V**，文本和图片用同一条路径：
1. 确认辅助功能权限（`AXIsProcessTrusted`）——`CGEventPost` 仍需它
2. 校验前台应用不是 TypeBridge 自己（`NSWorkspace.frontmostApplication.bundleIdentifier`）
3. 文本 → `NSPasteboard.setString_forType(..., NSPasteboardTypeString)`；图片 → `NSPasteboardTypePNG`
4. `CGEventPost` 模拟 `Cmd+V`
5. 若开启了"输入后自动提交"，继续模拟提交按键

不再需要 AXUIElement / AXRole 白名单 / 逐字符输入。

### 21.3 兼容性改进

| 应用类型 | 旧策略 (AX + CGEventPost) | 新策略 (剪贴板 + Cmd+V) |
|---------|-------------------------|----------------------|
| 原生 NSTextField / NSTextView | ✓ | ✓ |
| 浏览器 `<input>` / `<textarea>` | ✓ | ✓ |
| VSCode Monaco 编辑器 | ✗ AXError -25212 | ✓ |
| Slack / Discord 输入框 | ✗ 同上 | ✓ |
| Figma / Linear 富文本框 | ✗ 同上 | ✓ |
| iTerm2 终端 | 部分 | ✓ |

### 21.4 自我保护：前台应用 bundle ID 检查

旧方案依赖 AXRole 白名单判断"焦点是否在可输入元素"，间接防止字符打回 TypeBridge 自己。新方案没 AX，改用更可靠的 **前台应用 bundle ID 检查**：

```rust
fn is_frontmost_self() -> bool {
    let ws = NSWorkspace::sharedWorkspace();
    ws.frontmostApplication()
        .and_then(|app| app.bundleIdentifier())
        .map(|bid| bid.to_string() == "com.typebridge.app")
        .unwrap_or(false)
}
```

前台是我们自己时直接 Err("当前前台是 TypeBridge 自己，请先切换到目标应用")。这比 AXRole 白名单可靠——不依赖目标应用的 AX 树质量。

### 21.5 剪贴板副作用

粘贴完成后剪贴板保留消息内容，不回写旧值。理由：
- 粘贴是异步的，回写时机不好把握（早了覆盖未完成的粘贴，晚了用户可能已经手动操作剪贴板）
- 用户想再粘一次同内容直接 Cmd+V 更方便
- 实现简单

原剪贴板丢失是用户使用此功能时的自然代价，REQ 已明示。

### 21.5.1 粘贴完成到提交按键之间的 settle delay

自动提交（默认 Enter）紧跟在粘贴之后。若 `simulate_cmd_v()` 返回立即调 `simulate_submit()`，目标应用（尤其 VSCode Monaco / Slack / Figma 这类基于 React 或合成事件的 app）还没处理完粘贴事件流，就被 Enter 打断——表现为 Enter 被**延迟到下一次事件循环**才生效。用户观察："我每次输入完后当前消息没提交，下一条消息来时上一条才被提交"，正是因为前一条的 Enter 排到了后一条粘贴之后才触发。

修复：`inject_text` / `inject_image` 在 `simulate_cmd_v()` 成功返回后，主动 sleep **150ms**，让前台应用有时间把粘贴事件流消化完，再让调用方继续做后续按键（如 Enter）。150ms 凭经验选择，覆盖绝大部分 Electron / React 合成事件应用；再往上拖会让整体"从消息到达到输入完成"的响应肉眼可感。

### 21.6 injector.rs 模块变化

- 保留 `check_accessibility` / `request_accessibility`（权限检查入口未变）
- 新增 `is_frontmost_self` 使用 `objc2_app_kit::NSWorkspace` 查前台应用
- 重写 `inject_text`：不再逐字符 CGEventPost；改为 NSPasteboard 写 + `simulate_cmd_v`
- `inject_image` 原本就用剪贴板 + Cmd+V，无需改动
- `simulate_submit`（自动提交按键）无需改动
- **删除**不再使用的 AX 焦点查询代码：`get_focused_element` / `FocusedElement` / `ax_error_name` / `ax_error_hint` / 对应 AXUIElement FFI 声明 / `core_foundation::CFString` 导入。decision: 这些代码在策略切换后没有任何 caller，保留只会让新读代码的人以为焦点还是基于 AX 判定的，造成认知干扰，整体移除更清爽

### 21.7 为什么仍需辅助功能权限

改用剪贴板 + Cmd+V 后容易让人误以为可以丢弃辅助功能权限。实际上：

| API 调用 | 是否需辅助功能权限 |
|---------|----------------|
| `NSPasteboard.setString/setData` | 不需要——剪贴板本身开放 |
| `AXIsProcessTrusted`（查询） | 不需要——仅读取当前授权状态 |
| `AXUIElementCopyAttributeValue` 等 AX 查询 | 需要，但我们已不用 |
| **`CGEventPost`（`Cmd+V` / 提交按键模拟）** | **需要**——macOS TCC 对跨应用发按键事件受"辅助功能"管控 |

因此权限入口（`check_accessibility`、启动即查、权限 gate UI、3s 轮询、`request_accessibility` 打开系统设置）必须保留。仅仅"用途描述"从"查焦点 + 注入事件"缩窄为"粘贴触发的按键事件"。gate 文案保持"消息将无法注入"仍然准确。


---

## 二十二、辅助功能权限引导：启动模态化（v0.5）

### 22.1 问题

v0.4.2 把未授权反馈放在 ConnectionTab 顶部一条黄色 banner 里。实际使用中暴露两个问题：

1. **首次启动隐蔽**：用户如果没先切到"连接"tab 就开始让机器人发消息，banner 根本看不到；消息全部失败，看不到原因
2. **路径冗长**：用户点 banner 上的"打开系统设置"后，只是到了辅助功能面板——还得在一个长列表里手动找到 TypeBridge，体感步骤多

用户的表达："比让用户在系统辅助功能设置页（还得从应用列表中先找到当前应用）操作能简单些"。

### 22.2 macOS 能力边界（前置约束）

辅助功能权限属于 macOS **敏感特权**，TCC 强制要求用户在系统设置里手动勾选。

**没有任何公开 API 能让应用自己给自己授权**，也没有任何 API 能弹一个"同意即开"的系统确认框：

| 诉求 | 可行性 |
|------|--------|
| 应用自己给自己开 | ✗ 完全不可能 |
| 弹系统级"同意即开"的确认框 | ✗ 不存在这种 API |
| `AXIsProcessTrustedWithOptions(prompt=true)` 弹窗 | ✓ 但它只是一个"前往系统设置"的提示，本质仍要求用户去设置里勾选 |
| 深链直达辅助功能面板 | ✓ `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` |
| 应用出现在辅助功能列表里（免得用户点"+"） | ✓ 调过一次 `AXIsProcessTrusted` 即自动登记 |

因此 v0.5 能做的简化只有两项：**① 让未授权状态不可忽视**（从 banner 升级为启动模态）；**② 确保用户到了设置页就能看见 TypeBridge**（启动时已经调过 check 自动登记），从而真正减少一次"点 +，找到 TypeBridge"的步骤。

### 22.3 设计方案：AccessibilityGate 启动模态

新增 `src/components/AccessibilityGate.tsx`，挂在 `App.tsx` 根层，**位于 `MainWindow` 之上**。逻辑：

```
启动 → check_accessibility
  ├── granted=true  → 不渲染 gate，MainWindow 正常使用
  └── granted=false → 渲染全屏 overlay 模态，覆盖 MainWindow
                        │
                        │  3s 轮询 check_accessibility
                        │  + listen typebridge://accessibility
                        │
                        ├── 依然 false → 模态保持
                        └── 变为 true  → 模态自动消失（CSS 淡出）
```

### 22.4 关键取舍

- **blocking 而非 dismissible**：未授权时注入必然失败，"允许跳过"只会让用户更困惑。模态无关闭按钮，未授权就是用不了——这是现实的忠实表达
- **纯应用内模态，不触发原生 AX 弹窗**：`AXIsProcessTrustedWithOptions(prompt=true)` 会叠一层 macOS 原生"X wants to control this computer..."对话框，反而让用户多点一次。直接深链到设置页最干净
- **启动时已自动登记**：`lib.rs::setup` 调了 `check_accessibility()`（即 `AXIsProcessTrusted`），这一次调用足以把 TypeBridge 加到辅助功能列表里。用户点完"前往授权"到达设置页时，TypeBridge 必定已在列表中
- **不替换 queue.rs 的 pre-injection 检查**：worker 里的 `check_accessibility()` 短路仍保留——即使 gate 路径漏了（比如权限中途被吊销），消息也不会盲注入崩溃

### 22.5 模态视觉

- 覆盖层：`position: fixed; inset: 0` + 半透明暗色背景（`rgba(0,0,0,0.6)`）模糊 MainWindow
- 卡片居中：圆角 14px，`surface` 背景，1px `border`，min-width 440px
- 顶部 lucide `ShieldAlert` 图标（24px accent 色）+ 标题"需要授予辅助功能权限"
- 正文说明两行：
  1. "TypeBridge 需要此权限才能把飞书消息粘贴到你的当前输入框。"
  2. "点击下方按钮将直接打开系统设置页，TypeBridge 已在列表中——只需勾上开关即可。"
- 主按钮：`前往授权` + 外链 icon（lucide `ExternalLink`），accent 实色；按钮下方一行小字"授权后本窗口会自动感知，不需要手动刷新"
- 不再展示"我已授权/刷新/稍后"等二级选项，减少决策负担

### 22.6 删除 AccessibilityBanner

`src/components/AccessibilityBanner.tsx` 和它在 `ConnectionTab.tsx` 里的引用整体移除——gate 模态已完全接管"未授权反馈"这个角色，保留 banner 会造成信息冗余且层次混乱（同一状态两个提示点）。

### 22.7 为什么不放两处（gate + banner）

考虑过"启动时用模态 + 之后保留 banner 防止用户关模态没看见"。最终否掉：

- 模态 blocking 且授权后自动消失——不存在"关闭了就看不见"的场景
- 保留 banner 反而引入两处要同步维护的 UI，未来改文案/交互会很容易漏一处
- 单一真相源（single source of truth）原则——权限状态只在 gate 组件里呈现


---

## 二十三、连接测试升级：scope probe 清单（v0.5）

### 23.1 问题

v0.4 的"测试连接"只发一个 `Im.Chat.List` 请求，返回一句 `ok / reason`。两个缺陷：

1. **绑架无关 scope**：`Im.Chat.List` 需要 `im:chat:readonly`，而这个 scope 在消息链路里根本用不上——只是为了"找一个能 ping 的只读 API"而硬加的
2. **诊断太粗**：用户失败后只能看到一条错误 reason，不知道到底是哪个 API 的 scope 缺了；很多情况下要等真正收到消息才发现"噢原来 reaction 权限没开"

### 23.2 设计：并行 probe + 清单结果

把 selftest 从"一次 ping"改成"对消息链路上**真实需要**的每个 API 各发一次 probe"，返回一个 per-probe 数组。probe 的关键是**非破坏性**——用假的 `message_id` / `file_key` 触发业务错误，通过观察 code 区分"scope 不足" vs "参数不合法"。

**Probe 列表（与 §五A 对齐）：**

| Probe ID | 所测 API | 假请求 | scope_hint（UI 展示） |
|----------|--------|-------|--------------------|
| `download_image` | `Im.MessageResource.Get` | `message_id=om_probe_xxx`, `file_key=img_probe_xxx`, `type=image` | `im:message:readonly` |
| `reaction` | `Im.MessageReaction.Create` | `message_id=om_probe_xxx`, `emoji_type=DONE` | `im:message.reactions:write_only` |
| `reply` | `Im.Message.Reply` | `message_id=om_probe_xxx`, `content={"text":"probe"}` | `im:message:send_as_bot` |

### 23.3 飞书错误码到 probe 结论的映射

| 飞书返回 | probe 结论 | 展示 |
|---------|-----------|------|
| `resp.Code == 0`（真的成功） | ok | ✓（用假 ID 成功极罕见，当成功处理即可） |
| `resp.Code == 99991672`（Access denied, scope 不足） | **fail**，从 `resp.Msg` 中抽出 `[scope1, scope2, ...]` | ✗，展示所需 scope + 深链 `help_url` |
| `resp.Code == 99991663`（invalid app_id） | **凭据级 fail** | 整清单 short-circuit：凭据错误，不再展示具体 probe |
| `resp.Code == 99991664`（invalid app_secret） | **凭据级 fail** | 同上 |
| 其他业务 code（`230000` 参数非法 / `230005` 消息不存在 etc.） | **ok**——说明请求已进到业务层，scope 充足 | ✓，probe 通过 |
| 网络错误（DNS / TLS / timeout） | **网络级 fail** | 整清单 short-circuit：网络错误 |

**关键判断：**`ok = (resp.Code != 99991672 && !is_credential_error && !is_network_error)`。用"只有 99991672 才判 scope 缺失"的白名单逻辑，避免误报——飞书的业务错误码空间很大，逐个穷举不现实，用"明确认定缺权限的 code 做黑名单"最稳。

### 23.4 凭据 / 网络错误 short-circuit

三个 probe 都会经历 `tenant_access_token` 换取阶段。如果任一 probe 返回 `99991663` / `99991664` 或网络错误，**其他 probe 也注定失败**，没必要展示三行一样的错误。Go 侧在 probe fan-in 后：

```go
if anyCredentialErr := findCredentialErr(results); anyCredentialErr != nil {
    emitSelftestResult(SelftestResult{
        CredentialsOk: false,
        CredentialsReason: anyCredentialErr,
        // Probes 故意留空，由 UI 展示"凭据错误"整块
    })
    return
}
if anyNetworkErr := findNetworkErr(results); anyNetworkErr != nil {
    emitSelftestResult(SelftestResult{
        CredentialsOk: false, // 网络问题归到凭据级别一起处理，UI 不必区分
        CredentialsReason: "网络不通: " + anyNetworkErr,
    })
    return
}
// 都 pass 凭据和网络，按 probe 展示结果
```

### 23.5 协议扩展

**Rust → Go 命令**不变（仍是 `{"cmd":"selftest"}`）。

**Go → Rust 事件**升级 `selftest_result` 的 payload：

```json
{
  "type": "selftest_result",
  "credentials_ok": true,
  "credentials_reason": "",
  "probes": [
    {
      "id": "download_image",
      "label": "下载图片资源",
      "scope_hint": "im:message:readonly",
      "ok": true,
      "code": 230005,
      "msg": "message not found",
      "scopes": [],
      "help_url": ""
    },
    {
      "id": "reply",
      "label": "回复消息",
      "scope_hint": "im:message:send_as_bot",
      "ok": false,
      "code": 99991672,
      "msg": "Access denied. One of the following scopes is required: [im:message:send_as_bot, im:message]. 点击链接申请...: https://open.feishu.cn/app/cli_xxx/auth?q=...",
      "scopes": ["im:message:send_as_bot", "im:message"],
      "help_url": "https://open.feishu.cn/app/cli_xxx/auth?q=..."
    },
    ...
  ]
}
```

- `credentials_ok=false` 时 UI 展示凭据错误块，`probes` 数组可忽略
- `credentials_ok=true` 时逐条展示 probe 结果
- `help_url` 由 Go 侧用正则从 `msg` 中抽取；抽不到就留空，UI 点击"去授权"退化为固定深链 `https://open.feishu.cn/app/{app_id}/auth`

### 23.6 UI：SelftestChecklist 组件

`src/components/SelftestChecklist.tsx` 渲染一个清单卡片：

```
┌──────────────────────────────────────────────────────┐
│  凭据可用                                        ✓   │
├──────────────────────────────────────────────────────┤
│  下载图片资源                                    ✓   │
│  im:message:readonly                                 │
├──────────────────────────────────────────────────────┤
│  发表情反应                                      ✓   │
│  im:message.reactions:write_only                     │
├──────────────────────────────────────────────────────┤
│  回复消息                                        ✗   │
│  缺少 scope：im:message:send_as_bot / im:message     │
│  [去飞书开发者后台授权 ↗]                            │
├──────────────────────────────────────────────────────┤
│  ⓘ 接收消息事件 需在飞书后台「事件配置」单独完成      │
│     ① 订阅方式选"使用长连接接收事件"并完成验证        │
│     ② 添加事件搜索 im.message.receive_v1 勾选提交     │
│     [去事件配置页 ↗]                                 │
└──────────────────────────────────────────────────────┘
```

- 清单卡片**替代**原来那一行绿色/橙色 banner
- 失败行的"去授权"按钮用 `openUrl`（tauri-plugin-opener）打开 probe 返回的 `help_url`；没有 `help_url` 时退化为 `https://open.feishu.cn/app/{app_id}/auth`
- 最后一行（事件订阅）是**静态 info**——API probe 无法自动校验事件订阅的配置状态。展示形态做了三处优化：
  1. 两步对照式 checklist，对应飞书"事件配置"页的实际 UI 顺序：先选订阅方式（长连接 vs HTTP）+ 完成验证，再添加具体事件并勾选提交。两步都对完用户就配齐了——不再单独列 scope 步，因为飞书在「添加事件」时会自动把该事件依赖的 scope 加进应用，不需要用户手动到「权限管理」勾
  2. 主按钮直达**应用本身的**事件配置页 `https://open.feishu.cn/app/{app_id}/event`，而不是公开文档页
  3. 公开文档作为辅助链接保留

### 23.7 为什么不单独做一个 probe 检查事件订阅

考虑过几种自动化路径，最终都没采用：

| 方案 | 结论 |
|------|------|
| 找 introspection API（如 `/event/v1/list-subscriptions`） | **不存在**——飞书没有公开"列出当前订阅事件"的独立 API |
| WebSocket 握手响应里抠事件列表 | **不暴露**——`larkws.Client.Start()` 握手只返回 status/auth_err_code，不带事件清单（`oapi-sdk-go/v3/ws/client.go` 验证） |
| 用 `Application.Application.Get` 查 `event.subscribed_events` 字段 | **可行但代价不划算**——需要 `application:application:self_manage` scope（一个相对敏感的 self_manage 范围）。给 TypeBridge 这个"消息收发"语义的 bot 加这个 scope 越界；并且**把"事件配置自查"换成了"self_manage scope 自查"**，权限清单多一行反而让用户更晕 |
| 等待首条真实消息被动验证 | **脆弱**——用户不主动发消息就永远超时；超时也不能区分"未订阅" vs "无人发消息" |

最终选择"静态步骤清单 + 直达事件配置页深链"——表达诚实，无额外权限成本，用户操作路径最短。

### 23.8 Probe 的 dummy ID 选型

- 用前缀 `om_probe_typebridge_` + PID/时间戳后缀，保证 dummy ID 不会意外撞到真实消息
- `file_key` 用 `img_probe_typebridge_` 前缀
- 飞书 message_id 的真实前缀是 `om_` / `om_x_`；dummy ID 用合法前缀保证通过格式校验、直达 scope 检查路径

### 23.9 不修改点

- `SidecarCommand::Selftest` 枚举、`run_selftest` command 签名（前端调用方式）都保持兼容——变的只有返回结构
- 历史消息 / 队列 / 注入逻辑完全不涉及
- `feedback_error` 机制（消息级的反馈失败）保持原样——新增的 probe 结果只影响"测试连接"按钮的展示，不落地到 HistoryMessage

---

## 二十四、CI/CD 发布流水线

### 24.1 设计决策

**决策：使用 GitHub Actions + macOS runner，一条 Workflow 覆盖手动和 Tag 两种触发**

**方案说明：**

- 使用 GitHub 提供的 `macos-latest` runner（arm64 Apple Silicon），通过 `cross` 或直接交叉编译完成双架构构建
- 单条 `.github/workflows/release.yml` 支持 `workflow_dispatch`（手动 + 输入版本号）和 `push tags v*`（自动）两种触发
- 构建流程完全复用本地 `scripts/build-all.sh` 但又拆解为 CI 友好的独立步骤

**为什么不用 self-hosted runner：**
- `macos-latest` GitHub-hosted runner 已免费提供 Apple Silicon 环境，无需额外维护 macOS 构建机
- 首次构建后 `target/` 和 `node_modules/` 被 GitHub Actions cache 缓存，后续增量构建与本地体验接近

### 24.2 Workflow 步骤拆解

```
workflow_dispatch(version) / push tag v*
          │
          ▼
┌─────────────────────────────────────┐
│ 1. 检出代码                         │
│ 2. 解析版本号（dispatch 用输入/tag  │
│    用 ref_name 去 v 前缀）          │
│ 3. 覆写 tauri.conf.json & Cargo.toml│
│    的 version 字段                  │
│ 4. Setup Node 20 (cache npm)        │
│ 5. Setup Go 1.21+ (cache Go modules)│
│ 6. Setup Rust stable + targets      │
│    (aarch64 + x86_64 apple-darwin)  │
│ 7. 编译 Go sidecar × 2 架构         │
│ 8. npm ci + 前端构建                │
│ 9. cargo build --release × 2 target │
│10. 注入 .DS_Store（UDRW 挂载 +     │
│    SetFile 隐藏 + 模板拷贝）        │
│11. 收集 .dmg 产物                   │
│12. 创建/更新 GitHub Release         │
│13. 上传 .dmg assets 到 Release      │
│14. POST /api/publish 同步元数据     │
│    (仅 x.y.z 正式版，含 `-` 的      │
│     预发布版跳过)                   │
└─────────────────────────────────────┘
```

### 24.3 关键实现细节

**版本号覆写（Step 3）：**
```bash
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
```
仅在 CI 中覆写，不修改 git 中的版本号（使用 `sed` in-place 但不 commit）。这样同一个 commit 可以反复打出不同版本号。

**Release 创建策略（Step 11）：**
- 使用 `softprops/action-gh-release@v2`，设置 `make_latest: true`
- 若对应 tag/release 已存在 → action 会覆盖更新 assets（满足"可重复构建"需求）
- Release body 自动填入构建日期、目标版本、双架构说明

**缓存策略：**
| 缓存内容 | Key | 作用 |
|----------|-----|------|
| `~/.cargo` | `cargo-${{ runner.os }}-${{ hashFiles('src-tauri/Cargo.lock') }}` | Rust 依赖增量编译 |
| `node_modules` | `npm-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` | npm 依赖 |
| `~/go/pkg/mod` | `go-${{ runner.os }}-${{ hashFiles('feishu-bridge/go.sum') }}` | Go module 缓存 |
| `src-tauri/target` | `target-${{ runner.os }}-${{ hashFiles('src-tauri/Cargo.lock') }}` | Rust 编译产物 |

**双架构构建策略：**

GitHub `macos-latest` runner 当前是 arm64。x86_64 的 Rust 编译通过 `rustup target add x86_64-apple-darwin` 后 `cargo build --target x86_64-apple-darwin` 交叉编译。Go 同理 `GOARCH=amd64 go build`。

一个简化方案（也是最终选择）：arm64 用 `npm run tauri build -- --target aarch64-apple-darwin`；x86_64 用 `npm run tauri build -- --target x86_64-apple-darwin`。注意两者共享 `src-tauri/target/` 目录，大部分 deps 是共用的（增量），只有最终 link 产物不同。

**DMG .DS_Store 注入（Step "Inject DMG resources"）：**

CI 环境无 Finder GUI session，Tauri 的 AppleScript 无法生成有效的 `.DS_Store`（Finder 窗口设置）。解决方案：从本地构建的正确 DMG 提取 `.DS_Store` 作为模板（`src-tauri/icons/dmg-dsstore`），在 CI 上注入。

核心挑战：`.DS_Store` 内部含 HFS+ CNID（Catalog Node ID）书签，模板中的 CNID 与 CI 构建的文件系统不匹配 → 书签失效 → `.background` 和 `.VolumeIcon.icns` 在 Finder 中显示为可见文件、Applications 图标渲染异常。

最终方案——**SetFile 隐藏 + fix_dsstore.py 写新鲜书签**：

```
hdiutil convert "$DMG" -format UDRW -o /tmp/dmg-rw.dmg
hdiutil attach -nobrowse -readwrite /tmp/dmg-rw.dmg -mountpoint /tmp/dmg-mnt
SetFile -a V /tmp/dmg-mnt/.background         # filesystem-level hidden
SetFile -a V /tmp/dmg-mnt/.VolumeIcon.icns    # filesystem-level hidden
python3 scripts/fix_dsstore.py /tmp/dmg-mnt src-tauri/icons/dmg-dsstore
hdiutil detach /tmp/dmg-mnt -force
hdiutil convert /tmp/dmg-rw.dmg -format UDZO -imagekey zlib-level=9 -o /tmp/dmg-out.dmg
```

- `SetFile -a V` 在文件系统层面标记隐藏属性 — CNID 变化不影响，分布式 DMG 中 dot-files 始终不可见
- `fix_dsstore.py` 从模板中二进制提取 bwsp/icvp（纯布局数据，无 CNID），然后用 `mac_alias.Bookmark.for_file()` 在挂载卷上生成包含正确 CNID 的新鲜书签，最后用 `ds_store` 的 `w+` dict 风格 API 写入全新 `.DS_Store`
- 需要 `pip3 install ds_store mac_alias`（两个纯 Python 库，无系统依赖）
- 本地更新模板：构建一次 DMG，`cp /Volumes/TypeBridge/.DS_Store src-tauri/icons/dmg-dsstore`

### 24.4 注意事项

- **代码签名缺失**：GitHub Actions runner 没有 Apple Developer 证书，产出的 `.dmg` **未签名**。仅用于内部测试分发；真机公网分发需手动签名或配 Apple Developer 证书到 GitHub Secrets
- **首次构建时间**：冷缓存下全量编译约 15–20 分钟（Rust 依赖 400+ crates）；热缓存下约 3–5 分钟
- **macOS runner 配额**：GitHub 免费计划每月 2000 分钟；私有仓库有限额

### 24.5 检查更新（v0.7.x，关于 TypeBridge tab）

桌面端「关于」tab 提供半自动更新链路：

```
AboutTab (前端)
  ├─ get_app_version  → "dev:latest" / "0.1.0"
  ├─ check_update     → fetch /api/latest-version → 比版本 → UpdateCheckResult
  └─ apply_update     → 下载 .dmg → open .dmg → app.exit(0)
```

**Rust** ([src-tauri/src/about.rs](../src-tauri/src/about.rs))：
- `get_app_version`：`cfg!(debug_assertions)` 时返回字符串 `"dev:latest"`，否则 `env!("CARGO_PKG_VERSION")`。CI 在 [release.yml](../.github/workflows/release.yml) 用 sed 改 `Cargo.toml` 的版本号，所以 release build 自然能拿到正确的 tag 版本
- `check_update`：dev 直接短路返回 `is_dev=true`；release 走 `reqwest`（rustls，无 OpenSSL 依赖）拉 `https://typebridge.parksben.xyz/api/latest-version`，按 `cfg!(target_arch)` 选 `aarch64` / `x64` 下载链接
- `apply_update`：下载到 `~/Downloads/{filename}.dmg` → `Command::new("open")` 挂载并显示 Finder 卷 → `app.exit(0)`。用户拖入「应用程序」覆盖旧版后手动重新启动

**官网 API** ([website/app/api/latest-version/route.ts](../website/app/api/latest-version/route.ts))：
- **v0.9+ 优化**：不再每次调 GitHub API。CI 完成 Release 后通过 `POST /api/publish`（带 `UPLOAD_SECRET` 鉴权）把 `{version, tag_name, name, notes, published_at, download_urls}` 写到 Netlify Blobs（key: `latest-release`）。`GET /api/latest-version` 直接从 Blobs 读，响应时间从 ~300ms 降到 ~50ms，且不受 GitHub rate limit 限制
- **publish 安全控制**：`UPLOAD_SECRET` 仅存在 Netlify 环境变量和 GitHub Secrets 中，CI workflow 末步用 `Authorization: Bearer $UPLOAD_SECRET` 调用；外部请求若不带正确 secret 返回 401
- **测试版本过滤**：版本号非 `x.y.z` 纯 semver（如 `0.2.0-test`、`0.2.0-alpha.1` 等带 `-` 后缀的预发布版本）时，**CI 跳过 publish 步骤**，不推送到官网。仅正式版（`v0.2.0` tag、或 manual dispatch 输入 `0.2.0`）才触发 publish
- **文件管理**：每次 publish 会覆盖 Blobs 中的 `latest-release`，不保留历史版本（只维护一份最新元数据，旧版 .dmg 本体仍由 GitHub Release 保留）
- 响应 schema 与 `LatestVersionResp` 严格对齐

**官网下载优化**（[website/app/dl/[arch]/route.ts](../website/app/dl/[arch]/route.ts)）：
- 仍然代理转发 GitHub Release asset（保留代理是为了国内用户访问 GitHub CDN 的带宽稳定性），但**不再每次调 GitHub API 查 asset URL**
- 改为从 Blobs 读 `latest-release` → 拿到对应架构的 `browser_download_url` + `size` → `fetch` 流式透传时带上 `Content-Length` 头（浏览器可显示下载进度）
- Blobs 读取极快，函数冷启动到开始传输的延迟大幅降低


**为什么不用 tauri-plugin-updater**：完整 auto-update（download → swap .app → relaunch）需要 ed25519 签名 + CI 集成 + Apple 公证，工作量 ~1-2 天。当前阶段优先打通链路，签名基建放后续版本。

---

## 二十五、产品官网

### 25.1 设计决策

**决策：Next.js (App Router) 独立子目录 + Netlify 部署，体系化多页站点**

**方案说明：**
- 在仓库根目录新建 `website/` 子目录，作为完全独立的 Next.js 项目
- 通过 `netlify.toml` + `@netlify/plugin-nextjs` 实现代码驱动的零 UI 手动配置部署
- 域名：`typebridge.parksben.xyz`
- **体系化多页站点**（非单纯下载页）：包含首页、文档中心、适用场景文档、三大 IM 渠道教程 + Web Chat 接入教程子页面
- **Hero 概念 Banner**：纯 CSS/SVG 动画展示"消息→桥接→注入"概念，不放截图
- **文档三栏布局**：二级子页面（/docs/use-cases、/docs/feishu 等）采用 Left Sidebar（两分区导航）+ Center（正文）+ Right Sidebar（章节 Scroll Spy）

### 25.2 架构

```
website/
├── netlify.toml                    ← Netlify 自动发现，指定 build / plugin
├── package.json
├── next.config.ts                  ← @netlify/plugin-nextjs 处理部署
├── app/
│   ├── layout.tsx                  ← 全局布局（字体加载 + metadata）
│   ├── client-shell.tsx            ← Client component: ThemeProvider + TopNav
│   ├── page.tsx                    ← 首页：HeroBanner / HowItWorks / Features / TutorialCards / Download / Footer
│   ├── globals.css                 ← 主题变量、动画、噪点纹理、Hero Banner 动画关键帧
│   ├── docs/
│   │   ├── page.tsx                ← 文档中心 hub：五卡片导航（适用场景 + 四渠道接入）
│   │   ├── layout.tsx              ← 三栏布局壳：LeftSidebar + Center + RightSidebar（子页面共享）
│   │   ├── docs-layout-client.tsx  ← Client component: 判断 pathname 渲染三栏 / 单栏
│   │   ├── left-sidebar.tsx        ← 客户端组件：两分区导航（适用场景 + 接入方式[四渠道]），当前页高亮
│   │   ├── right-sidebar.tsx       ← 客户端组件：章节 Scroll Spy 导航
│   │   ├── steps.tsx               ← 共享教程 UI 组件（StepSection / StepDetail / ScreenshotPlaceholder / InfoBox）
│   │   ├── use-cases/
│   │   │   └── page.tsx            ← 适用场景文档（语音转文字、AI Coding、高频文档产出、跨设备流转、团队协作）
│   │   ├── feishu/
│   │   │   └── page.tsx            ← 飞书接入教程（自维护，5 步骤含锚点 id）
│   │   ├── dingtalk/
│   │   │   └── page.tsx            ← 钉钉接入教程（自维护，5 步骤含锚点 id）
│   │   └── wecom/
│   │       └── page.tsx            ← 企业微信接入教程（自维护，5 步骤含锚点 id）
│   │   └── webchat/
│   │       └── page.tsx            ← Web Chat 接入教程（开发中，描述移动端聊天页的使用方式）
│   └── download/
│       └── [arch]/
│           └── route.ts            ← Route Handler: 代理转发 GitHub Release .dmg
└── public/
    └── (favicon / og-image / 占位截图)
```

### 25.2.1 Hero Banner 技术方案

- 纯 CSS 动画（`@keyframes`），零外部依赖
- **主题自适应**：Banner 背景、网格纹理、桌面窗口、光晕球全部使用 CSS 变量（`var(--tb-bg/border/surface/text/muted/accent)`），在浅色/深色模式下均有良好视觉效果。扫描线叠加仅在深色模式可见（`dark:opacity-50 opacity-0`），浅色模式下网格纹理更轻（opacity 0.04 vs 深色 0.07），光晕球更淡（浅色 opacity 0.12 vs 深色 0.2）
- 原理示意图布局：三列式，左侧三个 IM 品牌 logo → 中间桥接节点（lucide-react `ArrowLeftRight` 图标）→ 右侧桌面窗口模拟
- **IM logo 使用官方品牌 SVG**（不再使用简化版轮廓图形）：
  - 飞书：IconPark（ByteDance 官方图标库）SVG，viewBox 0 0 48，fill #3370FF
  - 钉钉：Ant Design Icons SVG，viewBox 0 0 1024，fill #0089FF
  - 企微：Simple Icons WeChat SVG，viewBox 0 0 24 24，fill #06BA6A
  - 各 logo 统一 `w-7 h-7 md:w-8 md:h-8` 尺寸，适配不同 viewBox
- 动效细节：
  - IM logo 发脉冲光圈（`icon-ring-pulse`），表示"有消息发出"
  - 三条弧线（渠道色渐变 + 流动 dash 动画 `arc-dash`），表示数据传输路径
  - 粒子沿弧线流动（`flow-particle`），从 IM logo → 桥接节点 → 桌面端
  - 桥接节点发光脉冲（`pulse-glow`），接收时放大 + 增强光晕
  - 桌面光标闪烁（`blink-cursor`），注入文字渐现渐隐（`text-shimmer`）
  - 桌面窗口浮动动画（`float-desktop`）
- 背景风格：主题自适应（使用 CSS 变量而非硬编码色值）+ 网格纹理 + 三色光晕球 + 扫描线叠加（仅深色模式），浅色/深色模式均有协调视觉
- `<section>` 最小高度 ~560px（md ~640px），确保动画有足够舞台
- **品牌标题不再使用衬线斜体**：所有 `font-brand`（Instrument Serif Italic）已替换为 `font-bold`（Geist Sans），accent 色关键词强调
- **导航栏 Logo** 为桥拱 SVG 图标 + "TypeBridge" 加粗文字，Footer 同样使用图标+文字组合
- 整体网站视觉增强：功能/下载区加顶部径向渐变光晕（`section-glow-accent/download`），卡片 hover 发 accent 色辉光（`feature-card-glow`），按钮 shadow 用 accent 色 25% 透明度

### 25.2.2 文档三栏布局技术方案

**layout.tsx（/docs 子路由共享布局）：**

```
┌──────────────────────────────────────────────┐
│  TopNav (fixed)                              │
├────────┬───────────────────┬─────────────────┤
│ Left   │  Center           │  Right          │
│ Sidebar│  (main content)   │  Sidebar        │
│ ~220px │  flex-1           │  ~200px         │
│        │                   │                 │
│适用场景│  文档正文          │  章节/步骤一     │
│  ●     │  ...              │  章节/步骤二 ●   │
│────────│  ...              │  章节/步骤三     │
│接入方式│  ...              │  章节/步骤四     │
│ WebChat│                   │  章节/步骤五     │
│ 飞书   │                   │                 │
│ 钉钉   │                   │                 │
│ 企微   │                   │                 │
├────────┴───────────────────┴─────────────────┤
│  (mobile: sidebars hidden)                   │
└──────────────────────────────────────────────┘
```

- `docs-layout-client.tsx` 判断 pathname：仅当 `/docs/(use-cases|feishu|dingtalk|wecom|webchat)` 时渲染三栏；`/docs` hub 页不走三栏
- LeftSidebar 分两区：「适用场景」（accent 色 `Lightbulb` 图标，单条链接 `/docs/use-cases`）+ 分割线 +「接入方式」（4 条渠道链接，各带品牌色图标 + badge）。Web Chat 排首位（lucide `Globe` 紫色调图标 +「开发中」badge），其次飞书/钉钉/企微使用各自品牌色图标。两分区各自独立 section，视觉上清晰区分
- RightSidebar：与现有实现不变，通过 IntersectionObserver 监听 `[data-step-anchor]` 元素

### 25.3 页面路由与渲染策略

| 路由 | 渲染方式 | 说明 |
|------|---------|------|
| `/` | SSG | 首页，构建时预渲染为静态 HTML |
| `/docs` | SSG | 文档中心导航页，四卡片，静态 |
| `/docs/use-cases` | SSG | 适用场景文档，静态 |
| `/docs/feishu` | SSG | 飞书教程，静态 |
| `/docs/dingtalk` | SSG | 钉钉教程，静态 |
| `/docs/wecom` | SSG | 企微教程，静态 |
| `/docs/webchat` | SSG | Web Chat 接入教程（开发中），静态 |
| `/dl/[arch]` | Route Handler | 动态查 GitHub API，流式透传（no-store 防缓存） |

### 25.4 导航栏设计

TopNav 导航项：

| 导航项 | 目标 | 类型 |
|--------|------|------|
| TypeBridge (Logo) | `/` | 内链 |
| 功能特性 | `/#features` | 锚点 |
| 适用场景 | `/docs/use-cases` | 内链 |
| 使用文档 | `/docs` | 内链 |
| 下载 | `/#download` | 锚点 |
| 主题切换 | 无 | 按钮 |

不再在导航栏上直接放飞书/钉钉/企微外链——这些链接现在属于教程内容的一部分，出现在 `/docs/feishu` 等页面的操作步骤里。

### 25.5 下载流量转发机制

**v0.9+ 优化**：
- `GET /dl/[arch]` Route Handler **不再每次调 GitHub Releases API**。改为从 Netlify Blobs 读 `latest-release` → 拿到该架构的 `browser_download_url` + `size` → `fetch` GitHub CDN 流式透传，响应头带 `Content-Length`（浏览器可显示下载进度条）
- `Cache-Control: no-store, must-revalidate` 保持不变
- **为什么保留代理而非 302 重定向**：国内用户直接访问 GitHub CDN 可能带宽受限；通过 Netlify 函数作为中转节点，利用 Netlify global edge 网络改善连接质量
- **为什么仍需调 GitHub**：`.dmg` 本体仍存 GitHub Release（免费、无存储成本），仅把"查 URL"这一步从 GitHub API 换到 Blobs（快 ~10x）

### 25.6 Netlify Blobs 配置

- 在 Netlify UI 中启用 Blobs 存储（Site settings → Blobs）
- Blobs key 设计：
  - `latest-release`：JSON 元数据，每次 CI publish 覆盖
- 无需额外配置；`@netlify/blobs` npm 包在函数运行环境自动可用（zero-config）

### 25.7 Netlify 环境变量

| 变量 | 用途 |
|------|------|
| `UPLOAD_SECRET` | 保护 `POST /api/publish`；仅 CI 和 Netlify dashboard 持有 |

### 25.8 Netlify 配置（netlify.toml）

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

用户在 Netlify UI 只需两件事：
1. 连接 GitHub 仓库 `parksben/type-bridge`
2. 指定 Base directory = `website`


### 25.7 单页落地页（`website/`，v0.9+）

**决策：单页滚动落地页，同技术栈零心智负担**

旧版 `website/` 是信息架构较重的多页文档站，首页虽有 Hero 动画但整体信息密度偏高、视觉冲击不足（用户反馈"不够酷炫大气"）。新版 `website/` 作为**单页滚动落地页**替代旧站，重点在视觉层升级 + 转化路径简化。旧站已删除，新站为唯一官网。

**技术栈与旧站保持完全一致**（降低维护负担）：Next.js 15 App Router + React 19 + TypeScript + Tailwind CSS v4 + lucide-react。

**关键取舍**：

1. **不引 framer-motion / GSAP 等动画库**：旧站 HeroBanner 已证明纯 CSS `@keyframes` + SVG `dasharray` + IntersectionObserver 能做出"粒子流动 / 节点脉冲 / 扫描线叠加"等效果，无需额外依赖。新站继续沿用该套路，bundle size 与旧站对齐。

2. **不共享组件库**：两站各自独立 `app/components/`，不搭建 monorepo。理由：过渡期短，新站一旦稳定旧站会整个删除，抽 shared 反而增加临时成本。

3. **下载接口 `route.ts` 1:1 复制**：不做反向依赖（旧站引用新站代码或反之），两份独立维护。新站稳定后旧站删除时，连带删除旧站的 route.ts，新站不受影响。

4. **场景文案 1:1 照搬**：`website/app/docs/use-cases/page.tsx` 的 `SCENES` 常量（5 场景 icon/title/description/details/tip）复制到新站 `components/scenes.tsx` 本地常量。展示形态不同（纵向长文档 vs. 横向轮播 tab），但文字内容完全一致——保证产品叙事在两站间一致。

**架构**：

```
website/
├── app/
│   ├── layout.tsx                # metadata + dark-mode inline script + lang attribute
│   ├── page.tsx                  # 单页拼装: Hero + Scenes + Flow + Download + Footer
│   ├── globals.css               # Tailwind v4 + CSS tokens + 动画 keyframes
│   ├── dl/[arch]/route.ts        # Route Handler 透传 GitHub Release .dmg（no-store）
│   ├── api/latest-version/route.ts # 检查更新 API（从旧站迁移）
│   └── components/
│       ├── top-nav.tsx           # 锚点导航 + scrollspy + 主题切换 + 语言切换
│       ├── theme-toggle.tsx
│       ├── lang-toggle.tsx       # 中英文切换按钮
│       ├── hero.tsx              # 升级版 HeroBanner（4 端 → 桥接 → 桌面）
│       ├── scenes.tsx            # 5 场景 pill tab 轮播
│       ├── flow.tsx              # 左→右 SVG 流程图
│       ├── download.tsx
│       └── footer.tsx
├── netlify.toml
├── next.config.ts
└── package.json
```

**i18n 方案**：轻量级 React Context + 静态字典，不引入 next-intl / i18next 等重型库。核心思路：

1. `app/lib/i18n.ts` 导出 `LanguageProvider` + `useT()` hook + `Language` type (`"zh" | "en"`)
2. 字典 `DICT` 是一个嵌套的 `Record`，key 结构为 `section.component.field`（如 `hero.headline`）
3. `useT()` 返回 `t(key: string): string`，根据当前语言从字典取值
4. `<html lang>` 属性跟随当前语言；SEO metadata（`<title>`、`<meta description>`、`og:*` 等）在 `layout.tsx` 中通过 `generateMetadata()` + `headers()` 读取 `Accept-Language` 请求头动态切换，英文浏览器访问得英文标题/描述。`isEnglishRequest()` 简单判断 `accept-language` 是否以 `en` 开头，中文为默认兜底。客户端 `langInit` 脚本仍保留作为 `localStorage` 手动语言的二次覆盖
5. 初始语言检测优先级：`localStorage` → `navigator.language` → 中文兜底
6. 各组件通过 `useT()` 读取文案，不再使用组件内硬编码常量

**Scroll Spy 与主题切换实现要点**：

- TopNav 使用 IntersectionObserver 监听 4 个 `<section id="...">`，当前可见 section 对应的 nav item 加 accent 下划线
- 平滑滚动：`html { scroll-behavior: smooth; scroll-padding-top: 72px }`（留出 TopNav 高度避免锚点落在导航下方）
- 主题切换：`<html class="dark">` class-based 切换；持久化到 `localStorage.theme`；`layout.tsx` 顶部 inline script 在 React 水合前读取 localStorage 并同步 class，避免闪烁

**部署策略**：

- 已部署至 Netlify：`typebridge.parksben.xyz`，base directory = `website/`
- 旧版多页文档站（原 `website/`）已从仓库删除；新版单页落地页（原 `website-v2/`）已重命名为 `website/`
- `/api/latest-version` 已从旧站迁移至新站，桌面端检查更新链路不受影响


---

## 二十六、多渠道架构总论（v0.6+）

### 26.1 设计目标

把 v0.5 的"单渠道飞书"扩展为"飞书 / 钉钉 / 企微三渠道并存"，同时保持现有的飞书功能不退化。具体目标：

- 三个渠道**都用原生长连接**（飞书 larkws / 钉钉 Stream Mode / 企微 AI Bot WSS），零公网 IP 依赖
- 用户可只配 1 / 2 / 3 个渠道，未配置的渠道**不启 sidecar**
- 三家收到的消息**进入同一个 FIFO 队列**，依次粘到当前焦点输入框（核心：注入路径完全不变）
- 一家断连不影响其他两家
- HistoryMessage 加 `channel` 字段，UI 支持渠道筛选 + 来源 tag

### 26.2 三大架构选项的权衡

|  | A. 1 sidecar 三渠道并存 | B. 3 sidecar 全启动 | C. 3 sidecar 按需启动（**采用**）|
|--|----------------------|------------------|------------------------------|
| 进程数 | 1 | 3（始终）| 0-3（按配置）|
| 二进制大小 | 1 个，包含三家 SDK | 3 个独立 | 3 个独立 |
| 故障隔离 | 弱（一家挂全挂）| 强 | 强 |
| 实现 | 重（要 mux 三家 SDK）| 轻（每个 sidecar 独立维护）| 轻 |
| 资源占用（用户只用 1 家时）| 偏低 | 偏高（其他两家空跑）| 最低（其他两家不启）|

**采用 C**：每家一个 Go 二进制（`feishu-bridge` / `dingtalk-bridge` / `wecom-bridge`），Rust 启动时按已配置的渠道动态启对应 sidecar。

### 26.3 进程拓扑

```
┌─────────────────── TypeBridge.app ──────────────────────────┐
│                                                             │
│  ┌─────────┐    ┌────────────────────────────────────────┐  │
│  │ WebView │ ◄─►│           Tauri Core (Rust)            │  │
│  │ (React) │    │                                        │  │
│  └─────────┘    │   ┌──────────────────────────────┐     │  │
│                 │   │  ChannelRegistry             │     │  │
│                 │   │   ├─ feishu  → SidecarBridge │     │  │
│                 │   │   ├─ dingtalk → ...          │     │  │
│                 │   │   └─ wecom   → ...           │     │  │
│                 │   └──────────────────────────────┘     │  │
│                 │              ▼                         │  │
│                 │   ┌──────────────────────────────┐     │  │
│                 │   │  injection_worker (single)   │     │  │
│                 │   │   ▼                          │     │  │
│                 │   │  AX Injector                 │     │  │
│                 │   └──────────────────────────────┘     │  │
│                 └────┬───────────┬──────────────┬────────┘  │
│                      │ stdin/out │              │           │
└──────────────────────┼───────────┼──────────────┼───────────┘
                       ▼           ▼              ▼
            ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
            │feishu-bridge│ │dingtalk-    │ │wecom-bridge  │
            │ (larkws)    │ │bridge       │ │ (手写 WSS)    │
            │             │ │ (Stream SDK)│ │              │
            └──────┬──────┘ └──────┬──────┘ └──────┬───────┘
                   │ WSS           │ WSS          │ WSS
                   ▼               ▼              ▼
              飞书开放平台      钉钉开放平台    企微开放平台
```

### 26.4 关键不变量

- **注入 worker 是全局唯一的单实例**——v0.4 的"严格单 worker 串行"约束不动；不同渠道的消息只是数据来源不同，处理路径完全一样
- **三个 sidecar 互相不通信**——事件全部走 stdout 给 Rust，命令全部走 stdin 来自 Rust。Rust 是中央调度
- **不引入新进程**：渠道切换在 Rust `ChannelRegistry` 内完成，没有 supervisor / orchestrator 之类的中间层

---

## 二十七、Channel 抽象与统一 IPC 协议

### 27.1 Rust 侧 ChannelId 枚举

```rust
#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelId {
    Feishu,
    DingTalk,
    WeCom,
}

impl ChannelId {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Feishu => "飞书",
            Self::DingTalk => "钉钉",
            Self::WeCom => "企微",
        }
    }

    pub fn binary_name(&self) -> &'static str {
        match self {
            Self::Feishu => "feishu-bridge",
            Self::DingTalk => "dingtalk-bridge",
            Self::WeCom => "wecom-bridge",
        }
    }
}
```

### 27.2 统一事件协议（Sidecar → Rust）

所有 sidecar 的 stdout JSON Lines **必须包含 `channel` 字段**：

```json
{"type":"status","channel":"feishu","connected":true}
{"type":"message","channel":"dingtalk","message_id":"msg_xxx","sender":"...","text":"...","ts":"..."}
{"type":"image","channel":"wecom","message_id":"msg_xxx","data":"<base64>","mime":"image/png"}
{"type":"selftest_result","channel":"dingtalk","credentials_ok":true,"probes":[...]}
{"type":"feedback_error","channel":"dingtalk","message_id":"...","kind":"reply","code":-1,"msg":"..."}
{"type":"error","channel":"feishu","msg":"..."}
```

Rust 侧的 `SidecarEvent` enum 增加 `channel: ChannelId` 字段（`#[serde(default = "ChannelId::Feishu")]` 兼容旧 sidecar 没带 channel 的事件）。

### 27.3 统一命令协议（Rust → Sidecar）

Rust 写到对应 sidecar 的 stdin。**因为每个 sidecar 只服务自己渠道**，命令本身**不需要 `channel` 字段**——Rust 知道要写给谁。

```json
{"cmd":"selftest"}
{"cmd":"feedback_received","message_id":"msg_xxx"}
{"cmd":"feedback_sent","message_id":"msg_xxx"}
{"cmd":"feedback_failed","message_id":"msg_xxx","reason":"..."}
```

⚠ **命令名变化**：v0.5 飞书的 `reaction` / `reply` 命令是它特有的能力，多渠道下需要抽象成更高语义的 `feedback_*` 命令。每个 sidecar 内部把 `feedback_*` 翻译为该渠道的具体 API：
- 飞书：`feedback_received` → reaction EYES；`feedback_sent` → reaction DONE 替换；`feedback_failed` → reaction CRY 替换 + thread reply
- 钉钉：`feedback_received` → 发送互动卡片"处理中"（保存 card_id 到内存）；`feedback_sent` → `StreamingUpdate` 卡片为"✅ 已输入"；`feedback_failed` → `StreamingUpdate` 卡片为"❌ 失败：原因"
- 企微：同理，用 `aibot_respond_msg` 流式 markdown 卡片

`reaction` / `reply` 旧命令在飞书 sidecar 内**保留**作为内部实现细节（Rust 不再直接发它们）。

### 27.4 Channel Capability struct

不同渠道能力差异较大，用一个 capability 表显式声明：

```rust
pub struct ChannelCapability {
    /// 是否支持给消息加表情反应（飞书独有）
    pub reactions: bool,
    /// 是否支持 thread 内回复（飞书独有，钉钉群无 threading，企微 P2P 无 thread 概念）
    pub thread_reply: bool,
    /// 是否支持接收图片消息
    pub receive_images: bool,
    /// 是否需要单独的"事件订阅"配置（飞书独有，钉钉/企微开箱即用）
    pub requires_event_config: bool,
}

impl ChannelId {
    pub fn capability(&self) -> ChannelCapability {
        match self {
            Self::Feishu => ChannelCapability {
                reactions: true,
                thread_reply: true,
                receive_images: true,
                requires_event_config: true,
            },
            Self::DingTalk => ChannelCapability {
                reactions: false,
                thread_reply: false,
                receive_images: true,
                requires_event_config: false,
            },
            Self::WeCom => ChannelCapability {
                reactions: false,
                thread_reply: false,
                receive_images: true,
                requires_event_config: false,
            },
        }
    }
}
```

UI 用 capability 决定要不要展示某些控件（如选择题里的"事件订阅引导"只对飞书显示）。

---

## 二十八、HistoryMessage schema 演进 + 数据迁移

### 28.1 新 schema

```rust
pub struct HistoryMessage {
    /// 全局唯一 ID：复合键 `{channel}:{source_message_id}`，例如 "feishu:om_xxx"
    /// 用 source_id 做主键时跨渠道有冲突风险（理论上钉钉 / 企微的 msg_id
    /// 命名空间不同，但合并到一个 HashMap 还是用复合键稳）
    pub id: String,
    /// 渠道
    pub channel: ChannelId,                          // ★ 新增
    /// 平台原始 message_id（给 sidecar 调 API 用）
    pub source_message_id: String,                   // ★ 新增
    pub received_at: u64,
    pub updated_at: u64,
    pub sender: String,
    pub text: String,
    pub image_path: Option<String>,
    pub status: MessageStatus,
    pub failure_reason: Option<String>,
    pub feedback_error: Option<FeedbackError>,
    /// 部分渠道（钉钉 / 企微）的状态反馈是通过"互动卡片 + 更新"实现的，
    /// 需要存住卡片 ID 用于后续状态更新
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feedback_card_id: Option<String>,            // ★ 新增
}
```

### 28.2 migration: 旧 history.json 兼容

v0.5 之前的 `history.json` 没有 `channel` / `source_message_id` 字段。读取时用 serde 默认值兼容：

```rust
#[serde(default = "default_feishu")]
pub channel: ChannelId,

#[serde(default)]
pub source_message_id: String,  // 空时从 id 字段推断
```

启动时一次性 scan history.json：

```rust
fn migrate_legacy_history(messages: &mut Vec<HistoryMessage>) {
    for m in messages {
        if m.source_message_id.is_empty() {
            // 旧记录：id 形如 "om_xxx"（飞书原生），整个搬到 source_message_id
            // 新 id = "feishu:om_xxx"
            m.source_message_id = m.id.clone();
            m.id = format!("feishu:{}", m.id);
        }
    }
}
```

迁移幂等：`source_message_id` 已有值时跳过；新启动若发现旧数据则原地改写并 flush 一次。

### 28.3 跨渠道 ID 冲突分析

理论上：飞书 message_id 形如 `om_xxx`，钉钉形如 `msgXXX`，企微形如 `XXXX`（具体格式 TBD）。命名空间天然不重叠，但 **HistoryStore 内部 HashMap 用复合 id 作为 key 保证绝对安全**。

### 28.4 Rust → Go 命令时还原

Rust 收到 UI 操作（"重发"等）时，从 HistoryMessage 拿 `id` 和 `channel`：
1. 用 `channel` 选对应 sidecar
2. 用 `source_message_id` 作为命令 payload 中的 `message_id`
3. 不直接传复合 id 给 sidecar——sidecar 不应该感知复合格式

---

## 二十九、Channel 反馈机制抽象（feedback flow）

### 29.1 三个渠道的反馈差异

| 阶段 | 飞书 | 钉钉 | 企微 |
|------|------|------|------|
| 收到（received）| reaction EYES | 发互动卡片"🟡 处理中"（**保存 card_id**）| 发流式 markdown 卡片"🟡 处理中" |
| 成功（sent）| 删 EYES + 加 DONE | `StreamingUpdate` 卡片为"✅ 已输入" | 流式更新卡片为"✅ 已输入" |
| 失败（failed）| 删 EYES + 加 CRY + thread reply | `StreamingUpdate` 卡片为"❌ 失败：原因" | 流式更新卡片为"❌ 失败：原因" |

### 29.2 抽象命令（Rust → 任一 sidecar）

```rust
pub enum SidecarCommand {
    Selftest,
    FeedbackReceived { message_id: String },
    FeedbackSent     { message_id: String },
    FeedbackFailed   { message_id: String, reason: String },
}
```

每个 sidecar 内部维护一个 `message_id → card_id` 的内存 map（仅钉钉 / 企微需要，飞书无）：

```go
// dingtalk-bridge / wecom-bridge 内部
var feedbackCards sync.Map  // message_id -> card_id

func handleFeedbackReceived(msgID string) {
    cardID := sendInteractiveCard("处理中...")
    feedbackCards.Store(msgID, cardID)
}

func handleFeedbackSent(msgID string) {
    cardID, _ := feedbackCards.Load(msgID)
    streamingUpdate(cardID, "✅ 已输入")
    feedbackCards.Delete(msgID)
}
```

### 29.3 Sidecar 重启时的 card_id 丢失

Sidecar 进程崩溃 / 重启会清空内存 map。这意味着：
- 之前发出去的"处理中"卡片**会卡在那个状态**——无法更新
- 用户视觉上看到"处理中"但实际消息可能已成功输入或失败

**取舍**：接受这个边缘情况。代价是少数几张过时的状态卡片，不影响主功能。后续如有强需求可考虑：
1. 在 HistoryMessage 上持久化 `feedback_card_id`，sidecar 启动时从历史里恢复 map
2. 但这要求 sidecar 能读 history.json，违反"sidecar 只关心自己渠道事件"的设计原则

v1 不做持久化恢复；保留 `HistoryMessage.feedback_card_id` 字段作为未来 hook。

### 29.4 飞书的兼容性

飞书 sidecar 收到 `feedback_*` 命令时翻译为现有的 reaction + reply 调用，**外部 API 不变**——v0.5 的 reaction / reply 命令在飞书 sidecar 内部保留作为底层实现，但 Rust 不再直接发它们。

---

## 三十、钉钉 Stream Mode sidecar 实现

### 30.1 选型

- 二进制：`dingtalk-bridge`（Go），目录 `dingtalk-bridge/`
- 长连接：[`open-dingtalk/dingtalk-stream-sdk-go`](https://github.com/open-dingtalk/dingtalk-stream-sdk-go) 官方维护，稳定
- 模式：仅支持 Stream Mode，不支持 webhook callback（架构上不允许公网回调）

### 30.2 关键代码骨架

```go
// dingtalk-bridge/main.go
cli := client.NewStreamClient(
    client.WithAppCredential(client.NewAppCredentialConfig(clientID, clientSecret)),
)
cli.RegisterChatBotCallbackRouter(func(ctx context.Context, data *chatbot.BotCallbackDataModel) ([]byte, error) {
    handleMessage(data)  // 解析 + emit JSON Lines
    return nil, nil
})

// !!! 和 larkws 不同：dingtalk-stream-sdk-go 的 Start() 是非阻塞的。
// 它同步完成 HTTP gettoken + WSS 握手后 return nil，真正的读循环在内部 goroutine。
// SDK 官方 example 的用法就是 `Start(ctx); select {}`。
if err := cli.Start(ctx); err != nil {
    emitError(err); os.Exit(1)
}
emitStatus(true)
<-sigChan  // 阻塞在信号上，让内部 processLoop 跑
```

**踩坑记录**：最初照抄 feishu-bridge 的"宽限期 select"模式（把 `Start()` 丢 goroutine，2s 内没报错就 emit connected），结果 `Start()` 在 <1s 就返回 `nil`，select 分支立即命中，被误判为 `stream terminated immediately` 并退出——sidecar 永远拉不起来。修正方案是同步调用 `Start()`，非 nil 才算启动失败，nil 就直接 emit `status:true` 并阻塞在信号上。SDK 自带 `AutoReconnect: true`，WSS 中断会在内部重连。

### 30.3 消息载荷映射

`BotCallbackDataModel` → 我们的统一事件：

| 飞书原 SDK 字段 | 钉钉 SDK 字段 | 我们的统一事件字段 |
|---------------|-------------|------------------|
| `event.message.message_id` | `MsgId` | `message_id` |
| `event.sender.sender_id.user_id` | `SenderStaffId` (或 `SenderNick`)| `sender` |
| `event.message.content.text` | `Text.Content` | `text` |
| `event.message.create_time` | `CreateAt` (ms) | `ts` |

消息类型 (`msgtype`)：
- `text` → emit `{"type":"message", ...}`
- `picture` → 用 `Picture.DownloadCode` 调 `/v1.0/robot/messageFiles/download` 拿字节，base64 编码后 emit `{"type":"image", ...}`
- `richText` → 类似飞书 `post`，按段落拼接，图片单独 emit
- 其他（audio / file / video）→ 暂不支持，emit error 提示

### 30.4 反馈实现

**原设计（互动卡片 + StreamingUpdate）已搁置**：卡片路径需要用户在钉钉开发者平台注册卡片模板、保存 `card_biz_id`、再用 Streaming API 原地更新。对 MVP 来讲把"接入门槛从 2 步变成 N 步"得不偿失。

**落地方案：每条用户消息最多对应一条 bot 文字回执**，通过 `data.SessionWebhook` 的 `SimpleReplyText` 实现：

| 时机 | 回执内容 | 对应 capability |
|------|---------|----------------|
| 注入成功 | `✅ 已输入` | `success_text_reply` |
| 注入失败 | `❌ 输入失败：<原因>` | `failure_text_reply` |
| 已接收（中间态） | 不回 —— 注入 <1s，回两条会刷屏 | — |

```go
// dingtalk-bridge/commands.go，handleReply
replier := chatbot.NewChatbotReplier()
return replier.SimpleReplyText(ctx, webhook, []byte(text))
```

`sessionWebhook` 有效期约 1h（由 `SessionWebhookExpiredTime` 控制），本地用 `msgID → (webhook, expireAt)` map 记住（`rememberSession` 在 handleMessage 入口调用），发回执时查表用，过期则吞掉不阻塞主流程。对"注入完成"这个秒级场景，过期可忽略。

飞书侧 `success_text_reply = false`：它有 `reactions` 能力，`✅` 表情贴在原消息上，没必要再发一条新文字。能力矩阵见 [channel.rs](src-tauri/src/channel.rs)。

### 30.5 selftest 实现

钉钉的 selftest 比飞书简单——没有 scope 概念，所以只验证凭据：

```go
// 调 /gettoken 获取 access_token，能拿到就算通过
resp, err := getAccessToken(clientID, clientSecret)
if err != nil || resp.AccessToken == "" {
    return SelftestResult{
        CredentialsOk: false,
        CredentialsReason: err.Error(),
    }
}
return SelftestResult{
    CredentialsOk: true,
    Probes: []ProbeResult{},  // 钉钉无 scope probe
}
```

UI 上仍渲染清单结构，只是 probes 数组为空，主要看"凭据可用 ✓"+ Stream Mode 静态引导。

**文案按渠道差异化**：`SelftestChecklist` 的"凭据可用"hint、失败兜底提示、Stream Mode 引导块的按钮文案要按 `channel` 参数切换，避免飞书术语（App ID / App Secret / tenant_access_token / open.feishu.cn）泄漏到钉钉面板。钉钉侧使用 "Client ID / Client Secret 能换到 access_token" + "去钉钉开发者平台"。

**静态引导块不挂「查看文档」外链**（飞书 / 钉钉统一遵循）——官网 `/docs/{channel}` 已经是维护的入口，在桌面应用里再多放一个外链只会分散点击、制造冗余。清单底部只保留"去配置页"这一个动作链接。

---

## 三十一、企微 AI Bot 长连接 sidecar 实现

### 31.1 选型

- 二进制：`wecom-bridge`（Go），目录 `wecom-bridge/`
- 长连接：**Go 手写 WSS 协议**（无官方 Go SDK；Node 官方 SDK 不在我们技术栈内）
- 端点：`wss://openws.work.weixin.qq.com`
- 协议参考：[企微智能机器人长连接](https://developer.work.weixin.qq.com/document/path/101463)

### 31.2 协议要点

- 鉴权：连接后立刻发 `aibot_subscribe` 帧带 botId + secret
- 订阅成功后接收 `aibot_msg_callback`（用户消息）/ `enter_chat`（进会话）等帧
- 心跳：30s 一次 ping，超时则被服务端断连
- 媒体加密：image / file / video 帧自带 per-URL `aeskey`，AES-256-CBC + PKCS#7（与回调模式 EncodingAESKey 不同）
- 单连接限制：同一个机器人**同时只能一条活动 WSS**，新连接会踢旧连接

### 31.3 实现骨架（Go）

```go
// wecom-bridge/client.go
type Client struct {
    botID, secret string
    conn          *websocket.Conn
    writeMu       sync.Mutex                // WriteMessage 并发写保护
    reqIDs        sync.Map                  // msgID → reqID（reply 时透传）
    streams       sync.Map                  // msgID → streamID（同一条消息复用）
    lastPong      atomic.Value              // time.Time，心跳超时判定
}

func (c *Client) Run(ctx context.Context) error {
    c.conn = dial("wss://openws.work.weixin.qq.com")
    if err := c.subscribe(ctx); err != nil {     // 发 aibot_subscribe 等 errcode==0 ack
        return err
    }
    go c.pingLoop(ctx)                            // 27s 间隔 ping；>60s 无 pong 取消 ctx
    return c.readLoop(ctx)                        // 阻塞；返回即触发 main.go 退出
}
```

`aibot_subscribe` 帧格式（官方 2026/04/15）：

```json
{"cmd":"aibot_subscribe","headers":{"req_id":"<uuid>"},"body":{"bot_id":"...","secret":"..."}}
```

响应 `{"headers":{"req_id":"<echoed>"},"errcode":0,"errmsg":"ok"}`，errcode ≠ 0 即为启动失败（凭据错 / bot 被禁）。依赖：`github.com/gorilla/websocket`（主流、稳定）+ `github.com/google/uuid`。

### 31.4 反馈实现

企微 `aibot_respond_msg` 的 `stream.id + finish` 机制允许**同一 stream.id 多次推送等于原地更新消息内容**，这比钉钉"多条文字回执"优雅得多。

```go
// 首次推送（finish=false）→ bot 侧出现新消息
respondStream(reqID, streamID, "🟡 处理中...", false)

// 继续推送相同 streamID（finish=false）→ 原地更新内容
respondStream(reqID, streamID, "⚙️ 注入中...", false)

// 最终推送（finish=true）→ 原地更新 + 关闭流
respondStream(reqID, streamID, "✅ 已输入", true)
```

关键约束：
1. `headers.req_id` **必须透传** message callback 的 req_id；否则服务端拒绝关联。
2. `stream.id` 同一消息生命周期复用；新消息生成新 streamID。
3. 从首次推送开始 10 分钟内必须发 finish=true，否则自动结束。
4. 同一会话回复 + 主动推送合计限流 30 条/分钟、1000 条/小时。

**req_id / stream_id 封装**：这两个都是协议传输层细节，不泄漏给 Rust。Go 内部维护 `reqIDs sync.Map[msgID]reqID` + `streams sync.Map[msgID]streamID`。Rust 只发 `StreamingReply { message_id, content, finish }`，Go 收到后查表组装帧。`finish=true` 时延迟 1s 清 map。

### 31.5 selftest 实现

企微没有"换 token"流程——订阅成功即可用。selftest 直接读一个 `atomic.Bool subscribed` 标志：已订阅返回 `credentials_ok:true`；未订阅返回 false + 具体 errmsg。UI 渲染清单结构，"凭据可用 ✓" + API 模式静态引导。

### 31.6 消息载荷字段映射

| 我们的事件字段 | 企微 frame 字段 |
|---|---|
| `message_id` | `body.msgid` |
| `sender` | `body.from.userid` |
| `text` | `body.text.content` |
| `ts` | `body.msgid` 的附带时间戳（或落 `time.Now().Unix()`） |

图片消息：`body.image.url` + `body.image.aeskey`，AES-256-CBC + PKCS#7 解密（IV = aeskey 前 16 字节），下载后 base64 编码 → emit `{"type":"image","data":"..."}`。下载 URL 5min 有效期，收到 callback 后立即 fetch，不 defer。

### 31.7 单连接互斥

文档明示"同一机器人同一时刻只能一条活动 WSS"——新订阅会踢旧连接，服务端给旧连接发 `disconnected_event`（`aibot_event_callback` 的 eventtype），随后主动断开。本次最小处理：Go 侧收到 `disconnected_event` → emit `error msg="kicked"` + `status:false` → 退出进程，让 Rust 现有 2s→60s 指数退避接管。UI tab 顶部 banner 加静态提示"同一企微机器人同时只能一台设备使用，多设备登录会互相挤掉"。

### 31.8 心跳机制

27s ticker 发 `{"cmd":"ping","headers":{"req_id":"<uuid>"}}`；`readLoop` 收到 pong 后更新 `lastPong`。`pingLoop` 每次 tick 检查 `time.Since(lastPong) > 60s` 则 cancel ctx 触发 Run 返回。选 27s（不是 30s）是给服务端留余量，防止网络抖动导致误判死连接。

---

## 三十二、UI 多渠道扩展

### 32.1 SideBar 底部连接状态

从单个 dot 变成多 dot 排列：

```tsx
// 仅展示已配置过凭据的渠道
const configuredChannels: ChannelId[] = useConfiguredChannels();

return (
  <div className="mt-auto px-3 py-3 flex flex-col gap-1.5"
       style={{ borderTop: "1px solid var(--border)" }}>
    {configuredChannels.map((ch) => (
      <ChannelStatusRow key={ch} channel={ch} />
    ))}
    {configuredChannels.length === 0 && (
      <div className="text-[11px] text-subtle">尚未配置任何渠道</div>
    )}
  </div>
);
```

每行：渠道 label + 状态点（脉冲 / idle）。

### 32.2 ConnectionTab 抽象（飞书 / 钉钉 / 企微 三个 Tab 共享框架）

新建 `tabs/ConnectionTabBase.tsx`，按 props 渲染：

```tsx
interface Props {
  channel: ChannelId;
  intro: { hint: string; portalUrl: string };
  fields: FieldDef[];                  // 凭据字段定义
  validate: (values) => FieldErrors;
  staticGuide?: GuideStep[];           // 平台特定的引导步骤
}
```

各渠道的 tab 组件只是 props 不同：
- `FeishuConnectionTab` — 沿用现有 ConnectionTab 实现，重构提取共用 base
- `DingTalkConnectionTab` — 新建，基于 base
- `WeComConnectionTab` — 新建，基于 base

### 32.3 HistoryTab 渠道筛选 chip

```tsx
const filters: ChannelFilter[] = [
  { id: "all", label: "全部" },
  ...configuredChannels.map((ch) => ({ id: ch, label: ch.label() })),
];

const visible = useMemo(() =>
  history.filter((m) =>
    activeFilter === "all" || m.channel === activeFilter
  ).filter((m) => !hiddenIds.has(m.id)),
[history, activeFilter, hiddenIds]);
```

每个 chip 计数独立计算（基于 `history`，不受 `activeFilter` 影响）。

### 32.4 HistoryCard 渠道 tag

卡片右上角与状态 tag 相邻：

```tsx
<div className="flex items-center gap-1.5">
  <ChannelTag channel={message.channel} />   {/* 飞书/钉钉/企微 */}
  <StatusTag status={message.status} />      {/* 已发送/失败 */}
</div>
```

`ChannelTag` 颜色：飞书 = `var(--accent)`、钉钉 = #2378e7（蓝）、企微 = #07c160（绿）。

### 32.5 SystemLogTab 渠道前缀

LogEntry 加 `channel?: ChannelId` 字段（可选——全局事件无渠道）。前端渲染时按字段决定前缀：

```tsx
{log.channel ? (
  <span className="font-mono text-[11px]" style={{ color: channelColor(log.channel) }}>
    [{log.channel.label()}]
  </span>
) : null}
{" "}{log.text}
```

LogEntry 的 channel 由后端在 emit log 时显式带上，前端不做推断。

### 32.6 不引入第二种导航模式

历史筛选只用 chip，不用左侧二级菜单 / 折叠面板等更重的 UI——保持 v0.5 已有 layout 的简洁性。

---

## 三十三、设置存储 schema 演进 + 迁移

### 33.1 旧 schema（v0.5）

```json
{
  "feishu_app_id": "cli_xxx",
  "feishu_app_secret": "xxx",
  "auto_submit": true,
  "submit_key": { ... }
}
```

### 33.2 新 schema（v0.6+）

```json
{
  "channels": {
    "feishu": { "app_id": "cli_xxx", "app_secret": "xxx" },
    "dingtalk": { "client_id": "ding_xxx", "client_secret": "xxx" },
    "wecom": { "bot_id": "...", "secret": "..." }
  },
  "auto_submit": true,
  "submit_key": { ... }
}
```

### 33.3 自动迁移逻辑（Rust 启动时一次性）

```rust
fn migrate_legacy_settings(store: &Store) -> Result<()> {
    if store.has("channels") {
        return Ok(());  // 已是新 schema
    }
    let mut channels = serde_json::Map::new();
    if let Some(app_id) = store.get("feishu_app_id") {
        if let Some(app_secret) = store.get("feishu_app_secret") {
            channels.insert("feishu".into(), json!({
                "app_id": app_id, "app_secret": app_secret,
            }));
        }
    }
    store.set("channels", json!(channels));
    store.delete("feishu_app_id");
    store.delete("feishu_app_secret");
    store.save()?;
    Ok(())
}
```

迁移幂等：第二次调用直接 return（已有 `channels` 键）。

### 33.4 InputSettingsTab 不变

`auto_submit` / `submit_key` 仍在顶层，不放到 `channels.*`——它们是与渠道无关的全局设置。

---

## 三十四、落地阶段

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| **P0 设计 + scaffold** | TECH_DESIGN / REQ 完成；ChannelId enum / 统一事件协议 / HistoryMessage schema 落地（不动 sidecar）| 1 天 |
| **P1 钉钉 MVP** | dingtalk-bridge Go sidecar；DingTalkTab UI；钉钉 selftest；端到端跑通文本消息接收 + 输入 | 2-3 天 |
| **P2 钉钉完整功能** | 钉钉图片消息接收；状态反馈卡片（feedback_received/sent/failed）；UI 渠道筛选 + tag + 日志前缀 | 1-2 天 |
| **P3 企微 MVP** | wecom-bridge Go 手写 WSS；WeComTab UI；企微 selftest；文本消息端到端 | 3-4 天（含手写协议）|
| **P4 企微完整功能** | 企微图片解密；流式 markdown 卡片反馈 | 1-2 天 |
| **合计** | | **约 8-12 天** |

实际节奏可根据反馈调整。P0 必须先于其他阶段完成——所有后续工作都依赖统一的 ChannelId / 事件协议 / HistoryMessage schema。

---

## 三十五、WebChat 渠道（本地局域网 + Socket.IO）

> **v2 重构**：原方案（Netlify 中继 + HTTP 轮询 + 前端 WASM Whisper）在国内网络下下载慢、并发硬顶，v2 彻底简化为"**桌面 App 内嵌本地 HTTP + Socket.IO server，同 WiFi 手机直连**"。不依赖任何云端服务。

### 35.1 总体架构

```
┌─────────────────────────────┐                ┌──────────────────────────┐
│ 桌面 App (Tauri Rust)       │                │ 手机浏览器（同 WiFi）   │
│                             │                │                          │
│ WebChatConnectionTab       │                │  扫 QR                   │
│   点"启动会话"             │                │  http://192.168.1.5:8723 │
│     │                       │                │          │                │
│     ▼                       │                │          ▼                │
│  WebChatBridge              │                │  SPA (Vite/React)        │
│   ├─ webchat_server.rs      │                │   ├─ UA 检测（PC 拦截）  │
│   │   axum + socketioxide   │◄──socket.io───►│   ├─ OTP 握手            │
│   │   绑 0.0.0.0:8723       │    over HTTP   │   ├─ 聊天界面（文/图）   │
│   ├─ webchat_net.rs         │                │   └─ 语音按钮 → 弹       │
│   │   LAN IP + WiFi SSID    │                │       提示 "用输入法"    │
│   └─ 静态资源（SPA dist）    │                └──────────────────────────┘
│     (Tauri resources)       │
│                             │                ┌──────────────────────────┐
│ → injector queue (已有)     │                │ 手机 2 / 手机 3...       │
│   → 注入到焦点输入框        │                │   同样流程              │
└─────────────────────────────┘                └──────────────────────────┘
```

**关键不同点 vs. v1**：
- ❌ Netlify 中继 / Blobs 存储 / 9 个 HTTP endpoint → ✅ 本机 server 单域 `/socket.io` + 静态资源
- ❌ 桌面长轮询 `/api/pull` → ✅ Socket.IO 推送
- ❌ `getUserMedia` + WASM Whisper → ✅ 引导用户用手机输入法麦克风
- ❌ 自签证书 HTTPS → ✅ 明文 HTTP（局域网内部，服务仅本机可达）
- ❌ IM 内置浏览器拦截 → ✅ 除 PC 外全放行

### 35.2 Socket.IO 事件协议（v1）

**命名空间**：`/webchat`

**客户端 → 服务端**（`socket.emit`）：
| event | payload | ack |
|---|---|---|
| `hello` | `{otp, clientId}` | `{ok:true,userToken,wifiName}` \| `{ok:false,reason}` |
| `text` | `{clientMessageId, text}` | `{success, reason?}`（注入完成回调） |
| `image` | `{clientMessageId, data:base64, mime}` | `{success, reason?}` |
| `key` | `{clientMessageId, code}` | `{success, reason?}` 控制键事件，详见 §35.11 |

**服务端 → 客户端**（`socket.emit`）：
| event | payload |
|---|---|
| `session_closed` | `{reason:"server_stopped"\|"session_expired"\|"kicked"}` |

**好处 vs. 原生 WebSocket**：
- 重连：`io.connect({reconnection: true})` 内置指数退避
- 心跳：Socket.IO 内建 `pingInterval / pingTimeout`
- ack：`socket.emit(event, data, ackCb)` 自带 RPC 语义，替代自定义 clientMessageId 追踪
- 多设备：服务端 `io.to("session_xxx").emit(...)` 房间机制 broadcast

### 35.3 内存模型（Rust 侧）

**Session**（单会话单 instance；启动会话即创建，停止即销毁）：
```rust
struct WebChatSession {
    session_id: String,           // ses_<random>
    otp_hash: [u8; 32],           // sha256(otp)
    otp_plain: String,            // 仅在内存，UI 展示用
    otp_attempts: u8,             // 0..5
    otp_locked: bool,
    created_at: Instant,
    expires_at: Instant,          // created + 5min（未握手前）
    bindings: HashMap<String, ClientBinding>, // clientId -> 绑定信息
}

struct ClientBinding {
    user_token_hash: [u8; 32],
    bound_at: Instant,
    ua: String,                   // 简化展示用
    socket_id: Option<String>,    // socketioxide 的 SocketRef
}
```

**不持久化**：进程退出全部消失。

### 35.4 桌面端 webchat.rs + webchat_server.rs

```rust
// webchat_server.rs
pub struct WebChatServer {
    cancel: CancellationToken,
    handle: JoinHandle<()>,
    port: u16,
    lan_ip: IpAddr,
    wifi_name: Option<String>,
}

impl WebChatServer {
    pub async fn start(ctx: AppContext, session: Arc<WebChatSession>) -> Result<Self> {
        let port = bind_port_with_fallback(8723..=8732)?;
        let lan_ip = webchat_net::primary_lan_ip()?;
        let wifi_name = webchat_net::current_wifi_ssid().ok();

        // axum router
        let (io_layer, io) = SocketIo::builder().build_layer();
        io.ns("/webchat", on_connect_handler(ctx.clone(), session.clone()));

        // ⚠️ axum 0.7 坑：`.layer()` 只作用于**调用它之前**已注册的 routes/fallback。
        // 所以 `fallback_service` 必须在 `.layer(io_layer)` 之前挂上，否则
        // `/socket.io/*` 会落到 fallback（ServeDir）被 404 吃掉，socketioxide
        // 永远看不到握手请求，手机端表现为「握手超时」。
        let app = axum::Router::new()
            .route("/", get(serve_index))          // SPA index.html
            .route("/assets/*path", get(serve_asset)) // SPA static
            .fallback_service(serve_dir)           // 先挂 fallback
            .layer(io_layer);                      // 再挂 layer，此时会包住 fallback

        let listener = TcpListener::bind((lan_ip, port)).await?;
        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move { cancel_clone.cancelled().await })
                .await;
        });
        Ok(Self { cancel, handle, port, lan_ip, wifi_name })
    }

    pub async fn stop(self) {
        self.cancel.cancel();
        let _ = self.handle.await;
    }
}
```

**生命周期管理**：
- 启动："启动会话" command → `WebChatServer::start`
- 停止："停止会话" command → `stop()` + drop session
- 应用退出：`tauri::Builder.on_window_event(CloseRequested)` → 调 `stop()`
- Drop：`impl Drop for WebChatServer` 调 `cancel.cancel()`（同步，tokio task 会在后台清理）
- 端口冲突：8723→8732 递增尝试；全占报错给 UI

**Socket.IO handler**（on_connect）：
```rust
|socket: SocketRef| async move {
    // 1. 等 hello
    socket.on("hello", |s, Data::<HelloMsg>(msg), ack: AckSender| async move {
        let valid = verify_otp_and_bind(&session, msg.otp, msg.client_id).await;
        match valid {
            Ok(user_token) => {
                s.join("bound");
                ack.send(HelloAck::ok(user_token, wifi_name)).ok();
            }
            Err(reason) => ack.send(HelloAck::err(reason)).ok(),
        }
    });
    // 2. text / image
    socket.on("text", |s, Data::<TextMsg>(msg), ack: AckSender| async move {
        let qm = build_queued_message(ChannelId::WebChat, msg);
        ctx.injector.enqueue(qm).ok();
        // ack 在 queue worker 完成注入后通过 listener 回调（或用 channel 传递）
    });
    // ...
}
```

**ack 回流**：queue worker 注入完成后 emit 全局 `typebridge://message-status` 事件，webchat_server 订阅该事件根据 clientMessageId 找到对应 `AckSender` 回调给手机。这一路比 v1 的 poll-status + ack 简单得多。

**OTP 轮换语义（vs. server 重启）**：

早期版本里，"重启会话"按钮做的是 `stop_webchat` + `start_webchat` — 新生成 sessionId + OTP，但**副作用是踢掉所有已绑定的手机**（bindings 在 `WebChatServer` struct 里，随 server 被 drop）。这不是用户期望的语义。

正确的模型：把"轮换 OTP"和"重启 server"拆成两个独立操作：

| 操作 | 改动 | 保留 | 触发 |
|---|---|---|---|
| `rotate_otp` | 新 `otp_plain` / `otp_hash` / `expires_at_unix_ms` + 重置 `otp_attempts` / `otp_locked` | `session_id`、`bindings`、`port`、`lan_ip`、server task 本身 | ① 前端倒计时归零时自动调 ② 锁定态用户点"重置 OTP" |
| `stop_webchat` | 整个 server drop，所有 bindings 清空，`pending_acks` 全部以 failure 回调 | 无 | 用户主动点"停止"或 App 退出 |

`session_id` 是绑在 QR URL 里（`/?s=ses_XXX`）的，轮换 OTP 时**不变**，所以手机扫到的 QR 不会失效，只需输入新 OTP 即可。

实现上把 OTP 相关字段（`otp_plain` / `otp_hash` / `expires_at_unix_ms` / `otp_attempts` / `otp_locked`）从 `WebChatServer` struct 直接字段和分散的 Atomics 合并进一个 `Mutex<OtpState>`，`rotate_otp()` 一把锁全量替换：

```rust
struct OtpState {
    plain: String,
    hash: [u8; 32],
    expires_at_ms: i64,
    attempts: u8,
    locked: bool,
}

impl WebChatServer {
    pub fn rotate_otp(&self) {
        let plain = generate_otp();
        let hash = sha256_hash(plain.as_bytes());
        let expires_at_ms = now_ms() + SESSION_TTL_SECS as i64 * 1000;
        let mut g = self.state.otp.lock().unwrap();
        *g = OtpState { plain, hash, expires_at_ms, attempts: 0, locked: false };
    }
}
```

UI 触发：前端 `WebChatConnectionTab` 用 setInterval 维持 1Hz 倒计时，`remainingSecs === 0` 时自动 `invoke("webchat_rotate_otp")`，Tauri command 调 `rotate_otp()` + emit `typebridge://webchat-session-update` 刷新 snapshot，前端拿到新 OTP + 新 expires_at，进度条回满。

### 35.5 webchat_net.rs（LAN IP + WiFi SSID）

```rust
pub fn primary_lan_ip() -> Result<IpAddr> {
    // local-ip-address crate
    // 优先 WiFi 网卡（en0 on macOS），跳过 VPN / 回环
    let ifaces = local_ip_address::list_afinet_netifas()?;
    for (name, ip) in ifaces {
        if is_wifi_interface(&name) && ip.is_ipv4() && !ip.is_loopback() {
            return Ok(ip);
        }
    }
    // Fallback：任意非回环 IPv4
    local_ip_address::local_ip()
}

pub fn current_wifi_ssid() -> Result<String> {
    // macOS: 调 CoreWLAN FFI（objc2）
    //   CWWiFiClient.shared().interface().ssid()
    // 失败则 None，UI 展示 "未知 WiFi"
    #[cfg(target_os = "macos")]
    { core_wlan_ffi::current_ssid() }
    #[cfg(not(target_os = "macos"))]
    { Err(anyhow!("not implemented on this platform")) }
}
```

### 35.6 前端工程（webchat-local/）

```
webchat-local/
├── package.json              # vite + react + ts + tailwind + socket.io-client
├── vite.config.ts            # base: "/"，build.outDir: "dist"
├── tsconfig.json
├── tailwind.config.ts
├── index.html                # <div id="root">
└── src/
    ├── main.tsx
    ├── App.tsx               # 状态机路由
    ├── lib/
    │   ├── ua.ts             # PC / mobile 检测（不再区分 IM 浏览器）
    │   └── socket.ts         # socket.io-client 封装
    ├── components/
    │   ├── PCBlockView.tsx   # PC 拦截页
    │   ├── HandshakeForm.tsx # 6 位 OTP 输入
    │   ├── ChatPage.tsx      # 移动端聊天页
    │   ├── MessageBubble.tsx
    │   ├── ComposerBar.tsx
    │   └── ImagePicker.tsx
    └── styles/
        └── globals.css
```

**状态机**：
```
loading → 读 URL ?s=<sessionId> 并 UA 检查
  ├─ PC UA           → PCBlockView
  └─ Mobile UA       → Handshake
                        └─ OTP 正确 → Chat
                        └─ OTP 错 5 次 → ErrorScreen("locked")
                        └─ 桌面断开 → ErrorScreen("disconnected")
```

**语音入口（已下线）**：早期版本曾在输入栏内放一个 `VoiceButton`，点击弹 `VoiceHintModal` 引导用户用输入法麦克风。该按钮 + 弹层均已**整体移除**——它本身不做任何事（没有录音 / 没有识别），只起"教用户去点系统键盘麦克风"的作用，但反而让 WebChat 看起来像有语音功能、点了又什么都没发生，造成误解。直接删掉是最干净的方案。原 VoiceButton 在 ComposerBar 中占据的位置改放"控制键面板展开/收起"切换按钮（详见 §35.11.4）。

### 35.7 Tauri 集成

**tauri.conf.json**：
```json
{
  "build": {
    "beforeBuildCommand": "cd webchat-local && npm run build && cd .. && npm run build"
  },
  "bundle": {
    "resources": ["resources/webchat-local/**/*"]
  }
}
```

**Rust 读 resource**：
```rust
fn serve_index(State(app): State<AppHandle>) -> impl IntoResponse {
    let path = app.path().resolve("webchat-local/index.html", BaseDirectory::Resource).unwrap();
    let body = std::fs::read_to_string(path).unwrap();
    Html(body)
}
```

**beforeBuildCommand** 会在 `npm run tauri build` 前自动：
1. `cd webchat-local && npm run build` → 生成 `webchat-local/dist/`
2. `cd .. && npm run build` → 主 React 前端构建
3. Tauri 根据 `bundle.resources` 把 `resources/webchat-local/**` 打包进 .app

本地 dev (`npm run tauri dev`) 通过根 `package.json` 的 `dev` 脚本用 `concurrently` 同时拉起：
1. **桌面前端 Vite**（端口 1420）—— Tauri 主窗口
2. **WebChat SPA Vite**（端口 5173，host `0.0.0.0`，LAN 可达）—— 同 WiFi 手机能直连

dev 模式下 [webchat_server.rs](../src-tauri/src/webchat_server.rs) 的 fallback 行为切换为 **302 重定向到 5173**，让手机端通过 Vite dev server 加载页面，HMR 原生工作（改 webchat-local 源码 → 手机端**无需手动刷新**自动热更新）。

**dev 链路（`cfg!(debug_assertions)` 分支）**：
```
手机扫 QR  →  http://<lan_ip>:8723/?s=<sid>
                    │
                    ▼  Rust dev fallback handler
        302 Location: http://<lan_ip>:5173/?s=<sid>&apiPort=8723
                    │
                    ▼
手机加载 5173 (Vite) → HMR 走 5173 (ws://lan:5173)
SPA 内 socket.io-client 看到 ?apiPort=8723 → 显式连
              http://<lan>:8723/socket.io/  (跨源，CORS 已 permissive)
```

为什么不做完整反向代理：完整代理需要 Rust 侧 reqwest + tokio-tungstenite 处理 HTTP+WS 双向转发，~150 行；302 redirect 仅 ~10 行实现等价收益（页面经 Vite，Socket.IO 走 8723），唯一差异是浏览器地址栏从 `8723` 跳到 `5173`，dev 自用无影响。

**生产链路（release build）**：保持原状 — 8723 直接 `ServeDir` 加载 `webchat-local/dist/`，Socket.IO 同源连接。

**前端识别 dev 链路**：[App.tsx](../webchat-local/src/App.tsx) 启动时读 `URLSearchParams` 的 `apiPort`：
- 命中 → `WebChatClient({ url: "http://" + window.location.hostname + ":" + apiPort })`
- 缺失（生产） → `WebChatClient({})` 同源连接

### 35.8 安全模型

- OTP 只在桌面内存（明文 + hash）；进程退出即消失
- ownerToken 概念删除（不再有 owner/user 对等关系，桌面直接持 session 状态）
- userToken 每次握手独立签发（32 字节 base64url），仅通过 Socket.IO ack 传回给对应设备；中间人无法劫持（局域网 ARP 攻击除外，视作可接受风险）
- server 仅绑 LAN IP，**不绑 0.0.0.0**？权衡：绑 0.0.0.0 能覆盖多网卡场景（WiFi + Ethernet 同时接入），但也意味着 VPN 进入者能看到。选 `bind(lan_ip)` 更安全；如果用户切换 WiFi 则 server 失效需要重启

### 35.9 已解决的历史痛点

| 痛点 | v1 方案 | v2 方案 |
|---|---|---|
| 模型下载慢（国内到 Netlify） | 迁移 Netlify 加速、CDN 自托管 | **不下载，前端完全无 ASR 代码** |
| Netlify Function 并发硬顶 30-60 | 无解，只能升级 Pro | **不限并发，本机 tokio 直接接** |
| Web Speech API 国产 Android 不可用 | WASM Whisper 替代 | **放弃浏览器 ASR，用输入法** |
| q8 模型和 onnxruntime-web 不兼容 | 切 int8 | **不再使用 ONNX 模型** |
| 下载失败无自动重试 | 指数退避重试逻辑 | **不再下载** |
| 下载面板不能收起 | VoiceButton 编排 + SVG 环形 | **不再下载** |
| 进度条抖动 + 99% 失败 | 固定分母 + monotonic | **不再下载** |

### 35.9.1 v2 踩过的坑

**axum 0.7 `.layer()` 和 `.fallback_service()` 的顺序陷阱**

现象：手机扫码后输入 OTP，前端报「握手超时，请检查 WiFi」。桌面端日志显示 server 启动正常、LAN IP 正确，但**整个会话周期 0 条「client connected: sid=...」** — socketioxide 从未收到过任何连接请求。

根因：`.layer(X)` 只作用于**它被调用时已经注册的**路由 / fallback。当代码写成

```rust
Router::new()
    .route("/healthz", ...)
    .route("/__placeholder", ...)
    .layer(io_layer)               // ← 此时 fallback 还没挂
    .fallback_service(serve_dir);  // ← fallback 不被 layer 包住
```

时，`/socket.io/?EIO=4&transport=polling` 这类请求不匹配任何显式路由，直接落到 fallback（ServeDir）被 404 吃掉，`io_layer` 根本没机会拦截。手机端 socket.io-client 的 `.timeout(8000).emit("hello", ...)` 就只能等满 8s 后以 "timeout" 回调。

修复：把 `fallback_service` 挪到 `.layer()` **之前**调用即可。

```rust
Router::new()
    .route("/healthz", ...)
    .fallback_service(serve_dir)   // 先挂 fallback
    .layer(io_layer)                // layer 包住 routes + fallback
    .layer(cors);
```

这样 `io_layer` 能看到所有进入 Router 的请求，自己 short-circuit 处理 `/socket.io/*`，其余透传到 fallback serve SPA 静态资源。以后新增中间件（tracing、rate-limit 等）也要注意这个顺序。

### 35.10 v2 主动放弃的能力

- **WebChat 网页里没有一键录音按钮**：用户看到的是"点语音 → 弹提示 → 点输入框 → 用键盘麦克风"两步
- **无法跨 WiFi 使用**：手机必须和电脑同 WiFi；跨网段场景请用飞书/钉钉/企微渠道
- **不支持 WAN 接入**（家里电脑 server 手机在 4G 上）：需要公网穿透 / IPv6 / Tailscale 等基础设施，v2 不提供

### 35.11 控制键事件（手机端快捷按键 → 桌面键盘事件）

WebChat 移动端的"控制键面板"（详见 REQUIREMENTS §2.10.4.1）发送的不是文本，而是离散按键事件（Enter / Backspace / Space / Arrow*）。设计目标是：让事件**严格按用户点击的先后顺序**与文本/图片消息一起串行注入到桌面焦点输入框，避免回车插在粘贴中间提前提交。

#### 35.11.1 协议（Socket.IO 增量）

新增客户端 → 服务端事件：

| event | payload | ack |
|---|---|---|
| `key` | `{userToken, clientMessageId, code}` | `{success, reason?}`（注入完成回调，与 text/image 一致） |

`code` 是 W3C `KeyboardEvent.code` 字符串，**取值受 server 白名单约束**（见 35.11.3）。

#### 35.11.2 队列模型扩展（Rust 侧）

`QueuedMessage` 新增可选字段 `key: Option<String>`（KeyboardEvent.code）。三种载荷互斥：

- `key.is_some()` → worker 跳过剪贴板/粘贴流程，直接调 `injector::simulate_submit(SubmitKey { key: code, ..no_modifiers })`
- 否则按既有 `text` / `image_path` 分支走粘贴流程

worker 命中 key 分支时：
- **不发** reaction / streaming_reply / success_text_reply（按键事件没有 IM 来源消息可反馈）
- **不写** HistoryMessage（按键事件不应污染历史消息列表，且数量可能较高）
- 仍走 `cancelled` 集合判断 + 状态事件 `processing → sent/failed`，让 webchat_server 的 `pending_acks` 能在注入完成时回 ack 给手机

注入完成后**不**再触发 SubmitKey 的"自动提交"——这是用户主动按下的按键，本身就是提交意图，再叠加一次会导致双触发。

#### 35.11.3 安全：按键白名单

`webchat_server.rs` 的 `handle_key` 在 enqueue 前必须检查 `code` 是否在常量白名单内：

```rust
const ALLOWED_KEY_CODES: &[&str] = &[
    "Enter", "Backspace", "Space",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
];
```

不在白名单的 code 立即 ack `{success:false, reason:"unsupported key"}`，**绝不入队**。理由：手机端 SPA 是静态资源，理论上可能被改造成发送任意 code（包括 `KeyA` / `Cmd+...`），白名单是 server 侧的最后防线，避免 WebChat 变成"远程任意按键执行"通道。后续若要扩展按键集合（Tab、Esc 等），在此常量加入即可。

`injector::ecode_to_macos_keycode` 已经内置完整 keycode 表（含字母数字），所以扩展只需改白名单 + 前端 UI；reject 路径保证未知 key 不会传到 CGEventPost。

#### 35.11.4 前端组件（webchat-local）

新增 `components/ShortcutKeysPanel.tsx`：

- 单行水平排列 7 个按钮，**从左到右顺序固定为**：ArrowUp / ArrowDown / ArrowLeft / ArrowRight / Space / Enter / Backspace（删除键置最右）。全部用 `lucide-react` 图标（ArrowUp/Down/Left/Right / Space / CornerDownLeft / Delete）
- 接收 `onPress(code)` 回调；点击调用 `WebChatClient.sendKey(clientMessageId, code)`，不在本地 chat 列表显示气泡（按键事件不是消息）
- 失败时（白名单拒绝 / 注入失败）顶部短暂浮一行 toast 文案，复用现有 `imageError` 通道

`ComposerBar.tsx` 的"展开/收起"切换按钮**内嵌在输入栏右侧、原 VoiceButton 的位置**（VoiceButton + VoiceHintModal 已整体下线，参见 §35.6 末尾说明），不再使用悬浮 tab / Chevron 箭头方案。按钮使用 lucide `Keyboard` 图标；激活态（面板展开）按钮整体填充 `--tb-accent` + 白色图标，未激活态使用普通 `--tb-bg` + `--tb-muted` 图标色。状态存 `localStorage["typebridge.shortcuts.expanded"]`，默认 `false`。

`WebChatClient.sendKey(clientMessageId, code)` 与 `sendText` / `sendImage` 同模式：emit + ack 超时 10s。

---

## 三十六、桌面端 i18n（v0.8）

### 36.1 选型：轻量自研 vs react-i18next

选轻量自研。理由：

- 仅 2 种语言、平铺结构、无运行时切换语言包加载需求 → 不需要 i18next 的 namespaces / lazy loading / interpolation 引擎
- bundle 增量目标 < 2 KB（gzip）；i18next 至少 ~30 KB（含 react-i18next + core）
- 类型安全更直接：dict 是 TS 字面量，调用 `t("sidebar.connection")` 时 key 拼写错误编译期就报

### 36.2 模块组织

```
src/i18n/
  index.ts        # 导出 useI18n / useT / useLang / setLang，以及 t() 顶层函数
  dict.ts         # ZH / EN 两份字典对象，结构完全镜像；keys 嵌套按区域分组
  types.ts        # 推导 TKey 类型（dict.ts 的全部叶子路径）
```

### 36.3 字典结构

按区域分组的嵌套对象。以 `sidebar` 为例：

```ts
const ZH = {
  sidebar: {
    connection: "连接 TypeBridge",
    input: "输入设置",
    history: "历史消息",
    logs: "系统日志",
    about: "关于 TypeBridge",
    language: "语言",
  },
  // ...
};
const EN = { sidebar: { connection: "Connect TypeBridge", ... } };
```

`t("sidebar.connection")` 通过点号路径取值。带参数的文案使用 `{name}` 占位 + `t(key, { name: "Foo" })`。

### 36.4 状态与持久化

- 语言状态托管在 Zustand store（`language: "zh" | "en"`）
- 持久化字段 `language` 加入 Rust `store::Settings`（`#[serde(default)]`，默认空字符串，沿用现有 schema 演进策略，见 §三十三）
- 启动流程：
  1. App 挂载 → 读 `localStorage.tb_lang_hint`（如有）作为「即时渲染语言」，避免首屏闪烁中文/默认
  2. 同步发起 `invoke("get_settings")` → 拿到权威 `language`
  3. 若权威值非空：写入 store + 刷新 `localStorage.tb_lang_hint`；与 hint 一致则无 UI 抖动
  4. 若权威值为空（首次启动 / 升级前无字段）：弹首次语言选择卡片，用户选择后 `save_settings` 回写
- 二次切换：SideBar 底部 popover → 调 `setLang()` → 同时写 store + `localStorage.tb_lang_hint` + `save_settings`（持久化到 Rust）
- `localStorage.tb_lang_hint` 仅作首屏防闪缓存，不是 source of truth；卸载重装后清空，会回到首次选择流程

### 36.5 Hook API

```ts
const { t, lang, setLang } = useI18n();
t("sidebar.connection");                    // -> "连接 TypeBridge" / "Connect TypeBridge"
t("inject.failed", { reason: "AX denied" });
```

`t()` 命中 store 的 `language` selector，语言切换时所有调用 `useI18n` 的组件自动重渲染——不需要 React Context，Zustand 已经处理订阅。

### 36.6 「未翻译」回退策略

EN 字典若缺字段，`t()` 回退到 ZH 同 key（fail-soft），并在开发模式（`import.meta.env.DEV`）`console.warn`。这避免英文模式下出现裸 key 字符串，但 CI 阶段建议追加一条「校验 EN 字典是否覆盖 ZH 全 key」的脚本（v0.9 再补）。

### 36.7 不影响的边界

- 不改 Rust ↔ React event payload schema（事件文本仍由前端按当前语言拼接，后端只发结构化数据）
- 不改 sidecar JSON Lines 格式（同上）
- 不改 history schema（用户/对端发的消息原样存原文）
- 系统通知文案：通过新增的 Tauri command `notify(titleKey, bodyKey, params)` 让前端在 i18n 后再下发；首版可临时让前端在收到事件后用 `notification` plugin 直接发本地化字符串，避免 Rust 端再持有一套字典

## 三十六、WKWebView 不实现 `window.confirm` —— 一律用应用内确认弹窗

Tauri (wry) 的 macOS 后端是 WKWebView，**默认没有实现 `runJavaScriptConfirmPanel` / `runJavaScriptAlertPanel`**。前端调用 `window.confirm(...)` / `window.alert(...)` 不会弹出任何 UI，且 `confirm` 立即返回 `false`。这会让 `if (!window.confirm(...)) return;` 这种"取消时 early return"的写法，无论用户怎么操作都会走 cancel 分支 —— 表现为按钮"点了没反应"。

**约定**：组件内任何"危险动作前需要二次确认"的场景，统一用应用内 React 弹窗（参见 [HistoryTab.tsx](../src/components/tabs/HistoryTab.tsx) 的 `ClearConfirmDialog` 与 [AboutTab.tsx](../src/components/tabs/AboutTab.tsx) 的 `ConfirmInstallDialog`）。**禁止**新增 `window.confirm` / `window.alert` / `window.prompt` 调用。

不引入 `tauri-plugin-dialog` 的原因：原生 dialog 是阻塞性 modal sheet，跟现有视觉风格（暗色 backdrop + rounded card + accent 按钮）也不统一；自维护一个 React 组件成本极低，且能跟 i18n 字典自然打通。

---

## 三十八、WebChat 移动端 SPA 跟随桌面语言

### 38.1 设计

桌面 App 切换 zh/en 后，扫码打开的 mobile SPA 必须显示同一种语言。两端不共享内存或 Tauri events（手机是远端浏览器），唯一可靠的传递通道是 **QR URL query**：Rust 在拼 `qr_url()` 时附加 `&lang=zh|en`。

### 38.2 Rust 侧

- `WebChatServer::qr_url(lang: Option<&str>)` — `Some("zh"|"en")` 时附加 `&lang=`，其他情况（`None` / 空串 / 非法值）保持原始 URL，让 SPA 自检测
- `WebChatBridge::snapshot(lang)` 接收语言参数；四个 command（`start_webchat` / `stop_webchat` / `rotate_webchat_otp` / `webchat_snapshot`）通过 `current_lang(app)` 读 `config.json` 的 `language` 字段
- 每次 snapshot 都重新读 store，保证用户在 session 跑起来后切换语言，下一次扫码就生效

### 38.3 移动端 SPA

`webchat-local/src/i18n.ts` 实现轻量 i18n：

- ZH 字典 + EN 字典，结构与桌面端类似（dot-path lookup + 类型化 `TKey`），但仅覆盖移动端可见文案（`app/handshake/error/chat/composer/bubble/pcBlock`；`voiceModal` 已随语音入口移除而下线）
- 语言决策优先级：`URL ?lang=zh|en` → `localStorage tb_webchat_lang`（曾访问过的 host 复用）→ `navigator.language`（zh* → zh，否则 en）
- 在模块加载时一次性 resolve 后写入 `CURRENT_LANG` 常量，**不做响应式切换**——移动端是一次性会话，进来后语言固定到页面销毁，简化心智模型；下一次扫码或刷新时按上述优先级重算
- URL 命中后顺手写入 localStorage，让用户同 host 下手动刷新（不带 query 参数）也能保留语言
