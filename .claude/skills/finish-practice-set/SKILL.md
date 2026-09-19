---
name: finish-practice-set
description: Turn a compiled past-paper PDF into a student-ready practice set — strip the source school's header/footer and site watermark, put Adrian's title on page 1 with proper breathing space, and append an answer key built from the Supabase question bank. Trigger on "remove the header and footer", "add the answer key", "finish practice set N", "do the same for promo set N", "prep set 4", or any request naming a file under Dropbox/1 REVISION LESSONS/Prelim Practice Sets. NOT for authoring a paper from scratch — that is prelim-paper (assembles from the QB) or create-worksheet (writes a worksheet).
---

# Finish a practice set

The Prelim/Promo practice sets live in
`~/Dropbox/1 REVISION LESSONS/Prelim Practice Sets/`. Each starts life as a
page-range lifted out of a KiasuExamPaper compilation, so it arrives carrying the
originating school's running head, its footer, the `www.KiasuExamPaper.com`
watermark, the compilation's page numbers — and no answers. This skill finishes it.

**Reference sheet: `2026 JC Promo Practice Set 1 (CJC 2025).pdf`.** Every layout
decision below was measured off it. When something is ambiguous, open Set 1 and
match it.

## What the finished file looks like

| | |
|---|---|
| Page 1 | source header gone, replaced by `JC1 H2 Math Promo Practice Set N` — Times Bold 18.37pt, centred, baseline y=52; body nudged down so question 1 starts at y=96 |
| Pages 2..n | untouched, **including the source page numbers at the top** — Set 1 keeps them, so keep them |
| Every page | school footer + `www.KiasuExamPaper.com` + compilation page number removed |
| Last page | answer key — `H2 Mathematics` in #1F4E79 Times Bold 12pt, italic `Promotional Examination — Answer Key`, rule, then one line per question at 9.6pt |

`[Turn over` markers sit in the body, not the footer band. Leave them; mention
them once and let Adrian decide.

## 1. Probe the paper

Never guess the bands — each school lays out differently. Sets 2 and 3 differed
in page size, footer content, and whether page 1 even had a header.

```bash
python3 .claude/skills/finish-practice-set/scripts/probe_set.py "<paper>.pdf"
```

