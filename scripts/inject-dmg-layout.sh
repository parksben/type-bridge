#!/bin/bash
# 用 create-dmg 重新制作 DMG，让 Finder 自己写 DS_Store（确保背景图 + 图标位置可靠生效）。
# 原 Python ds_store 方案写出的 DS_Store 格式已过时，现代 macOS Finder 会忽略它。

set -euxo pipefail

VERSION="${VERSION:-0.1.0}"
TXT_SRC="src-tauri/resources/首次启动前必读.txt"
BG_PNG="src-tauri/icons/dmg-background.png"       # 760×540 (1x) — 传给 create-dmg
BG_PNG_2X="src-tauri/icons/dmg-background@2x.png" # 1520×1080 (2x) — Retina 用

for arch in aarch64 x86_64; do
  case "$arch" in
    aarch64) TRIPLE="aarch64-apple-darwin"; SUFFIX="aarch64" ;;
    x86_64)  TRIPLE="x86_64-apple-darwin";  SUFFIX="x64" ;;
  esac

  APP_PATH="src-tauri/target/${TRIPLE}/release/bundle/macos/TypeBridge.app"
  DMG_DIR="src-tauri/target/${TRIPLE}/release/bundle/dmg"
  DMG_OUT="${DMG_DIR}/TypeBridge_${VERSION}_${SUFFIX}.dmg"

  # 准备 staging 目录（.app + TXT，Applications 符号链接由 create-dmg 自动创建）
  STAGING="/tmp/dmg-staging-${arch}"
  rm -rf "$STAGING"
  mkdir -p "$STAGING"
  cp -r "$APP_PATH" "$STAGING/"
  cp "$TXT_SRC" "$STAGING/"

  # 卸载同名已挂载卷（避免 create-dmg 冲突）
  hdiutil detach "/Volumes/TypeBridge" 2>/dev/null || true

  # 清理旧产物
  rm -f "$DMG_OUT"

  # create-dmg 使用 osascript/Finder 原生写 DS_Store，背景图和图标位置完全可靠
  # 退出码 2 = "resource busy" 警告但 DMG 已生成，视为成功
  create-dmg \
    --volname "TypeBridge" \
    --background "$BG_PNG" \
    --window-pos 200 120 \
    --window-size 760 540 \
    --icon-size 128 \
    --text-size 13 \
    --icon "TypeBridge.app" 205 175 \
    --app-drop-link 555 175 \
    --icon "首次启动前必读.txt" 380 355 \
    --hide-extension "TypeBridge.app" \
    --no-internet-enable \
    "$DMG_OUT" \
    "$STAGING/" || { CODE=$?; [ "$CODE" -eq 2 ] || exit "$CODE"; }

  echo "✓ 创建完成: $DMG_OUT ($(ls -lh "$DMG_OUT" | awk '{print $5}'))"

  # 注入 @2x 背景图（Retina 显示器自动选用）
  # create-dmg 已写好 DS_Store，只需把 2x 文件加进 .background/ 即可
  RW_DMG="/tmp/dmg-rw-${arch}.dmg"
  hdiutil convert "$DMG_OUT" -format UDRW -o "$RW_DMG" -ov
  hdiutil attach -nobrowse "$RW_DMG" -mountpoint /tmp/dmg-inject
  cp "$BG_PNG_2X" /tmp/dmg-inject/.background/dmg-background@2x.png
  hdiutil detach /tmp/dmg-inject -force
  hdiutil convert "$RW_DMG" -format UDZO -o "$DMG_OUT" -ov
  rm -f "$RW_DMG"
  echo "✓ 注入 @2x 背景图完成"

  # 基础校验
  hdiutil verify "$DMG_OUT"

  # 验证 TXT 文件存在
  hdiutil attach -nobrowse -readonly "$DMG_OUT" -mountpoint /tmp/dmg-check
  if [ ! -f "/tmp/dmg-check/首次启动前必读.txt" ]; then
    echo "ERROR: 首次启动前必读.txt not found in DMG for $arch"
    hdiutil detach /tmp/dmg-check -force
    exit 1
  fi
  echo "✓ 首次启动前必读.txt 存在于 DMG 中"
  hdiutil detach /tmp/dmg-check -force

  rm -rf "$STAGING"
done
