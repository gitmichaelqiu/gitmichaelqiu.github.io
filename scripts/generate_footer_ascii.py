#!/usr/bin/env python3
"""Generate a mirrored ASCII portrait and embed its characters in index.html."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


COLS = 96
ROWS = 58
BACKGROUND_CUTOFF = 42
GLYPHS = " .:-=+*#%@MW"
START_MARKER = "<!-- MQIU_ASCII_START -->"
END_MARKER = "<!-- MQIU_ASCII_END -->"


def build_markup(source: Path) -> str:
    """Sample the portrait and wrap every foreground glyph in an HTML span."""
    image = ImageOps.mirror(
        Image.open(source).convert("L").resize((COLS, ROWS), Image.Resampling.LANCZOS)
    )
    rows = []
    for y in range(ROWS):
        characters = []
        for x in range(COLS):
            luminance = image.getpixel((x, y))
            if luminance <= BACKGROUND_CUTOFF:
                characters.append(" ")
                continue

            amount = (luminance - BACKGROUND_CUTOFF) / (255 - BACKGROUND_CUTOFF)
            level = round(amount * (len(GLYPHS) - 1))
            character = GLYPHS[level]
            characters.append(
                f'<span class="footer-ascii-char t{level}" data-char="{character}">'
                f"{character}</span>"
            )
        rows.append("".join(characters))
    return "\n".join(rows)


def embed_ascii(source: Path, output: Path) -> None:
    """Replace the marked source region with the generated HTML character grid."""
    html = output.read_text(encoding="utf-8")
    start = html.find(START_MARKER)
    end = html.find(END_MARKER, start + len(START_MARKER))
    if start < 0 or end < 0:
        raise SystemExit(f"Could not find ASCII markers in {output}")

    content_start = start + len(START_MARKER)
    updated = html[:content_start] + build_markup(source) + html[end:]
    output.write_text(updated, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="source MQiu Bot image")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "index.html",
        help="HTML file to update (defaults to index/index.html)",
    )
    args = parser.parse_args()
    embed_ascii(args.source, args.output)
    print(f"Embedded {COLS}x{ROWS} ASCII art in {args.output}")


if __name__ == "__main__":
    main()
