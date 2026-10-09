#!/usr/bin/env python3
"""
Verify a typeset exam paper numerically.

Image previews are not always available, and "it compiled" is not the same as
"it looks right". These checks catch the failures that actually happen:
labels drifting onto separate lines, rules coming out the wrong length,
figures rendering at the wrong size, and content silently overflowing a page.

  python3 verify_output.py paper1.pdf --log paper1.log
  python3 verify_output.py paper1.pdf --same-line 5 10 "(a)"      # tokens on one line?
  python3 verify_output.py paper1.pdf --rules 15 --min-cm 3       # measure horizontal rules
  python3 verify_output.py paper1.pdf --figures                   # measure graphics blocks
"""
import argparse, re, subprocess, sys, os
import numpy as np
from PIL import Image


def page_count(pdf):
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    return int(re.search(r"Pages:\s+(\d+)", out).group(1))


def check_log(log):
    if not os.path.exists(log):
        print("no log file at %s" % log)
        return
    txt = open(log, errors="ignore").read()
    errs = re.findall(r"^!.*", txt, re.M)
    vbox = len(re.findall(r"Overfull \\vbox", txt))
    hbox = [float(m) for m in re.findall(r"Overfull \\hbox \(([0-9.]+)pt", txt)]
    print("errors: %d" % len(errs))
    for e in errs[:10]:
        print("   " + e)
    print("overfull vbox (content past the page bottom): %d  <- must be 0" % vbox)
    if hbox:
        print("overfull hbox: %d, worst %.1fpt (%.2f mm)"
              % (len(hbox), max(hbox), max(hbox) / 72 * 25.4))
        if max(hbox) > 12:
            print("   ^ over ~4mm; something is genuinely too wide, not just a rounding nudge")
    else:
        print("overfull hbox: 0")


def words_with_pos(pdf, page):
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox", pdf, "-"],
                         capture_output=True, text=True).stdout
    res = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out):
        res.append((float(m.group(1)), float(m.group(2)), m.group(5)))
    return res


def check_same_line(pdf, page, tokens):
    """Confirm a run of labels shares a baseline, e.g. 10 (a) Write.

    Groups the page into text lines first, then looks for a line containing all
    the tokens in left-to-right order. Searching for each token independently
    would match the first "(a)" anywhere on the page, which is usually a
    different question."""
    ws = words_with_pos(pdf, page)
    lines = {}
    for x, y, t in ws:
        key = round(y / 2.0)
        lines.setdefault(key, []).append((x, y, t))
    for key in sorted(lines):
        row = sorted(lines[key])
        texts = [t for _, _, t in row]
        pos = 0
        hits = []
        for i, t in enumerate(texts):
            if pos < len(tokens) and t == tokens[pos]:
                hits.append(row[i])
                pos += 1
        if pos == len(tokens):
            ys = [y for _, y, _ in hits]
            print("page %d  %s  ->  SAME LINE (y spread %.2f pt)"
                  % (page, " ".join(tokens), max(ys) - min(ys)))
            for x, y, t in hits:
                print("     %-8s x=%.1f y=%.1f" % (t, x, y))
            return
    print("page %d  %s  ->  NOT FOUND on any single line" % (page, " ".join(tokens)))


def render(pdf, page, dpi=300, tmp="_verify"):
    os.makedirs(tmp, exist_ok=True)
    pre = os.path.join(tmp, "v%d" % page)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-f", str(page), "-l", str(page), pdf, pre],
                   check=True, capture_output=True)
    f = [x for x in os.listdir(tmp) if x.startswith("v%d-" % page)][0]
    return np.asarray(Image.open(os.path.join(tmp, f)).convert("L")), dpi


def check_rules(pdf, page, min_cm):
    """Longest contiguous horizontal dark runs — measures printed rule lengths."""
    a, dpi = render(pdf, page)
    d = a < 150
    seen = []
    for i in range(d.shape[0]):
        row = d[i]
        run = 0
        start = 0
        for j, v in enumerate(row):
            if v:
                if run == 0:
                    start = j
                run += 1
            else:
                if run / dpi * 2.54 >= min_cm:
                    seen.append((i / dpi * 2.54, run / dpi * 2.54, start / dpi * 2.54))
                run = 0
        if run / dpi * 2.54 >= min_cm:
            seen.append((i / dpi * 2.54, run / dpi * 2.54, start / dpi * 2.54))
    merged = []
    for y, w, x in seen:
        if merged and abs(merged[-1][0] - y) < 0.1 and abs(merged[-1][1] - w) < 0.05:
            continue
        merged.append((y, w, x))
    print("page %d — horizontal rules at least %.1f cm long:" % (page, min_cm))
    for y, w, x in merged:
        print("   %.3f cm wide,  %.2f cm from top,  left edge %.2f cm" % (w, y, x))


def check_figures(pdf, page):
    """Bounding box of any large graphic block on the page."""
    a, dpi = render(pdf, page, 150)
    d = a < 190
    rs = np.where(d.sum(1) > 40)[0]
    if len(rs) < 120:
        print("page %d: no large graphic" % page)
        return
    sub = d[rs.min():rs.max() + 1]
    cs = np.where(sub.sum(0) > 40)[0]
    print("page %d: graphic block %.2f x %.2f cm, top edge %.2f cm from page top"
          % (page, (cs.max() - cs.min() + 1) / dpi * 2.54,
             (rs.max() - rs.min() + 1) / dpi * 2.54, rs.min() / dpi * 2.54))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("pdf")
    p.add_argument("--log")
    p.add_argument("--same-line", nargs="+", metavar=("PAGE", "TOKEN"))
    p.add_argument("--rules", type=int)
    p.add_argument("--min-cm", type=float, default=3.0)
    p.add_argument("--figures", nargs="*", type=int)
    a = p.parse_args()

    print("%s — %d pages" % (a.pdf, page_count(a.pdf)))
    if a.log:
        check_log(a.log)
    if a.same_line:
        check_same_line(a.pdf, int(a.same_line[0]), a.same_line[1:])
    if a.rules:
        check_rules(a.pdf, a.rules, a.min_cm)
    if a.figures is not None:
        pages = a.figures or range(1, page_count(a.pdf) + 1)
        for pg in pages:
            check_figures(a.pdf, pg)


if __name__ == "__main__":
    main()
