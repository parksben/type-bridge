#!/bin/bash
# Inject DMG icon positions with sanity checks and automatic rollback

set -euxo pipefail

python3 -m venv /tmp/dsstore-venv
/tmp/dsstore-venv/bin/pip install -q ds_store

for arch in aarch64 x86_64; do
  DMG_DIR="src-tauri/target/${arch}-apple-darwin/release/bundle/dmg"
  DMG=$(ls "$DMG_DIR"/*.dmg | head -1)
  ORIG="/tmp/dmg-orig-${arch}.dmg"

  cp "$DMG" "$ORIG"
  rm -f /tmp/dmg-rw.dmg /tmp/dmg-out.dmg

  if hdiutil convert "$DMG" -format UDRW -o /tmp/dmg-rw.dmg \
    && hdiutil attach -nobrowse -readwrite /tmp/dmg-rw.dmg -mountpoint /tmp/dmg-mnt \
    && /tmp/dsstore-venv/bin/python scripts/fix_dsstore.py /tmp/dmg-mnt \
    && hdiutil detach /tmp/dmg-mnt -force \
    && hdiutil convert /tmp/dmg-rw.dmg -format UDZO -imagekey zlib-level=9 -o /tmp/dmg-out.dmg; then
    mv /tmp/dmg-out.dmg "$DMG"

    # Smoke test: verify DMG integrity
    if ! hdiutil verify "$DMG" >/dev/null 2>&1; then
      echo "Injected DMG verify failed for $arch, rollback to original DMG"
      cp "$ORIG" "$DMG"
    # Smoke test: attach the DMG
    elif ! hdiutil attach -nobrowse -readonly "$DMG" -mountpoint /tmp/dmg-check >/dev/null 2>&1; then
      echo "Injected DMG attach failed for $arch, rollback to original DMG"
      cp "$ORIG" "$DMG"
    # Sanity check: verify DS_Store icon positions
    elif ! /tmp/dsstore-venv/bin/python - <<'PYSCRIPT'
from ds_store import DSStore
p = '/tmp/dmg-check/.DS_Store'
with DSStore.open(p, 'r') as ds:
    entries = {(e.filename, e.code): e.value for e in ds if e.code == b'Iloc'}
assert entries.get(('TypeBridge.app', b'Iloc')) == (206, 238), "TypeBridge.app icon position mismatch"
assert entries.get(('Applications', b'Iloc')) == (554, 238), "Applications icon position mismatch"
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