It prints suggested `footer_top` / `header_bot` / `content_top`, the lowest real
content on any page (so the footer band cannot clip a diagram), any line art
hiding in the header band, and any highlights baked into the pages. Sanity-check
the numbers against its span dump before using them. If it says **SCANNED**, the
span dump is useless (it sees only the compiler's overlay) — read the pixel
bands it prints instead and follow §Scanned compilations below. Needs `pymupdf`
(`python3 -m venv venv && ./venv/bin/pip install pymupdf` in a scratch dir).

## 2. Pull the answers

```sql
SELECT question_number, answer, parts
FROM questions
WHERE school = '<ACJC|VJC|DHS|NYJC|RI|HCI|...>'
  AND year = <year> AND level = 'JC1' AND paper = '1'
ORDER BY (question_number)::int;
```

Supabase MCP `execute_sql`, project `nempslbewxtlikfzachi`. **Read-only.**
`parts[].answer` carries the per-part answers and is usually richer than the
rolled-up `answer` column — prefer it (see [[qb-parts-column-already-has-answers]]).

Confirm the row set matches the PDF before trusting it: same question count,
same numbering, and the question text of one or two rows matching the page.

### Verify the answers by hand — do not skip

The key goes out under Adrian's name, so the arithmetic is his standard, not the
database's. Work through as many as you reasonably can — every answer that falls
to a quick derivation, plus anything that looks like an extraction artifact.
Real examples from the first two sets:

- ACJC Q2's Maclaurin series, Q9's `27√3` (the equilateral case), Q10(f)'s plane
  midway between `x+y+z = −2` and `= 2` — all confirmed by derivation.
- VJC Q8(b) came back as `a = −9, u = 9/2, b = −9, v = 5/2`. `a = b` smells like a
  duplication bug; it is not — all five bullet conditions in the question hold.
  **Check before you "fix" a suspicious-looking answer.**

Anything you could not verify (sketch questions, "describe the transformation"),
say so in the hand-off rather than implying the whole key is checked.

## 3. Build the key

Write `answers.json` — one object per question, `parts` as `[label, text]` pairs,
inline LaTeX in `$…$`. Empty label for a single-answer question:

```json
[
  {"n": "1", "parts": [["", "$\\frac{dy}{dx} = -2\\ln\\pi$"]]},
  {"n": "2", "parts": [["(a)", "Shown"], ["(b)", "$\\frac{3}{2}$"]]}
]
```

```bash
node .claude/skills/finish-practice-set/scripts/build_key.js answers.json /tmp/key.pdf A4
```

- **Match the paper's page size** — `A4` or `Letter`. Set 3 (VJC) is US Letter;
  a mismatched key page in an otherwise A4 file looks broken. `make_set.py` warns.
- Use `\frac`, not `\dfrac` — display-size fractions blow the line height apart.
- Prefer row vectors `(1, 1, 0)` over `\begin{pmatrix}` for the same reason;
  Set 1 does this.
- Keep sketch answers descriptive (asymptotes, turning points, intercepts). Set 1
  writes `8. Graph` where there is nothing else to say.
- **Money is `\$`.** The renderer splits on `$…$` pairs, so two plain dollar
  signs on one line (`"$3.10 per kg for A, $3.89 for B"`) would be read as a
  maths chunk. `\$` is a literal dollar sign anywhere — in text, and inside
  `$…$` where it becomes KaTeX's own `\$`: `"\$862.40"`, `"A costs \$3.10, B
  \$3.89"`. A single plain `$888` still works, but write `\$` and stop thinking.

### EM sheets: `style: "em"`

The O-Level EM sets use a different key layout from the JC promo sets — Adrian's
`2026 EM Prelim Practice Set 1 (Ahmad Ibrahim 2025).pdf` is the reference. Pass an
object instead of a bare array:

```json
{
  "style": "em",
  "heading": "Answers  -  Paper 1",
  "subheading": "EM S3 SA2 Practice Set 1",
  "answers": [ {"n": "1", "parts": [["(a)", "31 540 000"]]} ]
}
```

`em` gives a left-aligned Times-Bold 15.5pt heading over a 10pt italic subheading
and a rule, and stacks **one part per line, left-aligned with the question
number** (not indented under it — match the reference); a question whose only
answer is unlabelled stays inline (`3.  x = 7, y = 2`). Omitting the object
(a bare array) keeps the JC layout exactly as before.

`"subheading": ""` drops that line entirely — use it when Adrian is titling the
set himself, so the key carries no name you invented.

## 4. Assemble

```bash
python3 .claude/skills/finish-practice-set/scripts/make_set.py \
  --live "<paper>.pdf" --title "JC1 H2 Math Promo Practice Set N" \
  --footer-top 768 --header-bot 60 --content-top 64.4 --key /tmp/key.pdf \
  --scrub 10:44-73          # optional, repeatable; see the mark-up gotcha below
```

Overwrites in place. The first run copies the file to
`originals/<name> (original).pdf` and **every run rebuilds from that copy**, so
re-running is idempotent — no double-shifted title, no stacked key pages. That
also means: to change spacing, just re-run with new numbers.

Pass `--header-bot 0` when page 1 has no header to strip.

`--header-all-pages` strips the header band from **every** page, taking the
source's own page numbers with it. The JC sets keep those (the reference does),
but Adrian asked for them gone on the EM set — ask, or match whatever the sheet
next to it does. Check first that no page starts its content inside the band.

`--title ""` skips drawing a title while still nudging the body down, leaving
clear space at the top for Adrian to set his own title in a PDF editor.

### Two papers in one file

An EM set is usually Paper 1 and Paper 2 bound together, and each needs its own
title page and its own key at its own end. `build()` finishes one paper, so
**split, finish each half, merge**:

```python
import make_set, pymupdf
src = pymupdf.open(backup)                     # always the pristine backup
for lo, hi, sub, key in [(0, 7, "Paper 1", "key_p1.pdf"),
                         (8, 15, "Paper 2", "key_p2.pdf")]:
    half = pymupdf.open(); half.insert_pdf(src, from_page=lo, to_page=hi)
    half.save(path); half.close()
    make_set.build(path, TITLE, FOOTER_TOP, HEADER_BOT, CONTENT_TOP, key,
                   subtitle=sub,               # subtitle = the second title line
                   header_all_pages=True, scanned=True)   # both only for a scan
# then insert_pdf the finished halves into one document
```

Splitting off the backup every time keeps it idempotent. `--subtitle` / the
`subtitle=` argument prints a second centred title line 23pt under the first,
matching the reference's `Sec 4 E Math Prelims Practice Set 1` / `Paper 2`.

Find the paper boundary from the text: both papers restart at question 1 and at
the source's own page 3, so `pdftotext -f N -l N` per page shows it immediately.

### Scanned compilations — `--scanned`

Some compilations are a 300-dpi greyscale scan per page with only the
compiler's watermark + page number laid over it as text (first met: `EM S1
G2 SA2 2023 Ahmad Ibrahim.pdf` in `1 ONLINE LESSONS/3 Exam Papers/EM S1
(G2)/EM S1 SA2 (NA) 2023/`, 19 Sep 2026 — its seven sibling schools are the
same shape). The tell: the probe finds two spans per page and "lowest real
content y=0". The school's footer code, the source page numbers and `[Turn
over` are all **pixels**, so:

- **The probe decides the mode.** It measures the bands from the pixel rows
  (72 dpi, one row = one point, runs merged, scanned only above the overlay
  text; a page number is a run ≤ 60pt wide in the top 70pt, a body line is
  wide), then counts the dark pixels the STORED images carry inside those
  bands. Hundreds = the school's marks are in the picture → `--scanned`
  (bands applied with `PDF_REDACT_IMAGE_PIXELS`, which whitens the image
  itself and re-encodes it, ~1.4× the size). A handful = scan specks →
  plain text-only mode, which leaves the images byte-identical. A text-only
  redaction on a dirty scan leaves the school's name in the picture under a
  clean text layer — grep would pass and the PDF would still leak.
- `--header-all-pages` when the source page number is in every page's
  picture (the Ahmad Ibrahim set); `--header-bot 0` when no page has one
  (the Woodgrove set).
- `[Turn over` shares the footer row with the school code; it goes with it.
- `content_top` is the body's first run on the paper's page 1. Ahmad
  Ibrahim 2023: `--header-bot 72 --footer-top 768`, content at 84.5 / 88.2,
  `--scanned`. Woodgrove 2025 (Set 3, `EM S1 SA2 (NA) 2025/`): `--header-bot
  0 --footer-top 780`, content at 95 / 97, text-only.
- Verify the **stored image**, not a render: load each page's image with
  `pymupdf.Pixmap(doc, xref)` and check the band rows are white. On a nudged
  first page the bands moved down with the body, so check `768 + dy`, not 768.
- **Covers and the scheme may be bound in.** Woodgrove's compilation carried
  the school's cover page before each section (name + crest), the standard
  formula sheet, a blank page and six pages of marking scheme (school, setter,
  worked solutions). Keep only the question pages of each paper/section —
  the covers go (that is the source), the scheme is replaced by the key, the
  formula sheet went too because nothing on it is Sec 1 work (an O-Level set
  may want it kept — ask). The probe shows these pages as the odd ones out:
  a running head at y≈34 on the scheme pages, an empty page, a cover with a
  476pt-wide run at the top. Find the section boundary by eye: each section
  restarts with "Answer all the questions".
- **Sectioned paper vs two papers.** A paper in Sections A/B (questions
  numbered straight through) gets `--subtitle "Section A"` / `"Section B"`
  and keys headed `Answers  -  Section A`; two bound papers get `Paper 1` /
  `Paper 2`. Follow the paper's own words.
- The source filename names the school, so the finished set is a **new file
  named after its title** beside the original, not an in-place rebuild — the
  `originals/` convention still runs, on the per-paper halves in the scratch
  dir. Adrian's title for that series: `Sec 1 G2 Math EOY Practice Set N` /
  `Paper 1` (EOY, not SA2; numbered — that paper is Set 2), the key's
  subheading the same line.

## 5. Verify before handing over

```bash
pdftoppm -r 80 -png -f 1 -l 1 "<paper>.pdf" /tmp/p1     # then read the image
```

Check, every time:

- no `KiasuExamPaper` / school name / school code / syllabus code left —
  `pdftotext "<paper>.pdf" - | grep -niE "kiasu|<school>|<code, e.g. AISS>|9758"`
  (on a scanned set this only proves the text layer; check the pixels too, above)
- page 1 title spacing looks right, and no rule or fragment survived from the header
- a page with a diagram still has its diagram (redaction can eat line art)
- the last page is the key, at the paper's page size

Then send the file with `SendUserFile`. In a headless session also Telegram it
(see the file-deliverables rule in CLAUDE.md).

## Gotchas paid for already

- **The header's underline is line art, not text.** VJC's header had a dark rule
  under it that a text-only redaction leaves floating below the new title.
  `make_set.py` uses `PDF_REDACT_LINE_ART_REMOVE_IF_COVERED`, which removes art
  fully inside a band and leaves everything that merely touches one — so diagrams
  near the footer survive.
- **Page size varies.** Sets 1 and 2 are A4; Set 3 is US Letter. Always read it
  off the probe rather than assuming. Adrian's own EM reference has Letter key
  pages in an A4 paper — don't copy that; build the key at the paper's size.
- **`probe_set.py` counts white cover-up boxes as content.** The Ang Mo Kio set
  carries a 126x45 pt *white-filled* rectangle low on every even page, so the
  probe rejected every footer candidate with "real content reaches y=817". It is
  invisible. Dump the drawings and check `fill` before believing the probe:
  a `(1.0, 1.0, 1.0)` fill is the compiler painting something out, not content.
- **Compiler mark-up is baked into the pages, and fill ≠ stroke.** VJC's pages
  carried eight highlighter fills (yellow and cyan, over *Without using a
  calculator*, *Hence*, *exact*…) plus a green callout box reading "Expected to
  show working and details in your solutions", with a leader line. All are
  removed. The rule that makes this safe:
  - **Saturated *fill*** = highlighter → removed automatically. Highlights are
    painted *behind* the glyphs, so a white cover-up would hide the words too;
    `strip_highlights` redacts with `TEXT_NONE` so only the fill goes.
  - **Saturated *stroke*** = could be either. ACJC draws its diagram curves in a
    dark slate blue, so auto-removing coloured strokes would delete the figures.
    The probe lists them and you decide; erase a callout with an explicit band,
    `--scrub 10:44-73` (that one takes the box, the leader line and its text).
  Always re-render the scrubbed page — `--scrub` uses `IF_TOUCHED`, so a band set
  too generously will eat real line art.
- **Don't `find` for the file.** Dropbox MCP `search` with `search_mode:
  "title_only"` finds it in a second; a recursive `find` over `~/Desktop` stalls
  for half an hour on iCloud-evicted files. See [[never-find-over-adrianmath]].

## Doctrine fit

Steps 1–4 are reversible and automated; **step 5 is the checkpoint** — Adrian
sees the finished PDF before any student does, because the key carries his name.
This is an on-demand skill, not a scheduled job, so there is no cron trigger and
no `job_runs` stamp to keep.
