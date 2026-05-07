#!/usr/bin/env python3
"""fix_dsstore.py — Patch DMG .DS_Store with safe view blobs and icon positions.

Usage: python3 fix_dsstore.py <mount_point> <template_dsstore>

This script only injects three safe pieces of metadata:
- bwsp: window/view state blob
- icvp: icon view/background blob
- Iloc: icon positions

It avoids copying any malformed bookmark-based records from the template.
"""

import struct
import sys
from pathlib import Path

from ds_store import DSStore


def find_bplist_blob(data: bytes, struct_type: bytes) -> bytes | None:
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
    ds_path = mnt / '.DS_Store'
    template_data = Path(template).read_bytes()
    bwsp = find_bplist_blob(template_data, b'bwsp')
    icvp = find_bplist_blob(template_data, b'icvp')
    if not bwsp or not icvp:
        print('ERROR: failed to extract bwsp/icvp from template')
        sys.exit(1)

    open_mode = 'r+'
    old_size = 0
    if ds_path.exists():
        old_size = ds_path.stat().st_size
    else:
        # Some DMGs do not contain .DS_Store until Finder opens the window.
        # Create a minimal file so Iloc entries can be written deterministically.
        open_mode = 'w+'

    # Only inject safe view blobs and icon positions.
    with DSStore.open(str(ds_path), open_mode) as ds:
        ds['.']['bwsp'] = bwsp
        ds['.']['icvp'] = icvp
        ds['TypeBridge.app']['Iloc'] = (206, 238)
        ds['Applications']['Iloc'] = (554, 238)

    new_size = ds_path.stat().st_size
    print(f"✓ patched {ds_path} ({old_size}B -> {new_size}B)")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <mount> <template>", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2])
