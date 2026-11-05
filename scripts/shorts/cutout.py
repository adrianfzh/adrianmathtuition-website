#!/usr/bin/env python3
"""Cut a sticker character out of its chroma-green background (5 Nov 2026, Shorts animals).

  /usr/bin/python3 scripts/shorts/cutout.py <in.png> <out.png> [size]

A plain colour key also ate the green inside the character (an otter turned purple on the purple look).
So: flood-fill from the edges through green-ish pixels only (stops at the white sticker outline), then
clear any strongly green pixel left inside (gaps between a tail and a body), trim, pad square, resize.
"""
import sys
from collections import deque
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
im = Image.open(src).convert('RGBA'); w, h = im.size; px = im.load()
green = lambda c: c[1] > c[0] + 25 and c[1] > c[2] + 25
seen = bytearray(w * h); q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
while q:
    x, y = q.popleft(); i = y * w + x
    if seen[i]: continue
    seen[i] = 1
    if not green(px[x, y]): continue
    px[x, y] = (0, 0, 0, 0)
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]: q.append((nx, ny))
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a and g > r + 45 and g > b + 45: px[x, y] = (0, 0, 0, 0)
box = im.getbbox(); im = im.crop(box)
side = max(im.size); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(im, ((side - im.size[0]) // 2, side - im.size[1]))  # bottom-aligned, like the tutor set
sq.resize((size, size), Image.LANCZOS).save(dst)
