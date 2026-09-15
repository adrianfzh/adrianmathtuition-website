"""The carpet built from ONE phrase set at several sizes.

Adrian, 15 Sep 2026: "possible to have different size fonts forming the
tessellation? just use adrianmath tuition."

Mixing sizes is what turns a repeat into a pattern.  A single size tiled across
a page is wallpaper — the eye takes it in once and stops.  Two or three sizes in
a fixed rhythm give the page a beat, and the small type does the work the big
type cannot: it fills the gaps the big words leave, so the carpet has no holes
for a crop to land in.

A row is a list of SEGMENTS, so sizes can change along a line as well as down
the page, and every segment in a row sits on the SAME BASELINE (anchor 'ls') —
mixed sizes hanging from a common top edge is the tell of a carpet nobody set
on purpose.  Each segment carries its own per cent of ink, because the same
grey does not read the same at 28 pt as at 7 pt: a large word at 12% is a
smudge where a small one is a whisper, so the big sizes are always set lighter.

Rows cycle down the page and the leading follows the LARGEST size in the row,
so a big row never lands on top of the one above it.
"""
import math
from PIL import Image, ImageDraw, ImageFont

DPI = 200
SS = 2
A4 = (int(21.0 / 2.54 * DPI), int(29.7 / 2.54 * DPI))
DIAG = int(math.hypot(*A4)) + 40
ARIAL = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
GEORGIA = '/System/Library/Fonts/Supplemental/Georgia.ttf'
PHRASE = 'AdrianMath Tuition'
CAPS = 'ADRIANMATH TUITION'
INK = (0, 0, 0)

_fonts = {}


def _font(path, pt):
    k = (path, round(pt, 2))
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(path, max(4, int(round(pt / 72 * DPI * SS))))
    return _fonts[k]


def seg(text, pt, pct, track=0.0, font=BOLD, gap=0.55):
    """One run of type inside a row.

    `track` is extra letter-spacing in points.  `gap` is the space AFTER the
    run, as a multiple of its own point size — a fixed gap in points leaves 28
    pt words jammed against each other while 7 pt ones float apart, which is
    the first thing that makes a carpet look unset.
    """
    return dict(text=text, pt=pt, pct=pct, track=track, font=font, gap=gap)


def _px(pt):
    return pt / 72 * DPI * SS


def _seg_width(d, s):
    f = _font(s['font'], s['pt'])
    w = sum(d.textlength(c, font=f) + _px(s['track']) for c in s['text'])
    return w + _px(s['gap'] * s['pt'])


def _draw_seg(d, x, base, s):
    f = _font(s['font'], s['pt'])
    v = int(round(255 * s['pct'] / 100.0))
    for c in s['text']:
        d.text((x, base), c, font=f, fill=v, anchor='ls')
        x += d.textlength(c, font=f) + _px(s['track'])
    return x + _px(s['gap'] * s['pt'])


def carpet(out, rows, angle=-32, colour=INK, lead=1.45, phase=0.34):
    """`rows` is a list of rows, each a list of segments, cycled down the page.

    `lead` multiplies the row's largest point size to get the next baseline;
    `phase` shifts each row along by that fraction of its own repeat, so the
    seams never stack into a visible vertical street down the page.
    """
    mask = Image.new('L', (DIAG * SS, DIAG * SS), 0)
    d = ImageDraw.Draw(mask)
    base = 0.0
    r = 0
    while base < mask.size[1] + 200:
        row = rows[r % len(rows)]
        w = sum(_seg_width(d, s) for s in row)
        x = -w + (r * phase * w) % w
        while x < mask.size[0]:
            for s in row:
                x = _draw_seg(d, x, base, s)
        nxt = rows[(r + 1) % len(rows)]
        # the leading answers to BOTH rows: a 30 pt row followed by a 7 pt one
        # still needs 30 pt of clearance, or the small line lands in its tail
        big = max(max(s['pt'] for s in row), max(s['pt'] for s in nxt))
        base += _px(big) * lead
        r += 1
    mask = mask.rotate(angle, resample=Image.BICUBIC)
    l = (mask.size[0] - A4[0] * SS) // 2
    t = (mask.size[1] - A4[1] * SS) // 2
    mask = mask.crop((l, t, l + A4[0] * SS, t + A4[1] * SS)).resize(A4, Image.LANCZOS)
    page = Image.new('RGBA', A4, colour + (0,))
    page.putalpha(mask)
    page.save(out)
    return page
