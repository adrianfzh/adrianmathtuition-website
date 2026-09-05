#!/usr/bin/env python3
"""Subset the two chalk-theme faces into public/lessons/fonts/*.woff.

The lesson player self-hosts its handwriting faces: Kalam for prose (the one
the chalk WRITER draws, so its glyphs must be the same ones the browser lays
out) and Permanent Marker for titles. Google Fonts is deliberately NOT used —
the writer rasterises the laid-out face to derive its pen paths, so the file
the CSS loads and the file the engine reads have to be one and the same, and a
third-party stylesheet would also be a render-blocking round trip on a page
that is otherwise self-contained.

Run (system python3 has fontTools; brotli is absent on this Mac, so WOFF —
zlib — not WOFF2):

    /usr/bin/python3 scripts/lessons/subset-hand-fonts.py <dir-with-source-ttfs>

Sources are the upstream OFL releases (Kalam-Regular.ttf, PermanentMarker-Regular.ttf).
"""
import sys, pathlib
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

# ASCII + the punctuation Adrian's lesson prose actually uses, plus a little headroom.
EXTRA = "°·×÷–—‘’“”…′″²³½¼¾→←↑↓↔≈≠≤≥±£€•§"
CHARS = "".join(chr(c) for c in range(0x20, 0x7F)) + EXTRA

OUT = pathlib.Path(__file__).resolve().parents[2] / "public" / "lessons" / "fonts"

def build(src: pathlib.Path, name: str) -> None:
    font = TTFont(str(src))
    opts = Options()
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.drop_tables += ["DSIG"]
    sub = Subsetter(options=opts)
    sub.populate(text=CHARS)
    sub.subset(font)
    font.flavor = "woff"
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{name}.woff"
    font.save(str(dest))
    print(f"{dest.name}: {dest.stat().st_size / 1024:.1f} KB  ({len(CHARS)} chars)")

if __name__ == "__main__":
    root = pathlib.Path(sys.argv[1]).expanduser()
    build(root / "Kalam.ttf", "Kalam-Regular.subset")
    build(root / "PermanentMarker.ttf", "PermanentMarker-Regular.subset")
