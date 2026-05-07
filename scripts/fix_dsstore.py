#!/usr/bin/env python3
"""fix_dsstore.py — Generate .DS_Store with fresh bookmarks for mounted DMG.

Usage: python3 fix_dsstore.py <mount_point> <template_dsstore>
"""

import struct
import sys
from pathlib import Path
from typing import Optional

from ds_store import DSStore
from mac_alias import Bookmark


def find_bplist_blob(data: bytes, struct_type: bytes) -> Optional[bytes]:
    """Binary-extract a bplist blob for the given 4-char structure type."""
    dlen = len(data)
    pos = 0
    while pos < dlen - 8:
        if data[pos:pos + 4] == struct_type:
            after = pos + 4
            if after + 12 > dlen:
                pos += 1
                continue
            if data[after:after + 4] == b'blob':
                blob_len = struct.unpack('>I', data[after + 4:after + 8])[0]
                blob_start = after + 8
                if blob_start + blob_len <= dlen:
                    blob = data[blob_start:blob_start + blob_len]
                    if blob[:6] == b'bplist':
                        return blob
        pos += 1
    return None


def generate(mount: str, template: str) -> None:
    mnt = Path(mount)

    # 1. Extract bwsp & icvp from template (no CNID, pure layout)
    tmpl = Path(template).read_bytes()
    bwsp = find_bplist_blob(tmpl, b'bwsp')
    icvp = find_bplist_blob(tmpl, b'icvp')
    if not bwsp or not icvp:
        ok = lambda b: 'OK' if b else 'MISSING'
        print(f"ERROR: bwsp={ok(bwsp)}, icvp={ok(icvp)}")
        sys.exit(1)
    print(f"✓ bwsp: {len(bwsp)}B, icvp: {len(icvp)}B")

    # 2. Fresh bookmarks from live filesystem
    app = Bookmark.for_file(str(mnt / 'TypeBridge.app')).to_bytes()
    apps = Bookmark.for_file(str(mnt / 'Applications')).to_bytes()
    bg = Bookmark.for_file(str(mnt / '.background')).to_bytes()
    print(f"✓ bookmarks: app={len(app)}B  apps={len(apps)}B  bg={len(bg)}B")

    # 3. Write via dict-style API
    def iloc(x: float, y: float, bm: bytes) -> bytes:
        return struct.pack('>ff', x, y) + bm

    ds_path = mnt / '.DS_Store'
    if ds_path.exists():
        ds_path.unlink()

    with DSStore.open(str(ds_path), 'w+') as ds:
        ds[b'.']['bwsp'] = bwsp
        ds[b'.']['icvp'] = icvp
        ds['TypeBridge.app']['Iloc'] = iloc(206.0, 238.0, app)
        ds['Applications']['Iloc'] = iloc(554.0, 238.0, apps)
        ds['.background']['Iloc'] = iloc(0.0, 0.0, bg)

    print(f"✓ wrote {ds_path} ({ds_path.stat().st_size}B)")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <mount> <template>", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2])
