"""Answer-key pages in the house (Set 3) geometry.

Rows are typeset by pdflatex with Times text + Times math (mathptmx), so
fractions, indices, surds, matrices and vectors render as real mathematics.
The heading block (bold title, italic subtitle, rule) is drawn afterwards
with reportlab at the exact house coordinates and overlaid on every page.
"""
import os, shutil, subprocess, tempfile
import pikepdf
from reportlab.pdfgen import canvas

W, H = 595.32, 841.92
RULE_FROM_TOP = 92.0
RULE_Y = H - RULE_FROM_TOP
X0, X_ANS, RIGHT = 60.0, 122.0, 540.28
BOLD_DY, BOLD_SZ = 30.0, 15.5
ITAL_DY, ITAL_SZ = 11.0, 10.0
ROW_SZ, LEAD = 10.3, 19.1
FIRST_BASE_FROM_TOP = RULE_FROM_TOP + 22.0        # 114.0 pt, as in Set 3
BOTTOM = 60.0
LABEL_W = X_ANS - X0                              # 62.0
RIGHT_MARGIN = W - RIGHT                          # 55.04
TOP_MARGIN = FIRST_BASE_FROM_TOP - LEAD           # \topskip puts baseline at 114
TEXT_HEIGHT = H - TOP_MARGIN - BOTTOM

TEMPLATE = r"""
\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage{mathptmx}
\usepackage{amsmath}
\usepackage[paperwidth=@Wbp,paperheight=@Hbp,left=@LEFTbp,right=@RIGHTbp,
            top=@TOPbp,textheight=@THbp]{geometry}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\setlength{\topskip}{@LEADbp}
% Rows sit on a @LEAD bp baseline grid; tall rows (\dfrac, pmatrix) fall back
% to \lineskip, so give that enough clearance to stop fractions colliding.
\setlength{\lineskip}{8.5bp}
\setlength{\lineskiplimit}{3bp}
\clubpenalty=10000
\widowpenalty=10000
\newcommand{\answerrow}[2]{%
  \par\hangindent=@LABELWbp\hangafter=1\noindent
  \makebox[@LABELWbp][l]{\bfseries #1}#2\par}
\begin{document}
\fontsize{@SZbp}{@LEADbp}\selectfont
\raggedright
@BODY
\end{document}
"""


def _rows_tex(rows):
    return "\n".join(r"\answerrow{%s}{%s}" % (label, ans) for label, ans in rows)


def _latex_pages(rows, out_pdf):
    """Typeset the answer rows; returns the path to a PDF of body-only pages."""
    tex = TEMPLATE
    for key, val in (
        ("@LABELW", f"{LABEL_W:.2f}"),             # longest tokens first
        ("@RIGHT", f"{RIGHT_MARGIN:.2f}"),
        ("@LEFT", f"{X0:.2f}"),
        ("@LEAD", f"{LEAD:.2f}"),
        ("@TOP", f"{TOP_MARGIN:.2f}"),
        ("@TH", f"{TEXT_HEIGHT:.2f}"),
        ("@SZ", f"{ROW_SZ:.2f}"),
        ("@W", f"{W:.2f}"),
        ("@H", f"{H:.2f}"),
        ("@BODY", _rows_tex(rows)),
    ):
        tex = tex.replace(key, val)

    work = tempfile.mkdtemp(prefix="key_")
    src = os.path.join(work, "key.tex")
    with open(src, "w") as f:
        f.write(tex)
    proc = subprocess.run(
        ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "key.tex"],
        cwd=work, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = "\n".join(proc.stdout.splitlines()[-40:])
        raise RuntimeError(f"pdflatex failed:\n{tail}")
    shutil.copy(os.path.join(work, "key.pdf"), out_pdf)
    shutil.rmtree(work, ignore_errors=True)
    return out_pdf


def _heading_overlay(path, n_pages, paper_no, subtitle):
    c = canvas.Canvas(path, pagesize=(W, H))
    for _ in range(n_pages):
        c.setFillGray(0); c.setStrokeGray(0)
        c.setFont("Times-Bold", BOLD_SZ)
        c.drawString(X0, RULE_Y + BOLD_DY, f"Answers  -  Paper {paper_no}")
        c.setFont("Times-Italic", ITAL_SZ)
        c.drawString(X0, RULE_Y + ITAL_DY, subtitle)
        c.setLineWidth(0.9); c.line(X0, RULE_Y, RIGHT, RULE_Y)
        c.showPage()
    c.save()


def build(path, blocks, subtitle):
    out = pikepdf.Pdf.new()
    for i, (paper_no, rows) in enumerate(blocks):
        body = _latex_pages(rows, f"_key_body_{i}.pdf")
        doc = pikepdf.Pdf.open(body)
        n = len(doc.pages)
        ov_path = f"_key_head_{i}.pdf"
        _heading_overlay(ov_path, n, paper_no, subtitle)
        ov = pikepdf.Pdf.open(ov_path)
        for k, page in enumerate(doc.pages):
            page.add_overlay(ov.pages[k])
            out.pages.append(page)
        os.remove(body); os.remove(ov_path)
    out.save(path)
    return len(out.pages)


# ------------------------------------------------------------ title space --
# House default since EM Set 4: the title block is NOT stamped. Adrian adds his
# own titles. Reserve the space and leave it blank.
Q1_TARGET = 2.95 * 28.3465     # topmost ink of question 1, from the page top


def shift_for_title(pdf, doc_path, page_index):
    """Move a first page's body down so question 1 lands at 2.95 cm.

    Measure first, then shift by the difference - do not guess a vspace.
    Returns the shift applied, in points (0 if the page already clears).
    """
    import pikepdf
    from pdf_surgery import ink_bands, qQ_balanced
    page = pdf.pages[page_index]
    assert qQ_balanced(page), "wrap in a form XObject instead"
    bands = ink_bands(doc_path, page_index + 1)
    top_ink = bands[0][0] if bands else 0.0
    dy = Q1_TARGET - top_ink
    if dy <= 0:
        return 0.0
    c = page.Contents
    old = (b"\n".join(bytes(s.read_bytes()) for s in c)
           if isinstance(c, pikepdf.Array) else bytes(c.read_bytes()))
    page.Contents = pdf.make_stream(b"q 1 0 0 1 0 -%.4f cm\n" % dy + old + b"\nQ\n")
    return dy


# Legacy - only if Adrian explicitly asks for a printed title block.
TITLE_L1_DY, TITLE_L2_DY, TITLE_SIZE = 32.0, 51.0, 13.5


def title_overlay(path, title, paper_no, W=595.32, H=841.92):
    """Stamp-on title block. Overlay AFTER shifting the body down."""
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setFillGray(0)
    c.setFont("Times-Bold", TITLE_SIZE)
    c.drawCentredString(W / 2, H - TITLE_L1_DY, title)
    c.drawCentredString(W / 2, H - TITLE_L2_DY, f"Paper {paper_no}")
    c.showPage()
    c.save()
