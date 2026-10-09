"""Tessellating patterns and a big monogram, as candidate watermarks.

Adrian liked **G** here (15 Sep 2026: "i like this watermark as well, which was G"):
ONE large AM badge, brand navy #1e3a5f, 11% - `big_icon(pct=11, colour=NAVY)`.
It is the only NON-carpet mark he has picked; the carpets he picked (T, U, V) are
in designs.py.  Nothing here is switched on.

    /usr/bin/python3 patterns.py       # writes p-*.png, 200 dpi A4 tiles


Every tile is drawn at 3x and resized down: PIL draws lines with no
anti-aliasing, and a 1-px hairline at 200 dpi comes out ragged and twice as
loud as it should be.  Supersampling is what makes a hairline look like a
hairline and keeps the ink where the per cent says it is.

Colour: grey is what a school uses because it photocopies to nothing.  The
navy is the brand colour from favicon.svg (#1e3a5f); at these strengths it
prints as a cool grey and reads as deliberate rather than as a smudge.
"""
import math
from PIL import Image, ImageDraw, ImageFont

DPI = 200
SS = 3                                   # supersample factor
A4 = (int(21.0 / 2.54 * DPI), int(29.7 / 2.54 * DPI))
FONT = '/System/Library/Fonts/Supplemental/Georgia.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
NAVY = (30, 58, 95)
INK = (0, 0, 0)


def cm(v, s=1):
    return v / 2.54 * DPI * s


def canvas():
    return Image.new('RGBA', (A4[0] * SS, A4[1] * SS), (255, 255, 255, 0))


def done(im, out):
    im.resize(A4, Image.LANCZOS).save(out)


def rgba(colour, pct):
    return colour + (int(round(255 * pct / 100.0)),)


def hexes(out, side_cm=1.15, pct=7, colour=INK, lw_pt=0.6):
    """A honeycomb.  Quiet, regular, and nothing on a maths page looks like it."""
    im = canvas(); d = ImageDraw.Draw(im)
    r = cm(side_cm, SS); w = lw_pt / 72 * DPI * SS
    dx = r * 3; dy = r * math.sqrt(3)
    col = rgba(colour, pct)
    j = 0; y = -dy
    while y < im.size[1] + dy:
        x = -dx + (r * 1.5 if j % 2 else 0)
        while x < im.size[0] + dx:
            pts = [(x + r * math.cos(math.radians(a)), y + r * math.sin(math.radians(a)))
                   for a in range(0, 360, 60)]
            d.polygon(pts, outline=col, width=max(1, int(w)))
            x += dx
        y += dy / 2; j += 1
    done(im, out)


def flower(out, r_cm=1.3, pct=6, colour=INK, lw_pt=0.6):
    """Overlapping circles on a triangular lattice - the oldest tessellation
    there is, and the one a maths sheet can honestly wear."""
    im = canvas(); d = ImageDraw.Draw(im)
    r = cm(r_cm, SS); w = max(1, int(lw_pt / 72 * DPI * SS))
    col = rgba(colour, pct)
    dx = r; dy = r * math.sqrt(3) / 2
    j = 0; y = -r
    while y < im.size[1] + r:
        x = -r + (dx / 2 if j % 2 else 0)
        while x < im.size[0] + r:
            d.ellipse([x - r, y - r, x + r, y + r], outline=col, width=w)
            x += dx
        y += dy; j += 1
    done(im, out)


def iso(out, step_cm=0.8, pct=6, colour=INK, lw_pt=0.5):
    """Isometric ruling - three directions, so it reads as paper, not as a
    diagram someone left behind."""
    im = canvas(); d = ImageDraw.Draw(im)
    s = cm(step_cm, SS); w = max(1, int(lw_pt / 72 * DPI * SS))
    col = rgba(colour, pct)
    W, H = im.size
    y = 0
    while y < H:
        d.line([(0, y), (W, y)], fill=col, width=w); y += s * math.sqrt(3) / 2
    for sign in (1, -1):
        x = -H * 2
        while x < W + H * 2:
            d.line([(x, 0), (x + sign * H / math.tan(math.radians(60)), H)],
                   fill=col, width=w)
            x += s
    done(im, out)


def monogram_tile(out, pct=9, colour=INK, box_cm=1.0, pitch_cm=3.2):
    """The favicon's AM badge, tiled.  A pattern that also says whose it is."""
    im = canvas(); d = ImageDraw.Draw(im)
    b = cm(box_cm, SS); p = cm(pitch_cm, SS)
    col = rgba(colour, pct)
    f = ImageFont.truetype(BOLD, int(b * 0.52))
    j = 0; y = -p
    while y < im.size[1] + p:
        x = -p + (p / 2 if j % 2 else 0)
        while x < im.size[0] + p:
            d.rounded_rectangle([x, y, x + b, y + b], radius=b * 0.18,
                                outline=col, width=max(1, int(0.9 / 72 * DPI * SS)))
            bb = d.textbbox((0, 0), 'AM', font=f)
            d.text((x + (b - (bb[2] - bb[0])) / 2 - bb[0],
                    y + (b - (bb[3] - bb[1])) / 2 - bb[1]), 'AM', font=f, fill=col)
            x += p
        y += p; j += 1
    done(im, out)


def big_icon(out, pct=9, colour=INK, size_cm=11.0, caption=True):
    """One large badge in the middle of the page - the least busy of the lot,
    and the easiest to crop off a photograph."""
    im = canvas(); d = ImageDraw.Draw(im)
    b = cm(size_cm, SS)
    x = (im.size[0] - b) / 2; y = (im.size[1] - b) / 2
    col = rgba(colour, pct)
    d.rounded_rectangle([x, y, x + b, y + b], radius=b * 0.18, outline=col,
                        width=max(1, int(3.0 / 72 * DPI * SS)))
    f = ImageFont.truetype(BOLD, int(b * 0.44))
    bb = d.textbbox((0, 0), 'AM', font=f)
    d.text((x + (b - (bb[2] - bb[0])) / 2 - bb[0],
            y + (b - (bb[3] - bb[1])) / 2 - bb[1] - b * 0.06), 'AM', font=f, fill=col)
    if caption:
        g = ImageFont.truetype(FONT, int(b * 0.085))
        bb = d.textbbox((0, 0), 'AdrianMath Tuition', font=g)
        d.text((x + (b - (bb[2] - bb[0])) / 2 - bb[0], y + b * 0.70), 
               'AdrianMath Tuition', font=g, fill=col)
    done(im, out)


if __name__ == '__main__':
    # G - THE ONE HE LIKED (15 Sep 2026): one large AM badge, brand navy, 11%.
    big_icon('p-icon-navy.png', pct=11, colour=NAVY)
    # the six he passed over, kept because the next iteration is likely a tweak
    hexes('p-hex.png')
    flower('p-flower.png')
    iso('p-iso.png')
    monogram_tile('p-mono.png')
    big_icon('p-icon.png')
    flower('p-flower-navy.png', pct=9, colour=NAVY)
    print('ok')
