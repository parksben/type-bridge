#!/usr/bin/env python3
"""fix_dsstore.py — Patch DMG .DS_Store with stable icon positions.

Usage: python3 fix_dsstore.py <mount_point> [template_dsstore]

By default this script only writes Iloc entries to maximize Finder stability.

Set TYPEBRIDGE_DMG_VIEW_MODE to control style:
- iloc: only icon positions (default, safest)
- lite: icon view/window styling without background alias
- background: full styling with background alias (experimental)
"""

import os
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


def build_icvp_blob(background_alias: bytes | None = None) -> bytes:
    data = {
        'arrangeBy': 'none',
        'backgroundColorBlue': 1.0,
        'backgroundColorGreen': 1.0,
        'backgroundColorRed': 1.0,
        'backgroundType': 0,
        'gridOffsetX': 0.0,
        'gridOffsetY': 0.0,
        'gridSpacing': 116.0,
        'iconSize': 136.0,
        'labelOnBottom': True,
        'showIconPreview': True,
        'showItemInfo': False,
        'textSize': 15.0,
        'viewOptionsVersion': 1,
    }
    if background_alias is not None:
        data['backgroundType'] = 2
        data['backgroundImageAlias'] = background_alias
    return plistlib.dumps(data, fmt=plistlib.FMT_BINARY)


def generate(mount: str, template: str | None = None) -> None:
    mnt = Path(mount)
    ds_path = mnt / '.DS_Store'
    view_mode = os.getenv('TYPEBRIDGE_DMG_VIEW_MODE', 'iloc').strip().lower()

    open_mode = 'r+'
    old_size = 0
    if ds_path.exists():
        old_size = ds_path.stat().st_size
    else:
        # Some DMGs do not contain .DS_Store until Finder opens the window.
        # Create a minimal file so Iloc entries can be written deterministically.
        open_mode = 'w+'

    with DSStore.open(str(ds_path), open_mode) as ds:
        if view_mode in ('lite', 'background'):
            bwsp = build_bwsp_blob()
            icvp = build_icvp_blob()
            ds['.']['bwsp'] = bwsp
            ds['.']['icvp'] = icvp

        if view_mode == 'background':
            background_image = mnt / '.background' / 'dmg-background.png'
            if background_image.exists():
                # Resolve /tmp symlink to /private/tmp first; otherwise
                # Alias.for_file can encode odd '../../../tmp/...' paths.
                background_real = background_image.resolve()
                icvp = build_icvp_blob(
                    Alias.for_file(str(background_real)).to_bytes()
                )
                ds['.']['icvp'] = icvp
            else:
                print(f'WARN: background image missing, skip bwsp/icvp: {background_image}')
        ds['TypeBridge.app']['Iloc'] = (180, 185)
        ds['Applications']['Iloc'] = (530, 185)
        ds['\u9996\u6b21\u542f\u52a8\u524d\u5fc5\u8bfb.txt']['Iloc'] = (380, 378)

    new_size = ds_path.stat().st_size
    print(f"✓ patched {ds_path} ({old_size}B -> {new_size}B)")


if __name__ == '__main__':
    if len(sys.argv) not in (2, 3):
        print(f"Usage: {sys.argv[0]} <mount> [template]", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
