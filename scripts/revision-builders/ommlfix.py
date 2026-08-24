# -*- coding: utf-8 -*-
"""Merge adjacent single-character OMML runs.

pandoc emits one <m:r> per character, so "OAB" becomes three runs and both
Word and LibreOffice then space them as three separate italic variables:
`O A B` instead of `OAB`.  It bites hardest on point names and on
\\overrightarrow{OA}, where the arrow sits over a gap.

Consecutive <m:r> siblings whose run properties serialise identically are
concatenated into one.  Runs with differing properties are left alone, so an
upright operator next to an italic variable never gets folded into it.
"""
from docx.oxml.ns import qn
from lxml import etree

_M_R = qn('m:r')
_M_RPR = qn('m:rPr')
_M_T = qn('m:t')


def _sig(run):
    """Identity of a run's formatting — None when it carries no properties."""
    rPr = run.find(_M_RPR)
    return None if rPr is None else etree.tostring(rPr)


def merge_runs(root):
    """Merge in place, depth first; returns root for chaining."""
    for parent in root.iter():
        run, sig = None, False
        for child in list(parent):
            if child.tag != _M_R:
                run, sig = None, False
                continue
            this = _sig(child)
            # only simple text runs may merge: exactly one m:t and nothing else
            texts = child.findall(_M_T)
            simple = len(texts) == 1 and len(child) == len(texts) + (
                0 if child.find(_M_RPR) is None else 1)
            if run is not None and sig == this and simple:
                dst = run.find(_M_T)
                dst.text = (dst.text or '') + (texts[0].text or '')
                dst.set(qn('xml:space'), 'preserve')
                parent.remove(child)
                continue
            run, sig = (child, this) if simple else (None, False)
    return root
