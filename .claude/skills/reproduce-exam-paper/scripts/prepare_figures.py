#!/usr/bin/env python3
r"""
Prepare exam-paper diagrams for typesetting.

Two subcommands:

  measure  — find the true printed size of each diagram by template-matching the
             question-bank crop against the original scanned PDF page. Tells you
             what \includegraphics width to use so the reproduction matches the
             original exactly.

  prep     — clean, deskew, de-frame and trim each diagram, write it to an output
             directory, and emit widths.json mapping figure name -> width in cm.

Job spec (JSON) — a list of figures:

[
  {"name": "q2_quad",
   "src":  {"type": "db",  "path": "img/4b6fd76d-....png"},
   "page": 1,                       # page in the original PDF (for measure)
   "deskew": false,                 # only for diagrams with straight reference lines
   "strip_frame": false,            # only when the crop has a border the original lacks
   "search": [600, 1000, 100, 1200] # r0,r1,c0,c1 at 150 DPI, generous window
  },
  {"name": "p2q8_grid",
   "src":  {"type": "pdf", "page": 32, "box": [500, 3050, 0, 999999]},  # 300 DPI px
   "deskew": true}
]

`src.type` is "db" for an existing crop from the question bank, "pdf" to re-crop
straight from the original scan (use this when the bank's crop is low-resolution,
has a border the original doesn't have, or is missing labels).

Usage:
  python3 prepare_figures.py measure --pdf ORIGINAL.pdf --jobs jobs.json
  python3 prepare_figures.py prep    --pdf ORIGINAL.pdf --jobs jobs.json --out fig/
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

DPI_CROP = 300           # question-bank crops are rendered at 300 DPI
PX150 = 150 / 2.54       # pixels per cm at 150 DPI


# ---------------------------------------------------------------- rendering --
_page_cache = {}


def render_page(pdf, page, dpi, tmpdir):
    key = (pdf, page, dpi)
    if key in _page_cache:
        return Image.open(_page_cache[key])
    prefix = os.path.join(tmpdir, "pg%d_%d" % (page, dpi))
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-f", str(page),
                    "-l", str(page), pdf, prefix],
                   check=True, capture_output=True)
    hit = [f for f in os.listdir(tmpdir)
           if f.startswith(os.path.basename(prefix) + "-")]
    path = os.path.join(tmpdir, hit[0])
    _page_cache[key] = path
    return Image.open(path)


# ------------------------------------------------------------ image cleanup --
def clean(im):
    """Flatten scanner grey to white, keep genuine mid-grey shading, despeckle."""
    a = np.asarray(im.convert("L")).astype(np.float32)
    white = max(np.percentile(a, 92), 150.0)
    black = 45.0
    a = np.clip((a - black) / (white - black) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(a).filter(ImageFilter.MedianFilter(3))


def deskew(im, limit=2.0, step=0.1):
    """Rotate to maximise ink-profile variance. Only meaningful for diagrams with
    straight horizontal/vertical reference lines (axes, grids, frames, baselines).
    Applying it to freehand triangles, circles or photographs invents a rotation
    that was never there, so gate it per figure."""
    d = (np.asarray(im.convert("L")) < 170).astype(np.float32)
    if d.sum() < 50:
        return im, 0.0
    best_score, best_angle = None, 0.0
    src = Image.fromarray((d * 255).astype(np.uint8))
    for ang in np.arange(-limit, limit + 1e-9, step):
        r = np.asarray(src.rotate(ang, resample=Image.BILINEAR, fillcolor=0))
        r = (r > 120).astype(np.float32)
        score = r.sum(1).var() + r.sum(0).var()
        if best_score is None or score > best_score:
            best_score, best_angle = score, ang
    if abs(best_angle) < 0.12:
        return im, 0.0
    return im.rotate(best_angle, resample=Image.BICUBIC, fillcolor=255), best_angle


def strip_frame(im):
    """Drop a rectangular border if the crop has one the original doesn't.

    Opt-in per figure, never a default: plenty of diagrams have a legitimate
    outer rectangle that is part of the mathematics — a universal-set box in a
    Venn diagram, a plot frame, a table border. Stripping those silently
    changes the question."""
    d = np.asarray(im.convert("L")) < 150
    h, w = d.shape
    top, bot, left, right = 0, h - 1, 0, w - 1
    for i in range(int(h * 0.12)):
        if d[i].mean() > 0.8:
            top = i + 1
    for i in range(h - 1, int(h * 0.88), -1):
        if d[i].mean() > 0.8:
            bot = i - 1
    for j in range(int(w * 0.12)):
        if d[:, j].mean() > 0.8:
            left = j + 1
    for j in range(w - 1, int(w * 0.88), -1):
        if d[:, j].mean() > 0.8:
            right = j - 1
    changed = (top, left, bot, right) != (0, 0, h - 1, w - 1)
    return im.crop((left, top, right + 1, bot + 1)), changed


def trim(im, pad=5):
    d = np.asarray(im.convert("L")) < 180
    rs = np.where(d.sum(1) > 1)[0]
    cs = np.where(d.sum(0) > 1)[0]
    return im.crop((max(cs.min() - pad, 0), max(rs.min() - pad, 0),
                    min(cs.max() + pad + 1, im.size[0]),
                    min(rs.max() + pad + 1, im.size[1])))


# ------------------------------------------------------------ size matching --
def match_scale(crop_path, page_img, window):
    """Slide the crop over the page at many scales; return (score, width_cm)."""
    from scipy.signal import fftconvolve
    r0, r1, c0, c1 = window
    P = (np.asarray(page_img.convert("L")) < 180).astype(np.float32)
    P = P[r0:r1, c0:min(c1, P.shape[1])]
    C = (np.asarray(Image.open(crop_path).convert("L")) < 180).astype(np.float32)
    rs = np.where(C.sum(1) > 0)[0]
    cs = np.where(C.sum(0) > 0)[0]
    C = C[rs.min():rs.max() + 1, cs.min():cs.max() + 1]
    ink_w = C.shape[1]
    full_w = Image.open(crop_path).size[0]
    best = None
    for s in np.arange(0.28, 1.15, 0.01):
        w, h = int(round(C.shape[1] * s)), int(round(C.shape[0] * s))
        if w < 20 or h < 20 or w > P.shape[1] or h > P.shape[0]:
            continue
        T = np.asarray(Image.fromarray((C * 255).astype(np.uint8))
                       .resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.
        T = (T > 0.35).astype(np.float32)
        num = fftconvolve(P, T[::-1, ::-1], mode="valid")
        loc = fftconvolve(P, np.ones_like(T)[::-1, ::-1], mode="valid")
        score = (2 * num / (T.sum() + loc + 1e-6)).max()
        if best is None or score > best[0]:
            best = (score, s, w)
    score, s, w = best
    return score, s, full_w / ink_w * (w / PX150)


# ------------------------------------------------------------------- driver --
def cmd_measure(args):
    jobs = json.load(open(args.jobs))
    tmp = args.tmp
    os.makedirs(tmp, exist_ok=True)
    print("%-14s %-6s %-6s %-9s %s" % ("figure", "match", "scale", "width_cm", "verdict"))
    for j in jobs:
        if j["src"]["type"] != "db":
            print("%-14s (re-cropped from PDF — size comes from the crop itself)" % j["name"])
            continue
        page = render_page(args.pdf, j["page"], 150, tmp)
        score, s, w = match_scale(j["src"]["path"], page, j["search"])
        naive = Image.open(j["src"]["path"]).size[0] / DPI_CROP * 2.54
        ok = "trust" if score > 0.80 else "LOW — verify or re-crop from PDF"
        print("%-14s %-6.3f %-6.2f %-9.2f %s   (px/300dpi = %.2f)"
              % (j["name"], score, s, w, ok, naive))


def cmd_prep(args):
    jobs = json.load(open(args.jobs))
    os.makedirs(args.out, exist_ok=True)
    tmp = args.tmp
    os.makedirs(tmp, exist_ok=True)
    widths = {}
    for j in jobs:
        src = j["src"]
        if src["type"] == "db":
            im = Image.open(src["path"])
        else:
            page = render_page(args.pdf, src["page"], 300, tmp)
            r0, r1, c0, c1 = src["box"]
            im = page.crop((max(c0, 0), r0, min(c1, page.size[0]), r1))
        im = clean(im)
        ang = 0.0
        if j.get("deskew"):
            im, ang = deskew(im)
        framed = False
        if j.get("strip_frame"):
            im, framed = strip_frame(im)
        im = trim(im)
        out = os.path.join(args.out, j["name"] + ".png")
        im.save(out)
        w = im.size[0] / DPI_CROP * 2.54
        h = im.size[1] / DPI_CROP * 2.54
        widths[j["name"]] = round(w, 2)
        print("%-14s %5.2f x %5.2f cm  ar=%.2f  skew=%+.1f  frame_removed=%s"
              % (j["name"], w, h, w / h, ang, framed))
    json.dump(widths, open(os.path.join(args.out, "widths.json"), "w"), indent=1)
    print("\nwrote %s" % os.path.join(args.out, "widths.json"))


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("measure", "prep"):
        sp = sub.add_parser(name)
        sp.add_argument("--pdf", required=True)
        sp.add_argument("--jobs", required=True)
        sp.add_argument("--tmp", default="_pages")
        if name == "prep":
            sp.add_argument("--out", default="fig")
    args = p.parse_args()
    (cmd_measure if args.cmd == "measure" else cmd_prep)(args)


if __name__ == "__main__":
    main()
