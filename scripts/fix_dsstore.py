#!/usr/bin/env python3
"""fix_dsstore.py — Patch icon positions in DMG .DS_Store without replacing view blobs.

Usage: python3 fix_dsstore.py <mount_point>

This script intentionally edits only Iloc entries to preserve the stable .DS_Store
that Tauri generated (background, window style, and icon-view options).
"""

import sys
from pathlib import Path

from ds_store import DSStore


def generate(mount: str) -> None:
    mnt = Path(mount)
    ds_path = mnt / '.DS_Store'
    open_mode = 'r+'
    old_size = 0
    if ds_path.exists():
        old_size = ds_path.stat().st_size
    else:
        # Some DMGs do not contain .DS_Store until Finder opens the window.
        # Create a minimal file so Iloc entries can be written deterministically.
        open_mode = 'w+'

    # Only patch icon positions to avoid corrupting Finder view metadata.
    with DSStore.open(str(ds_path), open_mode) as ds:
        ds['TypeBridge.app']['Iloc'] = (206, 238)
        ds['Applications']['Iloc'] = (554, 238)

    new_size = ds_path.stat().st_size
    print(f"✓ patched {ds_path} ({old_size}B -> {new_size}B)")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <mount>", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1])
