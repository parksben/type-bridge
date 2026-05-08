# 开发环境首次搭建指南

本文档记录了在**全新机器**上搭建 TypeBridge 开发环境的完整步骤，以及每个步骤背后的原因。

> **日常开发无需重复这些步骤**。搭建完成后，只需 `npm run tauri dev` 即可。

---

## 前置依赖

| 工具 | 版本 | 安装方式 |
|---|---|---|
| Node.js | 20+ | `brew install node` 或 [nvm](https://github.com/nvm-sh/nvm) |
| Rust (stable) | 1.75+ | `curl https://sh.rustup.rs -sSf \| sh` |
| Go | 1.21+ | `brew install go` |
| Xcode Command Line Tools | 任意 | `xcode-select --install` |

验证：

```bash
node -v && rustc --version && go version && xcode-select -p
```

---

## 一次性搭建流程

### 1. 安装 npm 依赖

```bash
# 根目录前端依赖（含 @tauri-apps/cli）
npm install

# webchat-local 子项目有独立的 node_modules，单独安装
cd webchat-local && npm install && cd ..
```

> **注意**：如果 `@tauri-apps/cli` 报 `Cannot find native binding`，这是 npm 处理
> `optionalDependencies` 的已知 bug。删掉重装即可：
>
> ```bash
> rm -rf node_modules package-lock.json && npm install
> ```

### 2. 编译 Go sidecar（三个渠道）

Tauri build script 会校验 `src-tauri/binaries/` 下是否存在对应架构的二进制，缺失则报错。
`tauri dev` **不会**自动编译 Go，必须手动执行：

```bash
mkdir -p src-tauri/binaries

for bridge in feishu-bridge dingtalk-bridge wecom-bridge; do
  echo "▸ building $bridge (arm64)"
  (
    cd "$bridge"
    GOPROXY=https://goproxy.cn,direct \
    GOOS=darwin GOARCH=arm64 \
    go build -ldflags '-s -w' \
      -o "../src-tauri/binaries/${bridge}-aarch64-apple-darwin" .
  )
done
```

若还需要 Intel 架构（双架构打包）：

```bash
for bridge in feishu-bridge dingtalk-bridge wecom-bridge; do
  (
    cd "$bridge"
    GOPROXY=https://goproxy.cn,direct \
    GOOS=darwin GOARCH=amd64 \
    go build -ldflags '-s -w' \
      -o "../src-tauri/binaries/${bridge}-x86_64-apple-darwin" .
  )
done
```

### 3. 构建 webchat-local 静态资源

Tauri 将 `webchat-local/dist/` 作为 `resources` 打包进 `.app`。  
`tauri dev` 的 `beforeDevCommand` **不会**自动构建它，而是由 `beforeBuildCommand` 才触发。  
首次（以及每次修改 `webchat-local/` 源码后）需要手动构建：

```bash
cd webchat-local && npm run build && cd ..
```

### 4. 启动开发模式

```bash
npm run tauri dev
```

首次启动因为 Rust 冷编译，大约需要 5–10 分钟。之后是增量编译，秒级启动。

---

## 已知坑点

| 错误信息 | 原因 | 解法 |
|---|---|---|
| `tauri: command not found` | `node_modules` 未安装 | `npm install` |
| `Cannot find native binding` | npm optionalDependencies bug，`.node` 文件损坏 | `rm -rf node_modules package-lock.json && npm install` |
| `Cannot find package '@tailwindcss/vite'` | `webchat-local` 子项目的依赖未安装 | `cd webchat-local && npm install` |
| `resource path 'binaries/feishu-bridge-aarch64-apple-darwin' doesn't exist` | Go sidecar 未编译 | 执行上方步骤 2 |
| `resource path '../webchat-local/dist' doesn't exist` | webchat-local 静态资源未构建 | 执行上方步骤 3 |

---

## 日常开发命令速查

```bash
# 启动开发模式（前端 HMR + Rust 增量编译热重启）
npm run tauri dev

# 修改了任意 .go 文件后：手动重编对应 bridge，再重启 tauri dev
cd feishu-bridge && GOPROXY=https://goproxy.cn,direct GOOS=darwin GOARCH=arm64 \
  go build -o ../src-tauri/binaries/feishu-bridge-aarch64-apple-darwin . && cd ..

# 只检查 Rust 编译错误（比 tauri dev 快很多）
cd src-tauri && cargo check

# 双架构打包（产物在 src-tauri/target/*/release/bundle/dmg/）
./scripts/build-all.sh
```

---

## 镜像配置（国内网络）

| 工具 | 配置命令 |
|---|---|
| npm | `npm config set registry https://registry.npmmirror.com` |
| Go | 构建命令内加 `GOPROXY=https://goproxy.cn,direct` |
| Cargo | `~/.cargo/config.toml` 配置 USTC sparse index |
| Rustup | `export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static` |
| Homebrew | `export HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles` |
