# §二十四 CI/CD 发布流水线

> **模块归属**：GitHub Actions 自动化发布与检查更新

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

```bash
hdiutil convert "$DMG" -format UDRW -o /tmp/dmg-rw.dmg
hdiutil attach -nobrowse -readwrite /tmp/dmg-rw.dmg -mountpoint /tmp/dmg-mnt
SetFile -a V /tmp/dmg-mnt/.background         # filesystem-level hidden
SetFile -a V /tmp/dmg-mnt/.VolumeIcon.icns    # filesystem-level hidden
python3 scripts/fix_dsstore.py /tmp/dmg-mnt src-tauri/icons/dmg-dsstore
hdiutil detach /tmp/dmg-mnt -force
hdiutil convert /tmp/dmg-rw.dmg -format UDZO -imagekey zlib-level=9 -o /tmp/dmg-out.dmg
```

- `SetFile -a V` 在文件系统层面标记隐藏属性——CNID 变化不影响，分布式 DMG 中 dot-files 始终不可见
- `fix_dsstore.py` 从模板中二进制提取 bwsp/icvp（纯布局数据，无 CNID），然后用 `mac_alias.Bookmark.for_file()` 在挂载卷上生成包含正确 CNID 的新鲜书签，最后用 `ds_store` 的 `w+` dict 风格 API 写入全新 `.DS_Store`
- 需要 `pip3 install ds_store mac_alias`（两个纯 Python 库，无系统依赖）
- 本地更新模板：构建一次 DMG，`cp /Volumes/TypeBridge/.DS_Store src-tauri/icons/dmg-dsstore`

### 24.4 注意事项

- **代码签名缺失**：GitHub Actions runner 没有 Apple Developer 证书，产出的 `.dmg` **未签名**。仅用于内部测试分发；真机公网分发需手动签名或配 Apple Developer 证书到 GitHub Secrets
- **首次构建时间**：冷缓存下全量编译约 15–20 分钟（Rust 依赖 400+ crates）；热缓存下约 3–5 分钟
- **macOS runner 配额**：GitHub 免费计划每月 2000 分钟；私有仓库有限额

### 24.5 检查更新（v0.7.x，关于 TypeBridge tab）

桌面端「关于」tab 提供半自动更新链路（非阻塞状态栏版）：

```
AboutTab (前端)
  ├─ get_app_version  → "dev:latest" / "0.1.0"
  ├─ check_update     → fetch /api/latest-version → 比版本 → UpdateCheckResult
  ├─ start_update_download  → 启动后台下载任务（立即返回，不阻塞 UI）
  └─ cancel_update_download → 取消进行中的下载任务
```

**Rust** ([src-tauri/src/about.rs](../../src-tauri/src/about.rs))：
- `get_app_version`：`cfg!(debug_assertions)` 时返回字符串 `"dev:latest"`，否则 `env!("CARGO_PKG_VERSION")`。CI 在 [release.yml](../../.github/workflows/release.yml) 用 sed 改 `Cargo.toml` 的版本号，所以 release build 自然能拿到正确的 tag 版本
- `check_update`：release 走 `reqwest`（rustls，无 OpenSSL 依赖）拉 `https://typebridge.parksben.xyz/api/latest-version`，按 `cfg!(target_arch)` 选 `aarch64` / `x64` 下载链接；debug（dev）构建复用同一接口返回的 `latest + download_url`，并在可用时强制 `has_update=true`（仅用于本地联调更新下载链路）
- `start_update_download`：在 Rust 侧创建单实例后台任务（同一时刻仅允许一个下载），通过 `CancellationToken` 支持取消。任务内部流式下载到 `~/Downloads/{filename}.dmg`，并持续 emit `typebridge://update-download-state` 事件（phase + 进度 + 字节数 + 失败原因）
- `cancel_update_download`：触发当前任务 token cancel；下载协程收到取消信号后停止写入并删除不完整文件，向前端发送 `cancelled` 事件。**取消设计要点**：probe 请求和并发分块的初始 `.send()` 均通过 `tokio::select!` 与 cancel token 联动，确保取消能在 HTTP 连接建立阶段即生效，而非仅在数据流读取阶段才响应。前端 `handleCancelDownload` 在 invoke 成功后即刻乐观更新 UI 至 `cancelled` 状态，无需等待后端事件，避免用户感知到"按钮无反应"
- 下载完成后发 `opening` 事件，随后 `Command::new("open")` 挂载并显示 Finder 卷，再 `app.exit(0)`。用户拖入「应用程序」覆盖旧版后手动重新启动
- **下载进度 UI**：前端不再使用独立 modal，而是在 About 页顶部渲染与其他 tab 同风格的状态栏；状态栏根据 `typebridge://update-download-state` 切换 `ready/downloading/failed/cancelled/opening`。
- **失败/长时间未开始统一降级策略**：
  - `failed`：直接展示单行"前往官网重新下载覆盖安装"提示，不展示进度条
  - `downloading` 且长期 `downloaded=0`（前端定时阈值判定）：同样切换到官网引导提示，不展示进度条
  - 上述两种状态的 CTA 统一为"前往官网"，减少用户决策成本

**官网 API** ([website/app/api/latest-version/route.ts](../../website/app/api/latest-version/route.ts))：
- **v0.9+ 优化**：不再每次调 GitHub API。CI 完成 Release 后通过 `POST /api/publish`（带 `UPLOAD_SECRET` 鉴权）把 `{version, tag_name, name, notes, published_at, download_urls}` 写到 Netlify Blobs（key: `latest-release`）。`GET /api/latest-version` 直接从 Blobs 读，响应时间从 ~300ms 降到 ~50ms，且不受 GitHub rate limit 限制
- **publish 安全控制**：`UPLOAD_SECRET` 仅存在 Netlify 环境变量和 GitHub Secrets 中，CI workflow 末步用 `Authorization: Bearer $UPLOAD_SECRET` 调用；外部请求若不带正确 secret 返回 401
- **测试版本过滤**：版本号非 `x.y.z` 纯 semver（如 `0.2.0-test`、`0.2.0-alpha.1` 等带 `-` 后缀的预发布版本）时，**CI 跳过 publish 步骤**，不推送到官网。仅正式版（`v0.2.0` tag、或 manual dispatch 输入 `0.2.0`）才触发 publish
- **文件管理**：每次 publish 会覆盖 Blobs 中的 `latest-release`，不保留历史版本（只维护一份最新元数据，旧版 .dmg 本体仍由 GitHub Release 保留）
- 响应 schema 与 `LatestVersionResp` 严格对齐

**官网下载优化**（[website/app/dl/\[arch\]/route.ts](../../website/app/dl/)）：
- 仍然代理转发 GitHub Release asset（保留代理是为了国内用户访问 GitHub CDN 的带宽稳定性），但**不再每次调 GitHub API 查 asset URL**
- 改为从 Blobs 读 `latest-release` → 拿到对应架构的 `browser_download_url` + `size` → `fetch` 流式透传时带上 `Content-Length` 头（浏览器可显示下载进度）
- Blobs 读取极快，函数冷启动到开始传输的延迟大幅降低

**为什么不用 tauri-plugin-updater**：完整 auto-update（download → swap .app → relaunch）需要 ed25519 签名 + CI 集成 + Apple 公证，工作量 ~1-2 天。当前阶段优先打通链路，签名基建放后续版本。
