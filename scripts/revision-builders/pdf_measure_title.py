# -*- coding: utf-8 -*-
"""Measure, off the rendered page, where each title sits and what constrains it.

Rendering rather than reading object boxes, because:
  * the title annotation's /Rect is a bounding box its text does not fill;
  * several pages carry white-out rectangles, so the content's object extent
    can be hundreds of points taller than its actual ink.

Each titled page is rendered twice — with annotations (what a reader sees) and
without (which reveals anything a white-out box is covering). The difference
gives both the title's true ink band and any hidden ink that must STAY hidden
when the page slides down.
"""
import glob
import os
import subprocess
import pikepdf
from PIL import Image

DPI = 150
TO = 72.0 / DPI
TMP = '_m'


def titled_pages(path):
    out = []
    with pikepdf.open(path) as pdf:
        for i, pg in enumerate(pdf.pages):
            ann = pg.get('/Annots')
            if ann is None:
                continue
            if any(a.get('/Contents') for a in ann):
                out.append(i + 1)
    return out


def _render(path, page, tag):
    for f in glob.glob(f'{TMP}{tag}-*.png'):
        os.remove(f)
    subprocess.run(['pdftoppm', '-r', str(DPI), '-f', str(page), '-l', str(page),
                    '-png', '-gray', path, f'{TMP}{tag}'],
                   check=True, capture_output=True)
    return glob.glob(f'{TMP}{tag}-*.png')[0]


def bands(png, limit_pt=None):
    im = Image.open(png).convert('L')
    W, H = im.size
    px = im.load()
    lim = H if limit_pt is None else min(H, int(limit_pt / TO))
    on = [any(px[x, y] < 200 for x in range(0, W, 2)) for y in range(lim)]
    out, run = [], None
    for y, v in enumerate(on):
        if v and run is None:
            run = y
        elif not v and run is not None:
            out.append((run * TO, (y - 1) * TO))
            run = None
    if run is not None:
        out.append((run * TO, (lim - 1) * TO))
    return out, H * TO


def strip_annots(src, dst):
    with pikepdf.open(src) as pdf:
        for p in pdf.pages:
            if '/Annots' in p:
                del p['/Annots']
        pdf.save(dst)


def overlaps(b, others, slack=0.6):
    return any(not (b[1] < o[0] - slack or b[0] > o[1] + slack) for o in others)


def annots(path, page):
    """(title rect, [plain white-out rects]) as distances from the page top."""
    with pikepdf.open(path) as pdf:
        pg = pdf.pages[page - 1]
        H = float(pg.mediabox[3]) - float(pg.mediabox[1])
        title, plain = None, []
        for a in pg.get('/Annots', []):
            x0, y0, x1, y1 = (float(v) for v in a['/Rect'])
            span = (H - y1, H - y0)          # (top, bottom) from the page top
            if a.get('/Contents'):
                title = span
            else:
                plain.append(span)
        return title, plain, H


def measure(path, page, noann_path):
    """Title band, content extent, and any ink a white-out box is hiding.

    The title is found by its annotation rect rather than by differencing the
    two renders: on the promo paper the title sits directly over the original
    school header that a white-out box covers, so the two bands overlap and
    differencing throws the title away with the header.
    """
    seen, H = bands(_render(path, page, 'a'))
    hid, _ = bands(_render(noann_path, page, 'n'))
    trect, plain, _ = annots(path, page)

    title = [b for b in seen
             if trect[0] - 1 <= (b[0] + b[1]) / 2 <= trect[1] - 0.5]
    t_bot = title[-1][1]
    content = [b for b in seen if b[0] > t_bot]
    hidden = [b for b in hid if not overlaps(b, content)]

    # how far the page may slide before hidden ink escapes its cover
    room = None
    for h0, h1 in hidden:
        cover = [p for p in plain if p[0] <= h0 and p[1] >= h1]
        if cover:
            r = min(p[1] for p in cover) - h1
            room = r if room is None else min(room, r)
    return {
        'height': H,
        'title_top': title[0][0], 'title_bot': t_bot, 'title_lines': len(title),
        'content_top': content[0][0],
        'content_bot': max(b[1] for b in content),
        'hidden': hidden, 'hide_room': room,
    }


if __name__ == '__main__':
    for f in ['set1', 'set2', 'set3', 'promo1', 'am4', 'em4']:
        src, noann = f + '.pdf', f + '_noann.pdf'
        if not os.path.exists(noann):
            strip_annots(src, noann)
        print(f'=== {f}')
        for pno in titled_pages(src):
            m = measure(src, pno, noann)
            print(f'  p{pno:<3} h={m["height"]:.0f}  title {m["title_top"]:6.1f}..'
                  f'{m["title_bot"]:6.1f} ({m["title_lines"]} line/s)  '
                  f'above {m["title_top"]:5.1f}  gap {m["content_top"]-m["title_bot"]:5.1f}  '
                  f'content {m["content_top"]:6.1f}..{m["content_bot"]:6.1f}  '
                  f'foot-clear {m["height"]-m["content_bot"]:5.1f}'
                  + (f'  HIDDEN {m["hidden"]}' if m['hidden'] else ''))
