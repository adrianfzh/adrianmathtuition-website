#!/usr/bin/env python3
"""Enforce the two typesetting rules on a finished self-study sheet.

Adrian, 31 Aug 2026, reading Klaire's sheet on screen:

  "and can 4/3 be like 4 in top numerator and 3 in bottom numerator, instead of
   side by side?"
  "and i can't backspace to bring the box up to below the solution?"

Both are authoring faults the writer should not make again — the rules are in
.claude/skills/self-study-sheet/SKILL.md — but sheets already filed in Dropbox
need fixing without re-authoring them, so this operates on the OOXML directly.

  1. Every fraction stacked.  Word draws <m:f> with <m:type m:val="lin"/> (or
     "skw") as 4/3 side by side. Removing the element restores the default
     stacked bar. Only the "simple" fractions ever get it, which is exactly the
     4/3 in front of pi r^3 that a student mis-copies.

  2. Boxes hug their content.  Two gaps, neither removable by hand in Word:
     - the space under "Solution:" is paragraph spacing, so there is no empty
       line to backspace over. Zero the label's space-after and the first
       in-cell paragraph's space-before.
     - a trailing EMPTY paragraph inside a table cell cannot be deleted at all
       (Word keeps the last paragraph of a cell), so it is dropped here.

Nothing else is touched: no text, no equations, no figures, no styles. Every
change is counted and reported, and the file is only written when something
actually changed.

    python3 repair-sheet.py in.docx [out.docx]      # out defaults to in-place
    python3 repair-sheet.py --check in.docx         # report only, never write
"""
import argparse
import re
import shutil
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
w = lambda t: f'{{{W}}}{t}'      # noqa: E731
m = lambda t: f'{{{M}}}{t}'      # noqa: E731


def register_all_namespaces(xml_bytes):
    """Re-register EVERY prefix the document declares, before serialising.

    ElementTree renames any namespace it was not told about to ns0, ns1, … The
    first version of this script registered only w: and m:, and the drawing
    namespace came back as ns0 — which silently unhooked all three figures from
    the sheet. Worse, the root's `mc:Ignorable="w14 wp14 …"` names prefixes as
    plain text: rename one and the attribute points at a prefix that no longer
    exists, and Word refuses to open the file at all.

    So: read the declarations out of the original bytes and keep them.
    """
    for prefix, uri in re.findall(rb'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"', xml_bytes):
        ET.register_namespace(prefix.decode(), uri.decode())


def restore_root_tag(before: bytes, after: bytes) -> bytes:
    """Put the ORIGINAL <w:document …> open tag back on the serialised output.

    ElementTree only emits a namespace declaration for a prefix something in the
    tree actually uses. Word declares about thirty on the root purely so
    `mc:Ignorable` can name them, and every unused one is dropped on save — which
    leaves mc:Ignorable pointing at prefixes that no longer exist, and Word then
    refuses the file outright.

    The root open tag is the only place this differs, and every edit here is
    strictly below it, so restoring that one tag is exact rather than a patch-up.

    It is a MERGE, not a swap: ElementTree also hoists to the root the
    namespaces that were declared on inner elements (`a` and `pic` on the
    drawing nodes), and a straight swap threw those away instead — which is the
    figures gone again by a different route. Keep the original tag and add back
    anything the serialiser introduced.

    If either tag can't be found we return the output untouched and let the
    verifier refuse the write.
    """
    def open_tag(b):
        start = b.find(b'<w:document')
        if start < 0:
            return None
        end = b.find(b'>', start)
        return (start, end + 1) if end > 0 else None

    a, b_ = open_tag(before), open_tag(after)
    if not a or not b_:
        return after
    orig_tag, new_tag = before[a[0]:a[1]], after[b_[0]:b_[1]]
    have = {p for p, _ in re.findall(rb'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"', orig_tag)}
    extra = b''.join(
        b' xmlns:%s="%s"' % (p, u)
        for p, u in re.findall(rb'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"', new_tag)
        if p not in have
    )
    merged = orig_tag[:-1].rstrip() + extra + b'>' if extra else orig_tag
    return after[:b_[0]] + merged + after[b_[1]:]


def check_prefixes_survived(before: bytes, after: bytes) -> list[str]:
    """Every prefix declared before must still be declared after — and every
    prefix named in mc:Ignorable must be one of them."""
    decl = lambda b: {p.decode() for p, _ in re.findall(rb'xmlns:([A-Za-z0-9_.-]+)="([^"]+)"', b)}  # noqa: E731
    lost = sorted(decl(before) - decl(after))
    problems = [f'namespace prefix lost: {p}' for p in lost]
    ign = re.search(rb'mc:Ignorable="([^"]*)"', after)
    if ign:
        have = decl(after)
        for p in ign.group(1).decode().split():
            if p not in have:
                problems.append(f'mc:Ignorable names an undeclared prefix: {p}')
    return problems


