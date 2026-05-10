# §二十五 产品官网

> **模块归属**：`website/` 子目录，Netlify 部署

---

## 二十五、产品官网

### 25.1 设计决策

**决策：Next.js (App Router) 独立子目录 + Netlify 部署，单页滚动落地页**

**方案说明：**
- 在仓库根目录 `website/` 子目录，作为完全独立的 Next.js 项目
- 通过 `netlify.toml` + `@netlify/plugin-nextjs` 实现代码驱动的零 UI 手动配置部署
- 域名：`typebridge.parksben.xyz`
- **单页滚动落地页**（非多页文档站）：Hero + 场景 + 流程 + 下载，视觉冲击优先，转化路径简化
- **Hero 概念 Banner**：纯 CSS/SVG 动画展示"消息→桥接→注入"概念，不放截图

> **历史背景**：旧版 `website/` 是信息架构较重的多页文档站，首页虽有 Hero 动画但整体信息密度偏高。新版重点在视觉层升级 + 转化路径简化。旧站已删除，`website/` 即现版本。

### 25.2 架构

```
website/
├── netlify.toml
├── package.json
├── next.config.ts                  ← @netlify/plugin-nextjs 处理部署
├── app/
│   ├── layout.tsx                  ← metadata + dark-mode inline script + lang attribute
│   ├── page.tsx                    ← 单页拼装: Hero + Scenes + Flow + Download + Footer
│   ├── globals.css                 ← Tailwind v4 + CSS tokens + 动画 keyframes
│   ├── home-client.tsx             ← Client component: ThemeProvider + TopNav
│   ├── robots.ts
│   ├── sitemap.ts
│   ├── api/
│   │   └── latest-version/
│   │       └── route.ts            ← 检查更新 API，从 Netlify Blobs 读，5min ISR 缓存
│   ├── dl/
│   │   └── [arch]/
│   │       └── route.ts            ← Route Handler，代理转发 GitHub Release .dmg 流式透传
│   └── components/
│       ├── top-nav.tsx             ← 锚点导航 + Scroll Spy + 主题切换 + 语言切换
│       ├── theme-toggle.tsx
│       ├── lang-toggle.tsx         ← 中英文切换按钮
│       ├── hero.tsx                ← 升级版 HeroBanner（4 端 → 桥接 → 桌面）
│       ├── scenes.tsx              ← 5 场景 pill tab 轮播
│       ├── flow.tsx                ← 左→右 SVG 流程图
│       ├── download.tsx            ← 动态版本号 + 双架构下载卡片
│       └── footer.tsx
└── public/
    └── channel-icons/              ← IM 品牌 SVG
```

### 25.2.1 Hero Banner 技术方案

- 纯 CSS 动画（`@keyframes`），零外部依赖
- **主题自适应**：Banner 背景、网格纹理、桌面窗口、光晕球全部使用 CSS 变量，在浅色/深色模式下均有良好视觉效果
- 原理示意图布局：三列式，左侧三个 IM 品牌 logo → 中间桥接节点（lucide-react `ArrowLeftRight`）→ 右侧桌面窗口模拟
- **IM logo 使用官方品牌 SVG**：
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
- 背景风格：主题自适应 + 网格纹理 + 三色光晕球 + 扫描线叠加（仅深色模式）
- **品牌标题不使用衬线斜体**：全部用 `font-bold`（Geist Sans），accent 色关键词强调

### 25.3 页面路由与渲染策略

| 路由 | 渲染方式 | 说明 |
|------|---------|------|
| `/` | SSG | 首页，构建时预渲染为静态 HTML |
| `/api/latest-version` | ISR (5min) | 检查更新 API，透传 Netlify Blobs 数据 |
| `/dl/[arch]` | Route Handler | 动态查，流式透传（no-store 防缓存） |

### 25.4 顶部导航栏

TopNav 导航项与锚点：

| 导航项 | 目标 | 类型 |
|--------|------|------|
| TypeBridge (Logo) | `/` | 内链 |
| 场景 | `/#scenes` | 锚点 |
| 流程 | `/#flow` | 锚点 |
| 下载 | `/#download` | 锚点 |
| GitHub | 外链（仅图标） | 外链 |
| 语言切换 | — | 按钮 |
| 主题切换 | — | 按钮 |

固定在顶部，Scroll Spy 当前 section 对应 nav item 加 accent 下划线。平滑滚动：`html { scroll-behavior: smooth; scroll-padding-top: 72px }`。

### 25.5 页面结构（单页 `/`）

