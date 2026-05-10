# §八、§十二、§十三 UI设计语言、Tab架构、events/commands清单

> **模块归属**：UI 设计与前端架构

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

**品牌显示策略**：品牌标识使用 Geist Sans Bold（不再使用 Instrument Serif Italic）。导航栏 Logo 为桥拱 SVG 图标 + "TypeBridge" 加粗文字，与 accent 色联动。页面标题中需要强调的关键词也使用 `font-bold` + accent 色，保持中文站点的现代 sans-serif 视觉一致性。衬线体已全面移除——中文站点衬线斜体观感不佳，且与整体 Geist sans 体系冲突。

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

### 8.3.1 三主题模式（system / light / dark）

- 用户可在「关于」页右下角的主题切换控件选择：**跟随系统 / 浅色 / 深色**。
- 实现方式：在 `<html>` 上添加 `data-theme="light"` 或 `data-theme="dark"` 属性；不设属性时由 `@media (prefers-color-scheme: dark)` 决定（即系统模式）。
- CSS 规则：
  ```css
  @media (prefers-color-scheme: dark) {
    /* :root:not([data-theme="light"]) 才应用暗色 token */
    :root:not([data-theme="light"]) { ... }
  }
  /* 显式强制深色 */
  :root[data-theme="dark"] { ... }
  ```
- 防闪烁：`index.html` 内联脚本在 CSS 加载前从 `localStorage.tb_theme` 读取值并即时设置 `data-theme` 属性及背景色。
- 持久化：仅 localStorage（`tb_theme`），不写入 Rust Settings（主题属于纯视觉偏好，无需跨设备同步）。
- 状态：Zustand store 新增 `theme: Theme` (`"system" | "light" | "dark"`) 和 `setTheme()` action。

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

本约定属于全局工作流（参见 `~/.claude/skills/coding-plan`），项目级 [CLAUDE.md](../../CLAUDE.md) 已同步声明。

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
- 注意 `tauri icon` 默认会额外生成 Windows / iOS / Android 的资源，因为本项目只发 macOS，需要清理掉这些多余文件

**macOS .icns 生成**：通过 `iconutil -c icns` 从临时 `.iconset` 目录打包（10 种尺寸：16/32/128/256/512 @1x/@2x）；`tauri icon` 内部已封装这一步。

**DMG 安装背景**：`public/dmg-background.svg` 是安装窗口背景源文件，设计画布为 760×480 pt；`scripts/generate-icons.py` 用 `rsvg-convert` 按 2x 渲染为 `src-tauri/icons/dmg-background.png`（1520×960 px）。PNG 通过 144 DPI metadata 标记为 Retina 资源，让 Finder 以 760×480 pt 显示但在高分屏保持清晰。

---

## 十二、UI Tab 架构

### 12.1 单主窗口 + 左侧 5-tab SideBar + ConnectionHub / LinkAppsHub

不引入路由库，用 Zustand 存 `activeTab` 枚举，主入口组件 switch。v0.5 布局从"顶部水平 TabBar + 内容区"改为"左侧竖向 SideBar + 右侧内容区"；v0.6+ 再次收敛——将服务配置下原来的 3 个独立 tab 合并；v0.8 进一步将原 ConnectionHub 拆分为两个独立 sidebar tab：
- **connection**（连接 TypeBridge）：仅 WebChat 扫码配对，无顶部渠道子 tab
- **link**（连接应用 / Link Chat Apps）：飞书 / 钉钉 / 企微三个 IM 渠道，顶部横向子 tab，介绍文案置于 tab 上方

```ts
type TabId =
  | "connection"  // 连接 TypeBridge（纯 WebChat 页，无子 tab）
  | "link"        // 连接应用（飞书/钉钉/企微，顶部横向子 tab）
  | "input"       // 输入设置
  | "history"     // 历史消息
  | "logs";       // 系统日志

// 仅 link tab 用：IM 渠道内容页横向子 tab 的当前选中
type IMChannel = "feishu" | "dingtalk" | "wecom";
```