def para_text(p):
    return ''.join(t.text or '' for t in p.iter() if t.tag in (w('t'), m('t')))


def has_drawing(p):
    return p.find('.//' + w('drawing')) is not None


def set_spacing(p, **attrs):
    """Set w:spacing attributes on a paragraph, creating pPr/spacing as needed.
    Returns True when something changed."""
    pPr = p.find(w('pPr'))
    if pPr is None:
        pPr = ET.SubElement(p, w('pPr'))
        p.remove(pPr)
        p.insert(0, pPr)          # pPr must be the FIRST child of w:p
    sp = pPr.find(w('spacing'))
    if sp is None:
        sp = ET.Element(w('spacing'))
        pPr.insert(0, sp)
    changed = False
    for k, v in attrs.items():
        if sp.get(w(k)) != v:
            sp.set(w(k), v)
            changed = True
    return changed


def repair(xml_bytes):
    root = ET.fromstring(xml_bytes)
    body = root.find(w('body'))
    counts = {'linear_fractions': 0, 'trailing_empty': 0, 'gap_above_box': 0}

    # ── 1. every fraction stacked ────────────────────────────────────────────
    for f in root.iter(m('f')):
        fPr = f.find(m('fPr'))
        if fPr is None:
            continue
        ty = fPr.find(m('type'))
        if ty is not None and ty.get(m('val')) in ('lin', 'skw'):
            fPr.remove(ty)
            counts['linear_fractions'] += 1

    if body is None:
        return root, counts

    # ── 2a. no trailing empty paragraph inside a table cell ──────────────────
    for tc in root.iter(w('tc')):
        paras = tc.findall(w('p'))
        # Word requires a cell to END in a paragraph, so stop at one.
        while len(paras) > 1 and not para_text(paras[-1]).strip() and not has_drawing(paras[-1]):
            tc.remove(paras[-1])
            paras.pop()
            counts['trailing_empty'] += 1

    # ── 2b. the box starts where its label ends ──────────────────────────────
    kids = list(body)
    for i, el in enumerate(kids):
        if el.tag != w('tbl') or i == 0:
            continue
        prev = kids[i - 1]
        if prev.tag != w('p'):
            continue
        label = para_text(prev).strip()
        # Only a LABEL immediately above a box — never a paragraph of prose,
        # whose spacing is doing real work.
        if not label or len(label) > 40:
            continue
        touched = set_spacing(prev, after='0', line='240', lineRule='auto')
        first = el.find(w('tr') + '/' + w('tc') + '/' + w('p'))
        if first is not None:
            touched |= set_spacing(first, before='0')
        if touched:
            counts['gap_above_box'] += 1

    return root, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dest', nargs='?')
    ap.add_argument('--check', action='store_true', help='report only, never write')
    args = ap.parse_args()

    src = Path(args.src)
    if not src.is_file():
        sys.exit(f'no such file: {src}')

    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        parts = {n: z.read(n) for n in names}

    original = parts['word/document.xml']
    register_all_namespaces(original)
    root, counts = repair(original)
    total = sum(counts.values())
    for k, v in counts.items():
        print(f'  {k:20s} {v}')
    if args.check:
        print('check only — nothing written')
        return
    if not total:
        print('nothing to repair')
        return

    dest = Path(args.dest) if args.dest else src
    if dest == src:
        backup = src.with_suffix(src.suffix + '.bak')
        shutil.copy2(src, backup)
        print(f'  backup              {backup.name}')

    rewritten = restore_root_tag(original, ET.tostring(root, encoding='UTF-8', xml_declaration=True))

    # A repair that quietly unhooks the figures, or writes a file Word will not
    # open, is worse than the gap it closed. Refuse to write on either.
    problems = check_prefixes_survived(original, rewritten)
    for tag, label in ((b'<a:blip', 'figures'), (b'<m:oMath', 'equations'), (b'<w:tbl>', 'boxes')):
        was, now = original.count(tag), rewritten.count(tag)
        if now != was:
            problems.append(f'{label}: {was} before, {now} after')
    if problems:
        print('REFUSING TO WRITE — the repair changed something it must not:')
        for p in problems:
            print(f'  ✗ {p}')
        sys.exit(1)

    parts['word/document.xml'] = rewritten
    # Rewrite in the ORIGINAL entry order — Word is tolerant, but [Content_Types]
    # coming first is the one thing every reader expects.
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, parts[n])
    print(f'wrote {dest}')


if __name__ == '__main__':
    main()
