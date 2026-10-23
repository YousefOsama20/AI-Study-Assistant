"""Generate Electron/favicon assets from the source logo mark.

The source of truth is ``src/assets/logo-mark.png`` (the circular emblem).
Run from anywhere:

    python frontend/scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PUBLIC = ROOT / "public"
SOURCE = ROOT / "src" / "assets" / "logo-mark.png"


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing logo source: {SOURCE}")

    image = Image.open(SOURCE).convert("RGBA")
    icon = image.resize((512, 512), Image.Resampling.LANCZOS)

    icon.save(ASSETS / "icon.png")
    icon.save(
        ASSETS / "icon.ico",
        sizes=[
            (16, 16),
            (24, 24),
            (32, 32),
            (48, 48),
            (64, 64),
            (128, 128),
            (256, 256),
        ],
    )
    (ASSETS / "icon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
        'viewBox="0 0 512 512" role="img" aria-label="AI-Study-Assistant">\n'
        '  <image href="icon.png" width="512" height="512"/>\n'
        "</svg>\n",
        encoding="utf-8",
    )

    PUBLIC.mkdir(parents=True, exist_ok=True)
    image.resize((64, 64), Image.Resampling.LANCZOS).save(PUBLIC / "favicon.png")
    image.resize((180, 180), Image.Resampling.LANCZOS).save(
        PUBLIC / "apple-touch-icon.png"
    )

    print(f"Wrote {ASSETS / 'icon.png'}")
    print(f"Wrote {ASSETS / 'icon.ico'}")
    print(f"Wrote {ASSETS / 'icon.svg'}")
    print(f"Wrote {PUBLIC / 'favicon.png'}")
    print(f"Wrote {PUBLIC / 'apple-touch-icon.png'}")


if __name__ == "__main__":
    main()
