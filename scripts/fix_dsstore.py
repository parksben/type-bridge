#!/usr/bin/env python3
"""fix_dsstore.py — Patch DMG .DS_Store with view metadata and icon positions.

Usage: python3 fix_dsstore.py <mount_point> [template_dsstore]

The previous implementation copied raw plist blobs from a template .DS_Store.
That template carried a stale background alias pointing at an old temporary DMG,
so Finder would keep the icon layout but fail to resolve the background image.

This version generates fresh binary plists and a live Alias record for the
current mounted background image on every run.
"""

import plistlib
import sys
from pathlib import Path

from ds_store import DSStore
from mac_alias import Alias


def build_bwsp_blob() -> bytes:
    return plistlib.dumps(
        {
            'ContainerShowSidebar': False,
            'ShowSidebar': False,
            'ShowStatusBar': False,
            'ShowTabView': False,
            'ShowToolbar': False,
            'WindowBounds': '{{10, 360}, {760, 480}}',
        },
        fmt=plistlib.FMT_BINARY,
    )


def build_icvp_blob(background_alias: bytes) -> bytes:
    return plistlib.dumps(
        {
            'arrangeBy': 'none',
            'backgroundColorBlue': 1.0,
            'backgroundColorGreen': 1.0,
            'backgroundColorRed': 1.0,
            'backgroundImageAlias': background_alias,
            'backgroundType': 2,
            'gridOffsetX': 0.0,
            'gridOffsetY': 0.0,
            'gridSpacing': 100.0,
            'iconSize': 128.0,
            'labelOnBottom': True,
            'showIconPreview': True,
            'showItemInfo': False,
            'textSize': 16.0,
            'viewOptionsVersion': 1,
        },
        fmt=plistlib.FMT_BINARY,
    )


def generate(mount: str, template: str | None = None) -> None:
    mnt = Path(mount)
    ds_path = mnt / '.DS_Store'
    background_image = mnt / '.background' / 'dmg-background.png'
    if not background_image.exists():
        print(f'ERROR: missing background image: {background_image}')
        sys.exit(1)

    # Resolve /tmp symlink to /private/tmp first; otherwise Alias.for_file can
    # encode odd '../../../tmp/...' paths that Finder may not tolerate.
    background_real = background_image.resolve()

    bwsp = build_bwsp_blob()
    icvp = build_icvp_blob(Alias.for_file(str(background_real)).to_bytes())

    open_mode = 'r+'
    old_size = 0
    if ds_path.exists():
        old_size = ds_path.stat().st_size
    else:
        # Some DMGs do not contain .DS_Store until Finder opens the window.
        # Create a minimal file so Iloc entries can be written deterministically.
        open_mode = 'w+'

    with DSStore.open(str(ds_path), open_mode) as ds:
        ds['.']['bwsp'] = bwsp
        ds['.']['icvp'] = icvp
        ds['TypeBridge.app']['Iloc'] = (206, 238)
        ds['Applications']['Iloc'] = (554, 238)

    new_size = ds_path.stat().st_size
    print(f"✓ patched {ds_path} ({old_size}B -> {new_size}B)")


if __name__ == '__main__':
    if len(sys.argv) not in (2, 3):
        print(f"Usage: {sys.argv[0]} <mount> [template]", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
