#!/usr/bin/env python3
"""fix_dsstore.py — Write .DS_Store into mounted DMG to set background and icon positions.

Usage: python3 fix_dsstore.py <mount_point> <template_dsstore>

The template_dsstore is only used to extract bwsp (window bounds/toolbar state)
and icvp (icon view options incl. background image path) blobs.
Iloc (icon positions) are written directly using the ds_store library's tuple API.
"""

import struct
import sys
from pathlib import Path
from typing import Optional

from ds_store import DSStore


def find_bplist_blob(data: bytes, struct_type: bytes) -> Optional[bytes]:
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

    # Extract bwsp (window layout) & icvp (icon view / background) from template
    tmpl = Path(template).read_bytes()
    bwsp = find_bplist_blob(tmpl, b'bwsp')
    icvp = find_bplist_blob(tmpl, b'icvp')
    if not bwsp or not icvp:
        ok = lambda b: 'OK' if b else 'MISSING'
        print(f"ERROR: bwsp={ok(bwsp)}, icvp={ok(icvp)}")
        sys.exit(1)
    print(f"✓ bwsp: {len(bwsp)}B, icvp: {len(icvp)}B")

    ds_path = mnt / '.DS_Store'
    if ds_path.exists():
        ds_path.unlink()

    # Iloc values must be (x, y) tuples — ds_store library encodes as uint32 big-endian pairs
    with DSStore.open(str(ds_path), 'w+') as ds:
        ds['.']['bwsp'] = bwsp
        ds['.']['icvp'] = icvp
        ds['TypeBridge.app']['Iloc'] = (206, 238)
        ds['Applications']['Iloc'] = (554, 238)

    print(f"✓ wrote {ds_path} ({ds_path.stat().st_size}B)")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <mount> <template>", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2])
