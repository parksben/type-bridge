# 产品官网（§九）

---

## 九、产品官网

### 9.1 定位

**单页滚动落地页**，面向潜在用户首次接触。重点在**视觉冲击 + 简洁转化路径**——给首次接触产品的用户 5 秒内传达"聊天即打字"这个核心概念并引导下载。

旧版多页文档站（首页 + /docs/* 四渠道教程 + 适用场景）已下线删除。

### 9.2 信息架构（单页 `/`）

**一句话记忆点**：**聊天即打字**

顶导为 4 个锚点的滚动导航：

| 锚点 | 章节 | 核心内容 |
|------|------|---------|
| `#hero` | Hero 第一屏 | 桥拱 logo + `TypeBridge` wordmark + eyebrow/主标/副标 slogan + 概念动画 Banner + 双 CTA（免费下载 / 了解原理） |
| `#scenes` | 使用场景 | 5 个场景 pill tab 轮播：语音转文字 / AI Coding 搭档 / 高频文档产出 / 跨设备流转 / 团队协作。5s 自动切换，hover 暂停 |
| `#flow` | 使用流程图 | 左→右 SVG 流程图：下载 → 打开 → 两条连接路径 → 手机发消息 → 桌面自动注入 |
| `#download` | 下载入口 | 动态版本号 + 双架构卡片（arm64/x64）+ 首次安装须知 |

**记忆强化策略**："聊天即打字"在整页多处复现：
- Hero 主标题超大字体展示
- `#scenes` 场景章节标题副文：「每一个场景都是聊天即打字的一次验证」
- `#flow` 流程章节标题：「看聊天如何变成你的打字」
- Footer tagline：「聊天即打字 · macOS 菜单栏应用」

### 9.2.1 核心信息传达三段式

- 眉题（eyebrow，小字）：支持语音输入的输入法
- 主标题（超大字号）：**聊天即打字**（不带任何标点符号收尾）
- 副标题：你的飞书 / 钉钉 / 企业微信 / 本地 WebChat，正在变成桌面最快的输入法。手机聊一句，桌面就写一句——文本、图片、图文混合，一条消息直达编辑器 / 终端 / 浏览器输入框

### 9.2.2 Hero 概念 Banner

- **不放应用截图**：应用截图对不了解产品的用户信息量低
- **使用动态原理示意图**：四个输入渠道图标 → TypeBridge 桥接节点 → 桌面输入框/光标输出端
  - Web Chat：lucide-react `Globe` 图标（紫色调），排在首位
  - 飞书：IconPark（ByteDance 官方图标库）
  - 钉钉：Ant Design Icons
  - 企微（微信）：Simple Icons WeChat
- 动效：消息气泡从 IM logo 浮出 → 流动粒子/光线汇聚至桥接节点 → 注入桌面光标处闪烁出现
- 纯 CSS/SVG 动画，不依赖第三方动画库
- **主题自适应**：Banner 所有元素使用 CSS 变量，浅色/深色模式均有良好视觉效果
- **品牌标题使用 Geist Sans Bold**，accent 色关键词强调

### 9.3 导航栏

TopNav 导航项：

| 导航项 | 目标 | 类型 |
|--------|------|------|
| TypeBridge (Logo) | `/` | 内链 |
| 场景 | `/#scenes` | 锚点 |
| 流程 | `/#flow` | 锚点 |
| 下载 | `/#download` | 锚点 |
| GitHub icon 按钮 | `github.com/parksben/type-bridge`（新标签） | 外链 |
| 语言切换 | 中文/英文 | 按钮 |
| 主题切换 | 暗色/亮色 | 按钮（lucide `Sun`/`Moon`） |

- **主题切换**：暗色默认，状态持久化到 `localStorage`，刷新时 inline script 防闪烁
- **中英文切换**：默认跟随浏览器语言偏好，手动切换后持久化到 `localStorage`

### 9.4 下载机制

- `GET /download/arm64` → 代理转发 GitHub Release 最新 arm64 `.dmg`
- `GET /download/x64` → 代理转发 GitHub Release 最新 x64 `.dmg`
- Route Handler 每次请求动态查询 GitHub Releases API，流式透传
- 下载卡片客户端动态拉 GitHub releases/latest 展示版本号

**未公证绕过引导（#download 必含）**：

下载卡下方的"首次安装须知"提供**两条并列的解决路径**：

1. **GUI 路径**：`系统设置 → 隐私与安全性` 找到被阻止的条目点「仍要打开」
2. **CLI 路径**：终端执行 `xattr -rd com.apple.quarantine /Applications/TypeBridge.app`，命令块必须带"复制"按钮

两条路径放在同一卡片里，UI 上分左右两列（或上下并列），避免用户误以为"必须都做一遍"。卡片最后附"首次使用仍需授予辅助功能权限"提示。

### 9.5 场景文案

5 个场景与旧站 `website/app/docs/use-cases/page.tsx` 内容 1:1 一致，仅展示形态从"纵向长文档"改为"横向轮播 tab"：

1. **语音转文字，桌面直达** — 手机端语音转文字，TypeBridge 自动注入电脑端输入框
2. **AI Coding Agent 的语音搭档** — 用语音说需求，直接注入 Cursor / Copilot Chat 的输入框
3. **高频文档产出** — 边说边写，说出来的就是文档草稿
4. **跨设备文本流转** — 手机复制的内容一句话发送直达桌面输入框
5. **团队协作提效** — 团队成员 @ 机器人发命令，桌面直接接收执行

### 9.6 SEO 与双语

- 服务端 `generateMetadata()` + `Accept-Language` 请求头动态返回中/英文 `<title>` / `<meta description>` / `og:*` 标签
- `<html lang>` 跟随请求头，中文为默认兜底
- 所有页面文案均提供中英双语版本（Hero / Scenes / Flow / Download / Footer / TopNav）

### 9.7 部署

- **平台**：Netlify（连接 GitHub 仓库）
- **域名**：`typebridge.parksben.xyz`
- **Base directory**：`website/`
- **配置方式**：完全由代码内 `netlify.toml` + Next.js 约定驱动，零 Netlify UI 手动配置
- Next.js 15（App Router）+ Tailwind CSS v4 + lucide-react

### 9.8 迁移状态

- **已完成**：旧版多页文档站已删除，新版单页落地页（原 `website-v2/`）已重命名为 `website/` 并作为唯一官网
- 旧站的四渠道教程内容（`/docs/feishu` 等）目前不在新站中——后续如需恢复文档中心，另行规划
