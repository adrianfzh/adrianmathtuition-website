"""The cover page of a revision book, rendered as one full-bleed A4 image.

Rendered rather than laid out in Word because the cover is a piece of artwork —
a band that bleeds off the page and letter-spaced caps do not survive a round
trip through someone else's copy of Word, and a picture does.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

DPI    = 200
W, H   = int(21.0 / 2.54 * DPI), int(29.7 / 2.54 * DPI)      # A4 at 200 dpi
NAVY   = (27, 42, 74)
ORANGE = (224, 138, 58)
GREY   = (110, 122, 142)
RULE   = (190, 198, 210)
LOGO   = Path.home() / 'Desktop/adrianmath-logos/logo1_sqrtm_orange.png'

F = '/System/Library/Fonts/Supplemental/'
ARIAL, BOLD, GEOI = 'Arial.ttf', 'Arial Bold.ttf', 'Georgia Italic.ttf'
def font(name, px): return ImageFont.truetype(F + name, px)


def tracked(d, xy, text, fnt, fill, track=0, anchor='ma'):
    """Letter-spaced text that still honours its anchor."""
    widths = [d.textlength(c, font=fnt) for c in text]
    total  = sum(widths) + track * (len(text) - 1)
    x, y   = xy
    if   anchor[0] == 'm': x -= total / 2
    elif anchor[0] == 'r': x -= total
    for c, w in zip(text, widths):
        d.text((x, y), c, font=fnt, fill=fill, anchor='l' + anchor[1])
        x += w + track
    return total


def logo_on_transparent(path=LOGO):
    """Knock out only the OUTER white — the white inside √m has to survive."""
    im, SENT = Image.open(path).convert('RGB'), (255, 0, 255)
    flood = im.copy()
    for corner in ((0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)):
        ImageDraw.floodfill(flood, corner, SENT, thresh=30)
    a, px = Image.new('L', im.size, 255), flood.load()
    ap = a.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y] == SENT: ap[x, y] = 0
    out = im.convert('RGBA'); out.putalpha(a)
    return out.crop(out.split()[3].getbbox())


def build(out_path, eyebrow, title_lines, subtitle, carpet_png=None, name_line=True):
    page = Image.new('RGB', (W, H), 'white')
    if carpet_png:                                  # the same carpet the pages carry, quieter
        tile = Image.open(carpet_png).convert('RGBA').resize((W, H))
        page.paste(tile, (0, 0), tile)
    d = ImageDraw.Draw(page)

    logo = logo_on_transparent()
    lw   = 470
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    page.paste(logo, ((W - lw) // 2, 260), logo)
    y = 260 + logo.height + 130

    d.line([(W // 2 - 70, y), (W // 2 + 70, y)], fill=ORANGE, width=6)
    y += 62
    tracked(d, (W // 2, y), eyebrow, font(BOLD, 30), ORANGE, track=7)
    y += 105

    for line in title_lines:
        tracked(d, (W // 2, y), line, font(BOLD, 158), NAVY, track=8)
        y += 190
    y += 20
    d.line([(W // 2 - 300, y), (W // 2 + 300, y)], fill=NAVY, width=3)
    y += 58
    d.text((W // 2, y), subtitle, font=font(GEOI, 46), fill=GREY, anchor='ma')

    if name_line:
        ny = H - 478
        tracked(d, (240, ny), 'NAME', font(BOLD, 26), GREY, track=6, anchor='la')
        d.line([(370, ny + 36), (W - 240, ny + 36)], fill=RULE, width=2)

    band = H - 330
    d.rectangle([0, band, W, H], fill=NAVY)
    d.rectangle([0, band, W, band + 9], fill=ORANGE)
    tracked(d, (W // 2, band + 95), 'ADRIANMATH TUITION', font(BOLD, 46), 'white', track=9)
    d.text((W // 2, band + 178), 'adrianmathtuition.com',
           font=font(ARIAL, 34), fill=(150, 170, 200), anchor='ma')

    page.save(out_path, 'PNG')
    return out_path
