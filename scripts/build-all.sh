#!/usr/bin/env bash
# TypeBridge — 一键双架构打包
#
# 产物：
#   src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/TypeBridge_*.dmg
#   src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/TypeBridge_*.dmg

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

GOPROXY=${GOPROXY:-https://goproxy.cn,direct}
export GOPROXY

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ─── 前置检查 ─────────────────────────────────────────────────────
command -v go     >/dev/null || die "未找到 go（brew install go）"
command -v cargo  >/dev/null || die "未找到 cargo（安装 rustup）"
command -v npm    >/dev/null || die "未找到 npm"

if ! rustup target list --installed 2>/dev/null | grep -q '^x86_64-apple-darwin$'; then
  log "安装 x86_64-apple-darwin Rust target..."
  rustup target add x86_64-apple-darwin
fi

if ! rustup target list --installed 2>/dev/null | grep -q '^aarch64-apple-darwin$'; then
  log "安装 aarch64-apple-darwin Rust target..."
  rustup target add aarch64-apple-darwin
fi

# ─── 1/4 前端依赖 ─────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  log "安装 npm 依赖..."
  npm install
fi

# ─── 2/4 Go sidecar 双架构编译 ────────────────────────────────────
log "编译 Go sidecar (arm64)..."
(
  cd feishu-bridge
  GOOS=darwin GOARCH=arm64 go build \
    -ldflags '-s -w' \
    -o "$ROOT/src-tauri/binaries/feishu-bridge-aarch64-apple-darwin" .
)
ok "feishu-bridge-aarch64-apple-darwin"

log "编译 Go sidecar (amd64)..."
(
  cd feishu-bridge
  GOOS=darwin GOARCH=amd64 go build \
    -ldflags '-s -w' \
    -o "$ROOT/src-tauri/binaries/feishu-bridge-x86_64-apple-darwin" .
)
ok "feishu-bridge-x86_64-apple-darwin"

# ─── 3/4 Tauri 打包 aarch64 ───────────────────────────────────────
log "打包 Apple Silicon 版（可能需要几分钟）..."
npm run tauri build -- --target aarch64-apple-darwin
ok "aarch64-apple-darwin 完成"

# ─── 4/4 Tauri 打包 x86_64 ────────────────────────────────────────
log "打包 Intel 版（可能需要几分钟）..."
npm run tauri build -- --target x86_64-apple-darwin
ok "x86_64-apple-darwin 完成"

# ─── 汇总产物 ─────────────────────────────────────────────────────
printf '\n\033[1;32m═══ 产物 ═══\033[0m\n'
find "$ROOT/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg" \
     -maxdepth 1 -name '*.dmg' -print 2>/dev/null || true
find "$ROOT/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg" \
     -maxdepth 1 -name '*.dmg' -print 2>/dev/null || true
echo ""
