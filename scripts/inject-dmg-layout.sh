#!/bin/bash
# Inject DMG icon positions + extra files (首次启动前必读.txt) with sanity checks and automatic rollback

set -euxo pipefail

python3 -m venv /tmp/dsstore-venv
/tmp/dsstore-venv/bin/pip install -q ds_store

TXT_SRC="src-tauri/resources/首次启动前必读.txt"

for arch in aarch64 x86_64; do
  DMG_DIR="src-tauri/target/${arch}-apple-darwin/release/bundle/dmg"
  DMG=$(ls "$DMG_DIR"/*.dmg | head -1)
  ORIG="/tmp/dmg-orig-${arch}.dmg"

  cp "$DMG" "$ORIG"
  rm -f /tmp/dmg-rw.dmg /tmp/dmg-out.dmg

  INJECT_OK=false
  if hdiutil convert "$DMG" -format UDRW -o /tmp/dmg-rw.dmg \
    && hdiutil attach -nobrowse -readwrite /tmp/dmg-rw.dmg -mountpoint /tmp/dmg-mnt; then

    # Copy the first-launch guide TXT into the DMG root
    cp "$TXT_SRC" /tmp/dmg-mnt/

    # Patch DS_Store icon positions
    if /tmp/dsstore-venv/bin/python scripts/fix_dsstore.py /tmp/dmg-mnt src-tauri/icons/dmg-dsstore; then
      hdiutil detach /tmp/dmg-mnt -force
      if hdiutil convert /tmp/dmg-rw.dmg -format UDZO -imagekey zlib-level=9 -o /tmp/dmg-out.dmg; then
        INJECT_OK=true
      fi
    else
      hdiutil detach /tmp/dmg-mnt -force >/dev/null 2>&1 || true
    fi
  fi

  if [ "$INJECT_OK" = "true" ]; then
    mv /tmp/dmg-out.dmg "$DMG"

    # Smoke test: verify DMG integrity
    if ! hdiutil verify "$DMG" >/dev/null 2>&1; then
      echo "Injected DMG verify failed for $arch, rollback to original DMG"
      cp "$ORIG" "$DMG"
    # Smoke test: attach the DMG
    elif ! hdiutil attach -nobrowse -readonly "$DMG" -mountpoint /tmp/dmg-check >/dev/null 2>&1; then
      echo "Injected DMG attach failed for $arch, rollback to original DMG"
      cp "$ORIG" "$DMG"
    # Sanity check: verify DS_Store icon positions and TXT presence
    elif ! /tmp/dsstore-venv/bin/python - <<'PYSCRIPT'
# -*- coding: utf-8 -*-
import os, sys
from ds_store import DSStore

mnt = '/tmp/dmg-check'

# Verify TXT file is present
txt_path = os.path.join(mnt, '首次启动前必读.txt')
assert os.path.isfile(txt_path), f"Guide TXT not found: {txt_path}"

# Verify DS_Store icon positions
p = os.path.join(mnt, '.DS_Store')
with DSStore.open(p, 'r') as ds:
    entries = {(e.filename, e.code): e.value for e in ds if e.code == b'Iloc'}
assert entries.get(('TypeBridge.app', b'Iloc')) == (180, 185), f"TypeBridge.app pos mismatch: {entries.get(('TypeBridge.app', b'Iloc'))}"
assert entries.get(('Applications', b'Iloc')) == (530, 185), f"Applications pos mismatch: {entries.get(('Applications', b'Iloc'))}"
assert entries.get(('首次启动前必读.txt', b'Iloc')) == (380, 378), f"TXT pos mismatch: {entries.get(('首次启动前必读.txt', b'Iloc'))}"
print("DS_Store sanity check passed")
PYSCRIPT
    then
      echo "Injected DMG DS_Store sanity check failed for $arch, rollback to original DMG"
      cp "$ORIG" "$DMG"
    fi

    hdiutil detach /tmp/dmg-check -force >/dev/null 2>&1 || true
  else
    echo "DMG layout injection failed for $arch, rollback to original DMG"
    hdiutil detach /tmp/dmg-mnt -force >/dev/null 2>&1 || true
    cp "$ORIG" "$DMG"
  fi

  rm -f "$ORIG" /tmp/dmg-rw.dmg /tmp/dmg-out.dmg
done
