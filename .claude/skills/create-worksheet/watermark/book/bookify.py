"""Give a finished .docx book a carpet on every page and a cover page in front.

    python3 bookify.py in.docx out.docx tile.png "SECONDARY 3 · O-LEVEL" \
        "E  MATH|REVISION" "the whole course, taught through worked examples"

Three things happen, in this order, and the order matters:

1. **Every opaque figure loses its white.**  A carpet sits behind the text and
   behind the pictures too, so an opaque figure prints as a white rectangle
   punched through the pattern.  Only the OUTER white goes — grey shading, and
   the white inside a glyph, stay.  JPEGs have no alpha, so they are re-encoded
   as PNG and their relationship targets rewritten.
2. **A header part is created and wired into every section.**  A book stitched
   out of other documents often has many sections and no headerReference at all;
   a section left unreferenced inherits the previous one's, which is not
   something to leave to chance.  The carpet is a page-relative anchor at
   behindDoc="1" — Word's own Design ▸ Watermark writes VML that LibreOffice
   draws as nothing.
3. **The cover goes in its own first section**, pointing at an EMPTY header, so
   the cover carries no carpet of its own beyond the one baked into the artwork.

The file it writes is a NEW file.  Never write over the book you were handed.
"""
import re, shutil, sys, zipfile
from pathlib import Path
from PIL import Image, ImageChops

sys.path.insert(0, str(Path(__file__).parent))
import cover as cover_mod

CM     = 360000
PW, PH = int(21.0 * CM), int(29.7 * CM)
REL    = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
HDR_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')


def anchor(rid, did, name):
    """A full-page picture behind the text, placed against the PAGE not the margin."""
    return (
      '<w:r><w:drawing><wp:anchor '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
      'distT="0" distB="0" distL="0" distR="0" simplePos="0" '
      f'relativeHeight="{did}" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">'
      '<wp:simplePos x="0" y="0"/>'
      '<wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH>'
      '<wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>'
      f'<wp:extent cx="{PW}" cy="{PH}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
      f'<wp:docPr id="{did}" name="{name}"/><wp:cNvGraphicFramePr/>'
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      f'<pic:pic><pic:nvPicPr><pic:cNvPr id="{did}" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr>'
      f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{PW}" cy="{PH}"/></a:xfrm>'
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
      '</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>')


def alpha_figures(X):
    """White out of every opaque figure, so the carpet runs through it."""
    media = X / 'word/media'
    renamed, done, kept = {}, 0, 0
    for p in sorted(media.iterdir()):
        if p.name.startswith('.') or p.name.startswith('wm-'): continue
        im     = Image.open(p)
        isjpeg = p.suffix.lower() in ('.jpg', '.jpeg')
        if not isjpeg and im.convert('RGBA').split()[3].getextrema()[0] < 255:
            kept += 1                                   # already transparent
            continue
        rgb    = im.convert('RGB')
        hi, lo = (236, 215) if isjpeg else (250, 234)   # JPEG ringing needs a wider cut
        r, g, b = rgb.split()
        white   = ImageChops.darker(ImageChops.darker(r, g), b)   # min channel: coloured ink stays
        a = white.point(lambda v: 0 if v >= hi else (255 if v <= lo else int(255 * (hi - v) / (hi - lo))))
        out = rgb.convert('RGBA'); out.putalpha(a)
        name = p.stem + '.png' if isjpeg else p.name
        if isjpeg: renamed[p.name] = name
        p.unlink()
        out.save(media / name, 'PNG', optimize=True)
        done += 1
    if renamed:
        rels = X / 'word/_rels/document.xml.rels'
        s = rels.read_text()
        for old, new in renamed.items():
            s = s.replace(f'media/{old}', f'media/{new}')
        rels.write_text(s)
    return done, kept, renamed


def bookify(src, out, tile, eyebrow, title_lines, subtitle, work=None):
    work = Path(work or (Path(out).parent / '_bookify'))
    shutil.rmtree(work, ignore_errors=True); work.mkdir(parents=True)
    X = work / 'x'; X.mkdir()
    with zipfile.ZipFile(src) as z: z.extractall(X)

    done, kept, renamed = alpha_figures(X)

    cover_png = work / 'cover.png'
    cover_mod.build(cover_png, eyebrow, title_lines, subtitle, carpet_png=tile)

    shutil.copy(tile,      X / 'word/media/wm-carpet.png')
    shutil.copy(cover_png, X / 'word/media/wm-cover.png')

    rels_p = X / 'word/_rels/document.xml.rels'
    rels   = rels_p.read_text()
    n      = max(int(i) for i in re.findall(r'Id="rId(\d+)"', rels)) + 1
    R_HDR, R_BLANK, R_COVER = f'rId{n}', f'rId{n+1}', f'rId{n+2}'
    rels_p.write_text(rels.replace('</Relationships>',
        f'<Relationship Id="{R_HDR}" Type="{REL}header" Target="header91.xml"/>'
        f'<Relationship Id="{R_BLANK}" Type="{REL}header" Target="header92.xml"/>'
        f'<Relationship Id="{R_COVER}" Type="{REL}image" Target="media/wm-cover.png"/>'
        '</Relationships>'))

    (X / 'word/_rels/header91.xml.rels').write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{REL}image" Target="media/wm-carpet.png"/></Relationships>')
    (X / 'word/header91.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:hdr {NS}><w:p><w:pPr><w:pStyle w:val="Header"/>'
        '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
        + anchor('rId1', 91, 'watermark') + '</w:p></w:hdr>')
    (X / 'word/header92.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:hdr {NS}><w:p><w:pPr><w:pStyle w:val="Header"/>'
        '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p></w:hdr>')

    ct = X / '[Content_Types].xml'
    ct.write_text(ct.read_text().replace('</Types>',
        f'<Override PartName="/word/header91.xml" ContentType="{HDR_CT}"/>'
        f'<Override PartName="/word/header92.xml" ContentType="{HDR_CT}"/></Types>'))

    doc_p  = X / 'word/document.xml'
    doc    = doc_p.read_text()
    doc, sections = re.subn(r'(<w:sectPr\b[^>]*>)',
        r'\1' + f'<w:headerReference w:type="default" r:id="{R_HDR}"/>', doc)
    doc = re.sub(r'(<w:body>)', r'\1' + (
        '<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:sectPr>'
        f'<w:headerReference w:type="default" r:id="{R_BLANK}"/>'
        '<w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" '
        'w:header="0" w:footer="0" w:gutter="0"/>'
        '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>'
        '</w:sectPr></w:pPr>' + anchor(R_COVER, 92, 'cover') + '</w:p>'), doc, count=1)
    doc_p.write_text(doc)

    Path(out).unlink(missing_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(X / '[Content_Types].xml', '[Content_Types].xml')   # must come first
        for p in sorted(X.rglob('*')):
            if p.is_file() and p.name != '[Content_Types].xml':
                z.write(p, str(p.relative_to(X)))
    return {'figures_alphaed': done, 'already_transparent': kept,
            'jpegs_reencoded': renamed, 'sections': sections, 'out': str(out)}


if __name__ == '__main__':
    src, out, tile, eyebrow, titles, subtitle = sys.argv[1:7]
    print(bookify(src, out, tile, eyebrow, titles.split('|'), subtitle))
