---
name: reproduce-exam-paper
description: Rebuild a scanned exam paper as a clean, professionally typeset PDF that matches the original page-for-page, with an answers-only key at the end of each paper. Use this whenever Adrian uploads a scanned or photocopied prelim/exam PDF and asks for a "clean copy", "professional copy", "same format", "retype this", "make this look proper", or a printable version of a paper already in the question bank — and also when he asks to reproduce, rebuild, or re-typeset any paper whose questions are already in Supabase. Prefer this over create-worksheet, which makes practice sheets rather than reproducing an actual exam paper with its working space, answer lines, marks and page structure intact.
---

# Reproduce an exam paper

Rebuild a scanned paper as typeset LaTeX so the maths is real type rather than a
photocopy, while the page layout stays faithful to the original: same question
order, same working space, same answer lines, same pagination.

The questions come from the Supabase bank (project `nempslbewxtlikfzachi`); the
uploaded scan is the layout reference and the source of truth for wording.

## Before starting, confirm with Adrian

1. Which paper(s) — school, year, level, P1/P2.
2. Header/footer: usually dropped. Titles: usually dropped too.
3. Answer key: answers only, or worked solutions.

## Step 1 — pull the questions

Check the paper is in the bank and the counts look right:

```sql
SELECT paper, count(*), sum(total_marks) FROM questions
WHERE school='...' AND year=... AND level='...' AND deleted_at IS NULL
GROUP BY paper;
```

Then pull in batches of about 8 questions (whole rows are large):

```sql
SELECT jsonb_agg(t ORDER BY (t->>'n')::int) FROM (
  SELECT jsonb_build_object('n',question_number,'qt',question_text,'parts',parts,
                            'a',answer,'m',total_marks,'img',image_url) t
  FROM questions WHERE school='...' AND year=... AND level='...' AND paper='1'
    AND deleted_at IS NULL AND question_number::int BETWEEN 1 AND 8) s;
```

Use the `execute_sql` MCP tool. The REST API with the anon key returns an empty
array — RLS blocks it.

**Read every question against the scan.** The bank has transcription errors, and
this task surfaces them because the scan is right there. Cross-check numbers in
the stem against the stored solution: when a stem says one value and its own
worked solution uses another, the stem is wrong. Verify answers by working them
yourself rather than trusting the stored `answer` field. Use the scan's wording,
and report every discrepancy at the end so the bank can be corrected — that
list is often the most valuable output of the whole job.

## Step 2 — figures

Diagrams stay as images; everything else becomes type. The bank's crops are
rendered at 300 DPI, so nominal size in cm is `pixels / 300 × 2.54` — but crops
get resampled, padded, framed or clipped, so confirm rather than assume.

```bash
python3 scripts/prepare_figures.py measure --pdf ORIGINAL.pdf --jobs jobs.json
```

This template-matches each crop against its page in the original scan and reports
the true printed width. A match score above ~0.80 is trustworthy. Below that,
re-crop from the scan instead (`"src": {"type": "pdf", ...}`) — which is also the
fix when a crop is low-resolution, carries a border the original doesn't have, or
has cut off labels the original shows.

```bash
python3 scripts/prepare_figures.py prep --pdf ORIGINAL.pdf --jobs jobs.json --out fig/
```

Cleans scanner grey to white while keeping genuine shading, optionally deskews,
strips borders, trims, and writes `widths.json` for the `\Fig` calls.

Set `"deskew": true` only for diagrams with straight reference lines — axes,
grids, frames, ground lines, rows of dots. Freehand triangles, circles and
photographs have no true horizontal, so deskewing them invents a tilt that was
never in the original. Getting this wrong is worse than leaving the slant.

Sizes are worth care. A diagram reproduced 30% too large is the clearest tell
that a paper was rebuilt rather than reproduced, and for graph grids the scale is
mathematically load-bearing — a student plots on it.

## Step 3 — typeset

Copy `assets/preamble.tex` into the working directory, then write one body file
per paper plus one answer-key file, and a two-line wrapper:

```latex
\input{preamble}
\begin{document}
\input{p1_body}
\input{p1_ans}
\end{document}
```

Read `references/layout-macros.md` before writing any body content — it covers
every macro, the merged-label rules, working space, and the `\leftskip` grouping
trap that causes most overfull warnings.

Compile with `pdflatex` (twice is unnecessary; there are no references).

**Match the original's pagination.** Work out which questions sit on which page
in the scan and put `\newpage` at those boundaries. Combined with `\WS{n}`
stretch glue, each page then fills to the bottom margin exactly as the original
does. This is what makes the reproduction feel like the same paper rather than a
reflow of the same questions.

**Follow the scan, not your instincts.** Where the paper does something odd — a
number sharing a line with two nested labels, a construction line floating in
white space, an answer blank split into five slots — reproduce it. The one thing
worth silently fixing is a scanning artefact, never a layout choice.

## Step 4 — answer key

Answers only by default, on a fresh page at the end of each paper, in house
style: `#5A80B8` heading, question number, then parts. Concise final answers;
for "show that" parts give the key step rather than either "Shown" or a full
solution. Macros are in `references/layout-macros.md`.

## Step 5 — verify before reporting done

```bash
python3 scripts/verify_output.py paper1.pdf --log paper1.log
python3 scripts/verify_output.py paper1.pdf --same-line 5 10 "(a)" Write
python3 scripts/verify_output.py paper1.pdf --rules 15 --min-cm 3
python3 scripts/verify_output.py paper1.pdf --figures
```

Check in order:

- zero LaTeX errors, zero overfull `\vbox` (content past the bottom margin)
- overfull `\hbox` all under ~4 mm; 29.87 / 59.75 / 89.63 pt means the grouping bug
- merged labels genuinely share a baseline
- any length the student measures is exact
- page count matches the original's question pages, plus the key
- marks total per paper is sane (80–100 for O-Level, 100 for JC)

Do not rely on being able to see a rendered page. Image previews fail often
enough that a workflow depending on them will stall, and "it compiled" says
nothing about whether a label drifted onto its own line. These checks read the
actual glyph coordinates and pixel measurements out of the finished PDF, so they
hold either way. When you do have previews, use both.

## Step 6 — deliver

Copy the PDFs to `/mnt/user-data/outputs/` (Cowork) or `~/Desktop` (local) named
`<SCHOOL> <YEAR> <LEVEL> Paper N.pdf`, present them, and report:

- pages and marks per paper
- what was preserved and what was deliberately dropped
- figure sizes corrected, deskew angles applied, figures re-cropped and why
- **every bank discrepancy found**, with the correction, offered as a DB update

## Environment

`pdflatex` with `mathptmx`, `pdftoppm`, `pdftotext`, `pdfinfo`, Pillow, numpy,
scipy. All present in Cowork and on Adrian's Mac.
