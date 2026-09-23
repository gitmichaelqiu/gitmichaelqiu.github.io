#!/usr/bin/env python3
"""Generate a mirrored ASCII portrait and embed its characters in index.html."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps


COLS = 96
ROWS = 58
BACKGROUND_CUTOFF = 42
GLYPHS = " .:-=+*#%@MW"
START_MARKER = "<!-- MQIU_ASCII_START -->"
END_MARKER = "<!-- MQIU_ASCII_END -->"
BLINK_EYES = (
    # Bounds, vertical close cell, and vertical squeeze core on the mirrored grid.
    (69, 28, 73, 33, 30, 71, 30, 31),
    (44, 33, 47, 37, 35, 46, 35, 35),
)


def blink_fill_level(image: Image.Image, x: int, y: int) -> Optional[tuple[int, bool, bool, bool]]:
    """Return a face tone, tip flag, vertical-core flag, and closed-eye flag."""
    for left, top, right, bottom, close_row, close_column, core_top, core_bottom in BLINK_EYES:
        if top <= y <= bottom and left <= x <= right and image.getpixel((x, y)) <= BACKGROUND_CUTOFF:
            flank_left = image.getpixel((max(0, left - 2), y))
            flank_right = image.getpixel((min(COLS - 1, right + 2), y))
            luminance = round((flank_left + flank_right) / 2)
            amount = (luminance - BACKGROUND_CUTOFF) / (255 - BACKGROUND_CUTOFF)
            level = round(amount * (len(GLYPHS) - 1))
            eye_tip = y in (top, bottom)
            vertical_core = core_top <= y <= core_bottom and x == close_column
            closed_eye = y == close_row and x == close_column
            return level, eye_tip, vertical_core, closed_eye
    return None


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
                blink_fill = blink_fill_level(image, x, y)
                if blink_fill is not None:
                    fill_level, eye_tip, vertical_core, closed_eye = blink_fill
                    blink_character = GLYPHS[fill_level]
                    narrow_character = blink_character if eye_tip else " "
                    squint_character = " " if vertical_core else blink_character
                    closed_character = "|" if closed_eye else blink_character
                    closed_class = " footer-ascii-blink-closed" if closed_eye else ""
                    characters.append(
                        f'<span class="footer-ascii-char t{fill_level} footer-ascii-blink-fill{closed_class}" '
                        f'data-char=" " data-narrow-char="{narrow_character}" '
                        f'data-squint-char="{squint_character}" '
                        f'data-blink-char="{closed_character}"> </span>'
                    )
                    continue
                characters.append(" ")
                continue

            amount = (luminance - BACKGROUND_CUTOFF) / (255 - BACKGROUND_CUTOFF)
            level = round(amount * (len(GLYPHS) - 1))
            character = GLYPHS[level]
            characters.append(
                f'<span class="footer-ascii-char t{level}" data-char="{character}">'
                f"{character}</span>"
            )
        rows.append("".join(characters).rstrip())
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
