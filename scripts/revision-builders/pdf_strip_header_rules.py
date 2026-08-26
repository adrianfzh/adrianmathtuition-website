# -*- coding: utf-8 -*-
"""Remove the ruled lines that framed a running header or footer.

The text stripper drops BT..ET blocks, which leaves the hairline rules that
sat under the header and over the footer still drawn on the page — on Nan Hua
that rule ended up floating just under the new title.

Rules are matched on geometry, not on a y-band: the repeated device bounding
box of a path, tallied across the document, so only a line that recurs page
after page in the margin is removed. Matching paths (never text) also means a
question's own diagram can never be caught, and a band-based rule would have
been unsafe here anyway — Nan Hua's Paper 1 body starts at the exact height of
Paper 2's header rule.

A path carrying a clip (W / W*) is never dropped: removing it would widen the
clip and change how everything after it renders.
"""
import pikepdf
from breathe import _mul

PAINT = {'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'}
BUILD = {'m', 'l', 'c', 'v', 'y', 're', 'h'}


def _paths(ops, height):
    """(start, end, (x0, y_top, x1, y_bot), clipped) for each path sequence."""
    ctm, stack, start, pts, clipped = (1, 0, 0, 1, 0, 0), [], None, [], False
    for i, ins in enumerate(ops):
        op = str(ins.operator)
        o = ins.operands
        if op == 'q':
            stack.append(ctm)
        elif op == 'Q':
            ctm = stack.pop() if stack else (1, 0, 0, 1, 0, 0)
        elif op == 'cm' and len(o) >= 6:
            ctm = _mul(tuple(float(x) for x in o[:6]), ctm)
        elif op in BUILD:
            if start is None:
                start, pts, clipped = i, [], False
            v = [float(x) for x in o]
            corners = ([(v[0], v[1]), (v[0] + v[2], v[1] + v[3])] if op == 're'
                       else [(v[j], v[j + 1]) for j in range(0, len(v) - 1, 2)])
            for x, y in corners:
                m = _mul((1, 0, 0, 1, x, y), ctm)
                pts.append((m[4], height - m[5]))
        elif op in ('W', 'W*'):
            clipped = True
        elif op in PAINT and start is not None:
            if pts:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                yield start, i, (min(xs), min(ys), max(xs), max(ys)), clipped
            start, pts, clipped = None, [], False


def strip(src, dst, share=0.30, top_band=115.0, bot_band=130.0, report=True):
    with pikepdf.open(src) as pdf:
        n = len(pdf.pages)
        tally = {}
        for pg in pdf.pages:
            pg.contents_coalesce()
            H = float(pg.mediabox[3]) - float(pg.mediabox[1])
            for _, _, bb, clipped in _paths(pikepdf.parse_content_stream(pg), H):
                if clipped:
                    continue
                if bb[1] < top_band or bb[3] > H - bot_band:
                    tally[tuple(round(v) for v in bb)] = \
                        tally.get(tuple(round(v) for v in bb), 0) + 1
        need = max(3, int(n * share))
        kill_sig = {k for k, c in tally.items() if c >= need}
        if report:
            for k in sorted(kill_sig, key=lambda k: k[1]):
                print(f'      rule x{k[0]}..{k[2]} y{k[1]}..{k[3]}  '
                      f'on {tally[k]}/{n} pages')

        removed = 0
        for pg in pdf.pages:
            H = float(pg.mediabox[3]) - float(pg.mediabox[1])
            ops = pikepdf.parse_content_stream(pg)
            kill = set()
            for s, e, bb, clipped in _paths(ops, H):
                if clipped:
                    continue
                if tuple(round(v) for v in bb) in kill_sig:
                    kill.update(range(s, e + 1))
            if kill:
                removed += 1
                pg.Contents = pdf.make_stream(pikepdf.unparse_content_stream(
                    [o for j, o in enumerate(ops) if j not in kill]))
        pdf.save(dst)
    if report:
        print(f'   removed rules on {removed}/{n} pages -> {dst}')
    return removed
