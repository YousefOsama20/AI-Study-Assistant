"""Generate the Windows/Electron icon assets from the brand SVG geometry.

This mirrors assets/icon.svg with Pillow because the build machine does not
depend on an SVG rasterizer. Run from anywhere:

    python frontend/scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SCALE = 4
SIZE = 512 * SCALE


def s(value: float) -> int:
    return int(round(value * SCALE))


def main() -> None:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        [s(16), s(16), s(496), s(496)],
        radius=s(112),
        fill=(190, 81, 3, 255),
    )

    draw.polygon(
        [(s(96), s(160)), (s(250), s(132)), (s(250), s(372)), (s(96), s(400))],
        fill=(255, 206, 27, 255),
    )
    draw.polygon(
        [(s(262), s(132)), (s(416), s(160)), (s(416), s(400)), (s(262), s(372))],
        fill=(255, 206, 27, 255),
    )

    draw.line(
        [(s(256), s(132)), (s(256), s(372))],
        fill=(183, 65, 14, 255),
        width=s(12),
    )

    line_color = (190, 81, 3, 115)
    for offset in (0, 44, 88):
        draw.line(
            [(s(128), s(210 + offset)), (s(220), s(194 + offset))],
            fill=line_color,
            width=s(12),
        )
        draw.line(
            [(s(292), s(194 + offset)), (s(384), s(210 + offset))],
            fill=line_color,
            width=s(12),
        )

    draw.polygon(
        [
            (s(292), s(132)),
            (s(352), s(132)),
            (s(352), s(254)),
            (s(322), s(228)),
            (s(292), s(254)),
        ],
        fill=(6, 148, 148, 255),
    )

    draw.ellipse(
        [s(140), s(326), s(200), s(386)],
        fill=(183, 65, 14, 255),
    )
    draw.line(
        [(s(191), s(377)), (s(243), s(429))],
        fill=(183, 65, 14, 255),
        width=s(24),
    )

    icon = image.resize((512, 512), Image.Resampling.LANCZOS)
    icon.save(ASSETS / "icon.png")
    icon.save(
        ASSETS / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Wrote {ASSETS / 'icon.png'}")
    print(f"Wrote {ASSETS / 'icon.ico'}")


if __name__ == "__main__":
    main()
