#!/usr/bin/env python3
"""
TypeBridge — Icon Asset Generator
Converts logo-appicon.svg and logo-tray.svg into all required PNG sizes
for the Tauri macOS app bundle, plus .icns (via iconutil).
"""

import io
import os
import subprocess
import tempfile
from pathlib import Path

import cairosvg
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ICONS_DIR = PROJECT_ROOT / "src-tauri" / "icons"
PUBLIC_DIR = PROJECT_ROOT / "public"

# macOS .icns required sizes (name → pixel size)
ICNS_SIZES = {
    "icon_16x16.png":       16,
    "icon_16x16@2x.png":    32,
    "icon_32x32.png":       32,
    "icon_32x32@2x.png":    64,
    "icon_128x128.png":     128,
    "icon_128x128@2x.png":  256,
    "icon_256x256.png":     256,
    "icon_256x256@2x.png":  512,
    "icon_512x512.png":     512,
    "icon_512x512@2x.png": 1024,
}

# Tauri bundle icon sizes needed (from tauri.conf.json)
BUNDLE_SIZES = {
    "32x32.png":         32,
    "128x128.png":       128,
    "128x128@2x.png":    256,
}

# Windows icon (not used but kept for completeness)
WIN_ICON_SIZES = [16, 32, 48, 64, 128, 256]


def svg_to_png(svg_path: Path, output_path: Path, size: int):
    """Render SVG to PNG of given size using cairosvg, enforce RGBA."""
    png_data = cairosvg.svg2png(
        url=str(svg_path),
        output_width=size,
        output_height=size,
    )
    img = Image.open(io.BytesIO(png_data))
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    img.save(output_path, "PNG")
    print(f"  ✓ {output_path.name} ({size}×{size})")


def build_icns(appicon_svg: Path, icns_output: Path):
    """Build .icns from appicon SVG using iconutil."""
    with tempfile.TemporaryDirectory() as tmpdir:
        iconset = Path(tmpdir) / "app.iconset"
        iconset.mkdir()

        for name, size in ICNS_SIZES.items():
            png_path = iconset / name
            svg_to_png(appicon_svg, png_path, size)

        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(icns_output)],
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"  ✓ icon.icns")


def build_ico(appicon_svg: Path, ico_output: Path):
    """Build .ico from appicon SVG using Pillow."""
    frames = []
    for size in sorted(WIN_ICON_SIZES, reverse=True):
        png_data = cairosvg.svg2png(
            url=str(appicon_svg),
            output_width=size,
            output_height=size,
        )
        img = Image.open(io.BytesIO(png_data))
        frames.append(img)

    frames[0].save(
        ico_output,
        format="ICO",
        sizes=[(s, s) for s in sorted(WIN_ICON_SIZES, reverse=True)],
        append_images=frames[1:],
    )
    print(f"  ✓ icon.ico")


def main():
    appicon_svg = PUBLIC_DIR / "logo-appicon.svg"
    tray_svg = PUBLIC_DIR / "logo-tray.svg"

    if not appicon_svg.exists():
        print(f"ERROR: {appicon_svg} not found")
        return 1

    print("Generating TypeBridge icon assets…\n")

    # 1. Bundle PNGs (referenced in tauri.conf.json bundle.icon)
    print("[1/5] Bundle PNG icons:")
    for name, size in BUNDLE_SIZES.items():
        svg_to_png(appicon_svg, ICONS_DIR / name, size)

    # 2. Tray icon (separate file, not overwriting bundle icons)
    print("\n[2/5] Tray icon (44x44) from logo-tray.svg:")
    if tray_svg.exists():
        svg_to_png(tray_svg, ICONS_DIR / "tray-icon.png", 44)
    else:
        print("  (tray SVG not found, using appicon for tray)")
        svg_to_png(appicon_svg, ICONS_DIR / "tray-icon.png", 44)

    # 3. macOS .icns
    print("\n[3/5] macOS .icns:")
    build_icns(appicon_svg, ICONS_DIR / "icon.icns")

    # 4. Windows .ico
    print("\n[4/5] Windows .ico:")
    build_ico(appicon_svg, ICONS_DIR / "icon.ico")

    # 5. Retina DMG background (760×480 pt rendered at 2x)
    dmg_bg_svg = PUBLIC_DIR / "dmg-background.svg"
    dmg_bg_png = ICONS_DIR / "dmg-background.png"
    print("\n[5/5] DMG background:")
    if dmg_bg_svg.exists():
        result = subprocess.run(
            ["rsvg-convert", "-w", "1520", "-h", "960", str(dmg_bg_svg), "-o", str(dmg_bg_png)],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            subprocess.run(
                ["sips", "-s", "dpiWidth", "144", "-s", "dpiHeight", "144", str(dmg_bg_png)],
                check=False,
                capture_output=True,
                text=True,
            )
            print("  ✓ dmg-background.png (1520×960 @2x for 760×480 pt)")
        else:
            print(f"  ✗ rsvg-convert failed: {result.stderr.strip()}")
    else:
        print("  (dmg-background.svg not found, skipping)")

    print(f"\nDone! All icon assets written to {ICONS_DIR}")


if __name__ == "__main__":
    main()