- `#hero` — Hero 第一屏（logo + slogan + 概念动画 Banner + 双 CTA）
- `#scenes` — 4 场景 pill tab 轮播（触控板 / 打字输入 / 语音输入 / 快捷指令）
- `#flow` — SVG 使用流程图（左→右）
- `#download` — 动态版本号 + 双架构下载卡片

### 25.6 下载流量转发机制（v0.9+）

- `GET /dl/[arch]` Route Handler **不再每次调 GitHub Releases API**
- 改为从 Netlify Blobs 读 `latest-release` → 拿到该架构的 `browser_download_url` → `fetch` GitHub CDN 流式透传
- `Cache-Control: no-store, must-revalidate` 保持不变

**⚠️ 禁止改为 302 重定向**：GitHub CDN（`objects.githubusercontent.com`）在中国大陆访问受限，302 后用户会直连 GitHub，下载失败或极慢。必须保持 Netlify 函数作代理中转。

**已知限制：浏览器看不到文件总大小**
Netlify 函数以 `ReadableStream` 返回 body 时，运行时强制使用 `Transfer-Encoding: chunked`，HTTP/1.1 规定 chunked 与 `Content-Length` 互斥，浏览器因此无法显示总大小/进度百分比，只能显示已下载字节数。这是 serverless streaming 的固有限制，无法在当前架构下修复，**不要为此改用 302**。

### 25.7 Netlify Blobs 与环境变量

**Blobs key 设计：**
- `latest-release`：JSON 元数据，每次 CI publish 覆盖。每次 publish 会覆盖旧值，不保留历史版本

**环境变量：**

| 变量 | 用途 |
|------|------|
| `UPLOAD_SECRET` | 保护 `POST /api/publish`；仅 CI 和 Netlify dashboard 持有 |

### 25.8 Netlify 配置

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

### 25.9 i18n 方案

轻量级 React Context + 静态字典，不引入 next-intl / i18next 等重型库。核心思路：

1. `app/lib/i18n.ts` 导出 `LanguageProvider` + `useT()` hook + `Language` type (`"zh" | "en"`)
2. 字典 `DICT` 是一个嵌套的 `Record`，key 结构为 `section.component.field`（如 `hero.headline`）
3. `useT()` 返回 `t(key: string): string`，根据当前语言从字典取值
4. `<html lang>` 属性跟随当前语言；SEO metadata（`<title>`、`<meta description>`、`og:*` 等）在 `layout.tsx` 中通过 `generateMetadata()` + `headers()` 读取 `Accept-Language` 请求头动态切换
5. 初始语言检测优先级：`localStorage` → `navigator.language` → 中文兜底
6. 各组件通过 `useT()` 读取文案，不再使用组件内硬编码常量

### 25.10 主题切换

- `<html class="dark">` class-based 切换；持久化到 `localStorage.theme`
- `layout.tsx` 顶部 inline script 在 React 水合前读取 localStorage 并同步 class，避免闪烁
- 默认深色模式

### 25.12 下载量统计与徽标 API

**统计触发点**：`GET /dl/[arch]` Route Handler 在确认 upstream URL 存在、开始流式透传之前，fire-and-forget 调用 `incrementDownloadCount(arch)`。选此位置而非流完成后，原因是 serverless 函数在 streaming response 发出后即终止，无法在 "流结束" 时执行额外逻辑。

**数据存储**：Netlify Blobs `stats` store，key `download-stats`：
```json
{ "total": 0, "by_arch": { "arm64": 0, "x64": 0 } }
```
read-modify-write 竞态在极低并发下误差可忽略（统计场景可接受）。

**路由表新增：**

| 路由 | 渲染方式 | 说明 |
|------|---------|------|
| `/api/badge/version` | ISR (1h) | shields.io endpoint badge 格式，返回最新正式版本号 |
| `/api/badge/downloads` | ISR (1h) | shields.io endpoint badge 格式，返回总下载量 |

**shields.io endpoint badge JSON 格式：**
```json
{
  "schemaVersion": 1,
  "label": "latest",
  "message": "v0.2.1",
  "color": "blue"
}
```

**README 徽标**：shields.io `?url=` endpoint badge URL 引用上述两个接口，`cacheSeconds=3600` 控制 shields.io 端缓存。中英文两个 README 均在标题 `<h1>` 下方居中 `<p align="center">` 块内展示。

### 25.11 部署状态

- 已部署至 Netlify：`typebridge.parksben.xyz`，base directory = `website/`
- 旧版多页文档站已删除；现版（`website/`）为唯一官网
- `/api/latest-version` 已从旧站迁移至新站，桌面端检查更新链路不受影响
