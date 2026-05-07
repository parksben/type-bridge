# 后续扩展 · 里程碑 · CI/CD · 桌面端 i18n（§六 · §七 · §八 · §八A）

---

## 六、后续扩展方向（不在 v1 范围）

- 支持更多消息来源（Slack、Telegram、微信等）
- 消息过滤规则（仅转发特定关键词 / 特定发送人）
- 多设备同步（配置云端备份）
- Windows 版本（替换 AXUIElement 为 UIAutomation）
- 消息历史记录与搜索

---

## 七、开发里程碑

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| M1 | 项目脚手架 + Tauri 基础配置 + 托盘框架 | 0.5 天 |
| M2 | 配置窗口 UI + 本地存储 + 凭据管理 | 0.5 天 |
| M3 | 飞书 WebSocket 长连接实现 + 重连逻辑 | 1 天 |
| M4 | macOS Accessibility 文字注入 + 权限引导 | 1 天 |
| M5 | 日志系统 + 日志窗口 UI | 0.5 天 |
| M6 | 系统通知 + 无焦点暂存逻辑 | 0.5 天 |
| M7 | 集成测试 + 打包签名 | 0.5 天 |
| **合计** | | **约 4.5 天** |

---

## 八、CI/CD 发布流水线

### 8.1 目标

支持通过 GitHub Actions 在 macOS 云端环境中完成双架构（arm64 + x86_64）构建，自动生成 GitHub Release 并挂载 `.dmg` 产物，确保**任意版本可重复构建、重复发布**。

### 8.2 触发方式

| 方式 | 触发条件 | 用途 | 可重复？ |
|------|---------|------|----------|
| **手动触发** | GitHub Actions UI 中点击 `workflow_dispatch`，输入版本号 | 日常开发迭代、测试构建、需要重建某历史版本 | ✅ 无限次；若同版本号 release 已存在则原地更新 |
| **Tag 自动触发** | 推送 `v*` 格式的 tag（如 `v0.2.0`） | 正式发布：打 tag 即自动构建 + 创建 Release | ✅ 删掉 tag 重新推送即可重建 |

两种方式共享同一条流水线，唯一的区别是版本号来源：
- 手动触发：从 `workflow_dispatch` 的 `version` 输入字段读取
- Tag 触发：从 `github.ref_name` 推解析（去掉 `v` 前缀）

### 8.3 产物

每次成功构建产出：

- `TypeBridge_<version>_aarch64.dmg` — Apple Silicon 安装包
- `TypeBridge_<version>_x64.dmg` — Intel 安装包
- 两个 `.dmg` 挂载在对应 GitHub Release 的 Assets 中

### 8.4 版本号覆写

构建前，CI 脚本自动用传入的版本号覆写以下位置：

- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `package.version`

确保任意版本号同一份代码都能正确打出（不依赖开发者本地手动改版本号）。

---

## 八A、桌面端国际化（i18n，v0.8）

### 目标

桌面 App 全量支持简体中文（`zh`）/ 英文（`en`）双语，覆盖所有用户可见文案：SideBar 导航、所有 tab 内容、模态弹窗（辅助功能引导、首次启动语言选择）、通知、日志条目模板、错误提示。

### 用户路径

1. **首次启动**：未持久化语言时，主窗口正中央弹出语言选择卡片（中文 / English 两个等权按钮），不可绕过。用户选择后立即应用并写入持久化存储
2. **后续启动**：直接读取持久化语言渲染界面，不再弹出选择
3. **二次切换**：SideBar 左侧底部（在「关于 TypeBridge」入口下方）增加一个语言切换控件——以 `lucide Languages` 图标为触发点，点击展开「中文 / English」下拉菜单，当前语言带 `Check` 图标标记。切换后立即生效（无需重启）并持久化
4. 语言切换不重启 App、不重连 sidecar、不影响连接状态

### 翻译范围

| 区域 | 是否翻译 | 说明 |
|------|---------|------|
| SideBar 标签 + 底部入口 | 是 | 连接 TypeBridge / 输入设置 / 历史消息 / 系统日志 / 关于 |
| 各 tab 全部正文 | 是 | 含 ConnectionTab / WebChat / 飞书 / 钉钉 / 企微 / Input / History / Logs / About |
| 模态弹窗 | 是 | 辅助功能引导、首次语言选择、内联提示 |
| 通知（系统通知） | 是 | inject 成功/失败、错误提示 |
| 日志/历史中的「用户输入文本本身」 | 否 | 这是用户/对端发的内容，与界面语言无关 |
| 平台凭据字段名（AppID / AppSecret 等） | 否（保留英文术语） | 与第三方平台后台一致，避免歧义 |
| commit message / 内部日志文件 | 否 | 不在用户界面，按既有约定继续 |

### 持久化与默认值

- 语言首选项与其他用户设置一并持久化到 `~/Library/Application Support/com.parksben.typebridge/config.json`，新增字段 `language: "zh" | "en"`，默认空字符串代表「未选择」
- 已存在的存储升级时该字段缺省为空，触发首次启动语言选择流程（与全新安装行为一致）
- 默认建议值（仅作为 picker 的高亮项）：根据系统语言（`navigator.language` 起始为 `zh`）预选中文，否则预选英文

### UI 设计要点（与现有设计语言一致）

- **首次选择卡片**：复用辅助功能引导模态的尺寸 / 圆角 / 阴影；标题双语并列「选择语言 / Select language」；两个按钮等宽并排（中文 / English），点击即关闭
- **SideBar 切换器**：作为 footer 区第二个条目，视觉重量与「关于 TypeBridge」一致（小一号字号、灰阶配色）；点击触发 popover（不是原生 select），内容为两行可勾选项；popover 出现位置为按钮右侧上浮，避免被窗口底边裁切

### 不在范围

- 多语言键盘布局适配
- 中英文混排正文的字体回退优化（直接使用现有 `system-ui` stack）
- 简体之外的中文变体（繁体 / 港台），后续通过同一 dict 机制追加
- 官网（`website/`）、Go sidecar 的 i18n

### WebChat 移动端 SPA 跟随

桌面切换语言后，扫码打开的 WebChat 移动端页面也必须呈现对应语言：

- 桌面 Rust 在生成二维码 URL 时根据 `Settings.language` 注入 `&lang=zh|en`，未选择时不附加
- 移动端 SPA 自带 i18n 模块，按优先级 `URL ?lang=` → `localStorage tb_webchat_lang` → `navigator.language`（zh* → zh，否则 en）解析当前语言
- 覆盖范围：握手卡片、错误屏、聊天页（header/状态/空态/输入框/按钮 aria）、消息状态、PC 拦截页
