#!/usr/bin/env python3
"""Make a stitched book's contents page actually work.

A book assembled out of per-topic files usually keeps the contents page's
`<w:hyperlink w:anchor="secNN">` links but LOSES the bookmarks they point at —
each source file carried its own `w:id="0"` bookmark and only one survived the
merge.  Word shows such a link as live and then does nothing when you tap it.

This script:

  1. reads every `w:anchor` on the contents page and, for each one with no
     matching `<w:bookmarkStart>`, finds the topic in the body by MATCHING THE
     LINK'S OWN TEXT against the paragraphs that start a topic, and puts the
     bookmark on the topic's first paragraph — so the jump lands at the top of
     the page, not halfway down it;
  2. drops a `contents` bookmark at the head of the contents page;
  3. adds a small right-aligned "↑ Contents" link to every page header that
     carries a watermark picture, so every page can get back.  Nothing is added
     to the body, so pagination does not move, and the cover's blank header is
     left alone.

  python3 contents_links.py in.docx out.docx [--label "↑ Contents"]

It never writes over its input.  Run it AFTER bookify.py, which is what creates
the headers this hangs the backlink on.
"""
import re, sys, shutil, zipfile, difflib
from pathlib import Path

BACKLINK = '↑ Contents'
GREY     = '8A8A8A'
FIRST_ID = 9001          # bookmark ids well clear of the document's own

P_RE   = re.compile(r'<w:p\b(?:[^>]*)>.*?</w:p>|<w:p\b[^>]*/>', re.S)
T_RE   = re.compile(r'<w:t[^>]*>([^<]*)</w:t>')
PPR_RE = re.compile(r'<w:pPr\b.*?</w:pPr>|<w:pPr\b[^>]*/>', re.S)


def text_of(p):
    return ' '.join(''.join(T_RE.findall(p)).split()).strip()


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def close(a, b):
    """Titles drift between contents and body ('Graphs on' vs 'Graph on')."""
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def bookmark(p, name, bid):
    """Put a bookmark around a whole paragraph. w:pPr, if present, comes first."""
    at = p.index('>') + 1
    m = PPR_RE.search(p)
    if m and m.start() == at:
        at = m.end()
    start = f'<w:bookmarkStart w:id="{bid}" w:name="{name}"/>'
    return p[:at] + start + p[at:].replace('</w:p>', f'<w:bookmarkEnd w:id="{bid}"/></w:p>', 1)


def repair_anchors(doc, label=BACKLINK):
    paras = [(m.start(), m.end(), m.group(0)) for m in P_RE.finditer(doc)]
    body = [text_of(p) for _, _, p in paras]

    links = [(m.group(1), text_of(m.group(0)))
             for m in re.finditer(r'<w:hyperlink w:anchor="([^"]+)">(.*?)</w:hyperlink>', doc, re.S)]
    have = set(re.findall(r'<w:bookmarkStart[^>]*w:name="([^"]+)"', doc))
    todo = [(a, t) for a, t in links if a not in have and t]

    # A topic starts at a banner paragraph — the running head the book repeats
    # at the top of every topic.  Whatever that line says, it is the paragraph
    # that appears most often among the document's page-break paragraphs.
    breaks = [i for i, (_, _, p) in enumerate(paras) if '<w:pageBreakBefore/>' in p]
    counts = {}
    for i in breaks:
        if body[i]:
            counts[body[i]] = counts.get(body[i], 0) + 1
    banner = max(counts, key=counts.get) if counts else None
    starts = [i for i, t in enumerate(body) if banner and t == banner]
    # A section break can leave a spare banner line at the FOOT of the page
    # before the topic, so two banner paragraphs sit next to each other.  The
    # topic starts at the second one — the one carrying the page break.
    spare = set(starts)
    starts = [i for i in starts if i + 1 not in spare]

    # Assign the anchors to topic starts in order, each confirmed by the title
    # printed within the next few paragraphs.
    plan, cursor, report = [], 0, []
    for anchor, want in todo:
        best = None
        for si in [i for i in starts if i >= cursor]:
            score = max((close(want, body[j]) for j in range(si, min(si + 4, len(body)))), default=0.0)
            if score >= 0.80 and (best is None or score > best[1]):
                best = (si, score)
            if best and best[1] > 0.97:
                break
        if best:
            plan.append((best[0], anchor))
            cursor = best[0] + 1
            report.append((anchor, want, best[0], round(best[1], 2)))
        else:
            report.append((anchor, want, None, 0.0))

    # The contents page itself, so every page can come back to it.
    head = next((i for i, t in enumerate(body) if t), 0)
    if 'contents' not in have:
        plan.append((head, 'contents'))

    for n, (idx, name) in enumerate(sorted(plan, reverse=True)):
        s, e, p = paras[idx]
        doc = doc[:s] + bookmark(p, name, FIRST_ID + n) + doc[e:]
    return doc, report, [r for r in report if r[2] is None]


def add_backlink(hdr, label=BACKLINK):
    """A small right-aligned link in a watermark header. No body reflow."""
    if 'w:anchor="contents"' in hdr:
        return hdr
    run = ('<w:hyperlink w:anchor="contents"><w:r><w:rPr>'
           '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
           f'<w:color w:val="{GREY}"/><w:sz w:val="16"/><w:szCs w:val="16"/>'
           '<w:u w:val="none"/></w:rPr>'
           f'<w:t xml:space="preserve">{label}</w:t></w:r></w:hyperlink>')
    m = PPR_RE.search(hdr)
    if m and '<w:jc' not in m.group(0):
        hdr = hdr[:m.end() - len('</w:pPr>')] + '<w:jc w:val="right"/>' + hdr[m.end() - len('</w:pPr>'):]
    return hdr.replace('</w:p>', run + '</w:p>', 1)


def fix(src, out, label=BACKLINK):
    src, out = Path(src), Path(out)
    if out.exists():
        out.unlink()
    zin = zipfile.ZipFile(src)
    names = zin.namelist()
    doc, report, missed = repair_anchors(zin.read('word/document.xml').decode('utf8'), label)

    headers = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zo:
        for n in ['[Content_Types].xml'] + [x for x in names if x != '[Content_Types].xml']:
            data = zin.read(n)
            if n == 'word/document.xml':
                data = doc.encode('utf8')
            elif re.fullmatch(r'word/header\d+\.xml', n) and b'<wp:anchor' in data:
                data = add_backlink(data.decode('utf8'), label).encode('utf8')
                headers += 1
            zo.writestr(n, data)
    return {'anchors': len(report), 'linked': len(report) - len(missed),
            'unmatched': [r[0] for r in missed], 'headers': headers, 'out': str(out)}


if __name__ == '__main__':
    a = sys.argv[1:]
    label = BACKLINK
    if '--label' in a:
        i = a.index('--label'); label = a[i + 1]; a = a[:i] + a[i + 2:]
    r = fix(a[0], a[1], label)
    print(r)
