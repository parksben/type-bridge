# 关于 TypeBridge（§二 2.11）

---

## 2.11 关于 TypeBridge（侧边栏 about tab + 检查更新）

v0.7.x 新增。侧边栏第五个 tab，承担"应用元信息展示 + 自助检查更新"两个职责。

### 2.11.1 页面布局

- 居中竖排：**TypeBridge logo（128px）→ 名称（"TypeBridge"）→ 版本号 → 检查更新按钮 → 语言切换（弱化）→ 检查结果区**
- 版本号渲染规则：
  - **dev 构建**（`cfg!(debug_assertions) == true`）：直接展示字符串 `dev:latest`
  - **release 构建**：展示 `env!("CARGO_PKG_VERSION")`，如 `0.1.0`
- 检查更新按钮 default 态：「检查更新」+ Refresh icon；处理中：「检查中…」+ 旋转 icon
- 语言切换控件紧跟在检查更新按钮下方，视觉权重弱于按钮（字号更小、颜色更灰）；侧边栏 footer 不再重复展示语言切换

### 2.11.2 检查更新流程

```
点检查更新
  ├─ dev 构建 → toast/inline："当前版本已是最新版"（不打网络）
  └─ release 构建 → 调 Rust command → fetch 官网 API
       ├─ API 返回错误 / 网络异常 → toast：失败原因（保留按钮可重试）
       ├─ latest <= current → toast："当前已是最新版本 vX.Y.Z"
       └─ latest > current → 弹「确认更新」对话框
              "发现新版本 vX.Y.Z（当前 vY.Y.Y）。
               点击確認後：
               1. 对话框转为下载进度面板（进度条 + 已下载/总大小）
               2. 下载完成后先打开 .dmg → 展示「正在打开安装包…」短暂过渡
               3. 应用退出
               请按 macOS 标准方式将新版拖入应用程序文件夹覆盖旧版。"
              [取消] [确认更新]
                       ↓
                 触发 apply_update（Rust 流式下载，实时推 typebridge://download-progress 事件）：
                   ① 分块下载写入 ~/Downloads/{filename}.dmg，每块 emit 进度事件
                   ② 下载完成后 emit percent=100 的终态进度事件
                   ③ 调系统 `open <dmg>` 挂载并打开 Finder 卷
                   ④ app.exit(0)
```

**为什么是半自动而非全自动重启**：完整 auto-update 需要 Tauri updater 插件 + 代码签名链路，签名要 Apple Developer 证书 / 自签 ed25519 密钥对 + CI 集成。当前 v0.7.x 阶段优先把链路打通，签名基建放后续版本（见 §2.11.5）。

### 2.11.3 平台架构选择

下载 URL 由桌面侧根据 `cfg!(target_arch)` 选择：
- `aarch64` → API 返回的 `download_urls.aarch64`
- `x86_64` → API 返回的 `download_urls.x64`

### 2.11.4 官网 API：`/api/latest-version`

新增 Next.js Route Handler，**透传** GitHub Releases 的 latest tag 信息：

```json
{
  "version": "0.2.0",
  "tag_name": "v0.2.0",
  "name": "TypeBridge v0.2.0",
  "notes": "...release body...",
  "published_at": "2026-04-30T...",
  "download_urls": {
    "aarch64": "https://github.com/parksben/type-bridge/releases/download/v0.2.0/TypeBridge_0.2.0_aarch64.dmg",
    "x64": "https://github.com/parksben/type-bridge/releases/download/v0.2.0/TypeBridge_0.2.0_x64.dmg"
  }
}
```

- 缓存 5 分钟（`next: { revalidate: 300 }`），避免每次都打 GitHub API 触发 rate limit
- 找不到对应架构的 asset 时仍返回 200 + 该字段为 null

### 2.11.5 已知限制（后续迭代点）

- **重启不全自动**：用户仍需手动拖入 .dmg 完成安装。完整体验需要走 `tauri-plugin-updater` + 自签 / Apple 公证
- **未做差量更新**：每次都全量下载新 .dmg（~30MB）。可接受范围内
- **dev 构建的 `dev:latest` 是 placeholder**：永远显示"已是最新版"，避免开发期被自动检查打扰