```tsx
// src/components/MainWindow.tsx
function MainWindow() {
  const tab = useAppStore(s => s.activeTab);
  return (
    <div className="h-screen flex flex-row">
      <SideBar />                                       {/* 左侧 ~150px */}
      <div className="flex-1 overflow-hidden">
        {tab === 'connection' && <ConnectionHub />}     {/* WebChat 专属页 */}
        {tab === 'link'       && <LinkAppsHub />}       {/* IM 渠道 Hub */}
        {tab === 'input'      && <InputSettingsTab />}
        {tab === 'history'    && <HistoryTab />}
        {tab === 'logs'       && <SystemLogTab />}
      </div>
    </div>
  );
}
```

### 12.2 组件拆分

- `src/components/MainWindow.tsx` — 壳
- `src/components/SideBar.tsx` — 左侧平铺 5 tab + 底部连接状态
- `src/components/ConnectionHub.tsx` — 连接 TypeBridge 壳（WebChat 页，无渠道子 tab）
- `src/components/LinkAppsHub.tsx` — **v0.8 新增**：连接应用壳（介绍文案 + 横向子 tab + IM 渠道面板）
- `src/components/tabs/ConnectionTab.tsx` — 连接飞书 Bot 面板
- `src/components/tabs/DingTalkConnectionTab.tsx` — 连接钉钉 Bot 面板
- `src/components/tabs/ComingSoonTab.tsx` — 占位，v0.6 仅企微使用（P3 落地后删除）
- `src/components/tabs/WebChatConnectionTab.tsx` — WebChat 扫码面板
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
  { id: "link",       label: "连接应用",        icon: Link },
  { id: "input",      label: "输入设置",        icon: Settings2 },
  { id: "history",    label: "历史消息",        icon: History   },
  { id: "logs",       label: "系统日志",        icon: Terminal  },
];
```

active tab：3px accent 色左竖条 + `surface-2` 背景。

### 12.4 ConnectionHub 布局（WebChat 专属）

内容区仅 WebChat 面板，无顶部渠道子 tab：

```
┌────────────────────────────────────────────┐
│ ⓘ 扫码配对，手机变身桌面鼠标键盘           │  ← intro banner（surface-2 底 + Info icon）
├────────────────────────────────────────────┤
│                                            │
│ <WebChat 扫码配对面板>                      │
│                                            │
└────────────────────────────────────────────┘
```

### 12.4b LinkAppsHub 布局（IM 渠道）

内容区自上而下三段，介绍文案在横向子 tab 上方：

```
┌────────────────────────────────────────────┐
│ ⓘ 给机器人发消息，自动写入桌面当前聚焦输入框 │  ← intro（surface-2 底 + Info icon，tab 上方）
├────────────────────────────────────────────┤
│  飞书  │  钉钉  │  企微                    │  ← 横向子 tab
│  ━━━━                                      │     active 用 2px accent 下划线
├────────────────────────────────────────────┤
│                                            │
│ <当前渠道的配置面板，内部独立滚动>           │
│                                            │
└────────────────────────────────────────────┘
```

子 tab 选中状态存 Zustand `activeConnectionChannel`（仅 IM 渠道：feishu/dingtalk/wecom）——切走 sidebar tab 再回来保留选中渠道；默认飞书。

### 12.5 引导 banner（连接飞书 Bot 面板内部）

ConnectionTab 自身内部第一行继续保留「还没有自建应用？先到飞书开发者后台创建一个」的飞书专属引导 banner；它与 LinkAppsHub 顶部的一句话说明**不冲突**——后者是跨渠道的通用说明（"IM → 输入桥接"），前者是渠道特定的上手引导。

### 12.6 ComingSoonTab 占位组件

```tsx
interface Props { platform: "dingtalk" | "wecom"; }
```

v0.6 仅企微（wecom）使用。钉钉在 P1 已落地；wecom 在 P3 落地后该组件可删除。

### 12.7 v0.8 重构点（相对 v0.6/v0.7）

**ConnectionHub 拆分**：原 ConnectionHub（WebChat + IM 四渠道混合横向子 tab）拆为：
1. `ConnectionHub`（连接 TypeBridge）：纯 WebChat，无子 tab，去除介绍文案条
2. `LinkAppsHub`（连接应用）：仅 IM 三渠道（飞书/钉钉/企微），介绍文案移至横向子 tab 上方

**SideBar 新增 link tab**：TabId enum 从 5 项变为 6 项（含 about），sidebar 主 tab 从 4 项增至 5 项。

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
| `confirm_pending_message` | `id, accept: bool` | **新增**：浮层里用户决定，替代 `inject_text_direct` |
