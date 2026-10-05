---
name: prelim-practice-sets
description: House format for the 2026 Prelim Practice Set series (E Math, A Math, JC H2) and the playbook for editing a practice-set PDF that already exists. Use when Adrian asks to fix or restyle a built set — "the answers shouldn't show the school's name", "the answers say A Math, should be E Math", "shift the first question down so the title has more space", "make the answer heading match set 3", "add an answer key", "remove the header and footer", "take reference from practice set N" — or when building a new set and you need the exact title-page and answer-key geometry. For rebuilding a scanned paper from scratch out of the Supabase bank, use reproduce-exam-paper; this skill covers the series conventions and surgical edits to finished PDFs.
---

# Prelim practice sets

Adrian assembles school prelim papers into a numbered series: *2026 EM Prelim
Practice Set 1, 2, 3…*, likewise AM and JC H2. Each set is one PDF holding
Paper 1, its answer key, Paper 2, its answer key. The source school is credited
in the **filename only** — never inside the document.

Two jobs land here. Fixing a set that already exists as a PDF (most common), and
supplying the exact geometry when a new set is being built. Rebuilding a scanned
paper into LaTeX from the question bank is `reproduce-exam-paper`'s job.

`references/house-format.md` has every measurement. `scripts/pdf_surgery.py` has
the content-stream surgery; `scripts/answer_key.py` builds answer-key pages and
reserves the title space.

## The format

Question pages carry no headers, footers or page numbers, and no cover,
formulae or blank pages.

**The title is not printed — Adrian adds his own.** The top 2.95 cm of each
paper's first page is deliberately left blank. Shift the body down to reserve
it, then stamp nothing. (Before EM Set 4 a two-line block was printed there;
`title_overlay()` still exists if he ever asks for it back.)

Each paper ends with an answers-only key — no worked solutions. Show-that parts
get the key step, not "Shown" and not a full derivation. O-Level papers run 90
marks each; confirm by pulling the `[n]` tags out of the finished PDF rather
than by adding up by hand.

## Title spacing — measure, then shift

The target: **question 1's topmost ink at 2.95 cm from the page top**, leaving
the space above it empty for Adrian's own title.

Do not guess a `\vspace` or a nominal offset. The topmost ink moves with the
height of the first line — a tall fraction or surd raises it. The reliable
method is two steps:

1. `ink_bands()` the page and read the current top ink.
2. `dy = 2.95 cm − top_ink`; if positive, wrap the content stream in
   `q 1 0 0 1 0 -dy cm … Q`.

`shift_for_title()` in `scripts/answer_key.py` does exactly this and returns the
shift it applied. Both first pages need it — Paper 1's and Paper 2's — and they
usually need *different* shifts, because the two papers open with different
content.

Verify by measuring again: nothing above 2.95 cm, question 1's ink starting
there.

## The answer key

Set 3 is the reference for geometry. Build it with `scripts/answer_key.py`,
which encodes heading, rule, row columns, leading and page breaks.

**Answers are LaTeX, not ASCII.** The rows are typeset by `pdflatex` with
`mathptmx` (Times text + Times math) and the heading is overlaid afterwards with
reportlab, so fractions, indices, degrees, π, matrices and vectors render as
real mathematics: `$\dfrac{27q^{12}}{64m^{9}}$`, `$67.5^{\circ}$`,
`$\overrightarrow{CY} = 2\mathbf{a} - 2\mathbf{b}$`. Prose answers stay prose,
with any symbols inside them in `$…$`. Escape `%` as `\%`.

Two traps, both in `references/house-format.md`: specify every length in `bp`
(LaTeX `pt` is 1/72.27 in and silently yields a 593.1 pt page), and raise
`\lineskip` to ~8.5 bp or `\dfrac` rows collide with their neighbours.

Heading, two lines over a rule:

    Answers  -  Paper 1              Times-Bold 15.5 pt, baseline = rule + 30
    2026 EM Prelim Practice Set 3    Times-Italic 10 pt, baseline = rule + 11
    ─────────────────────────────    0.9 pt rule, left edge shared with both lines

Note the two spaces either side of the dash. The subtitle names the series and
set number — never the school, never the source year, never a paper code.

Rows: bold label at x 60, answer text at x 122, Times 10.3 pt, leading 19.1 pt,
wrapping under the answer column. Two pages per paper is normal for E Math.

## Anonymising

"Shouldn't show the school's name" means gone from the **text layer** too, not
just hidden. A white rectangle over the heading still leaves the name
searchable, copyable and visible to any text extractor — this is the single
easiest mistake to make here. Strip the text-showing operators instead
(`strip_text_band`), then draw the replacement.

Scan the whole finished document for the school name, the paper code, and
phrases like "2025 Prelim S4 Mathematics" before calling it done.

## Headers and footers

Strip by position, not by string — the fonts are usually subsetted, so the
extracted text is garbled bytes and a string match will miss.

Bands differ per paper because the two halves are often different page sizes:

- A4 (841.92 pt tall): header ≈ y 794.8, footer ≈ y 38.5 → bands (789, 800) and (33, 44)
- US Letter (792 pt tall): header ≈ y 744.8, footer ≈ y 38.6 → bands (740, 750) and (33, 44)

Footers are typically on odd pages only (`[Turn over]`), so expect roughly half
the pages to report nothing stripped. That is not a bug — check the count rather
than asserting every page changed.

## Mixed page sizes

**Check every page's MediaBox before anything else.** Sets assembled from two
different school files routinely have Paper 1 in A4 and Paper 2 in US Letter,
and it is invisible on screen. A4 is *narrower* than Letter (595.32 vs 612), so
you cannot simply enlarge the MediaBox — content would be clipped on the right.

Normalise by scaling: `scale = 595.32 / 612 = 0.972745`, then translate up by
`841.92 − 792 × scale = 71.51` so the tops align. Wrap the content stream in
`q scale 0 0 scale 0 71.51 cm … Q`, reset the MediaBox, and delete any
`/CropBox`, `/TrimBox`, `/BleedBox`, `/ArtBox` — a stale CropBox will silently
crop the rescaled page.

Both halves must match before you stamp titles, or the two title blocks land at
different sizes.

## Editing a built PDF

These files are Word or LaTeX output that has already been through a PDF editor,
so they carry traps that ordinary content-stream work does not.

**The title is sometimes a `/Square` annotation, not page content.** It has an
appearance stream and is positioned by its own `/Rect`, so a transform applied to
the content stream will not move it. Check `page.Annots` before assuming
anything about what will move. Sets with no annotations at all (`len(Annots) ==
0`) are the easy case — everything lives in the content stream.

**White `/Square` annotations near the page bottom mask the school's footer.**
They must travel with the content when you shift it, or the last answer line
slides underneath and vanishes.

**Annotation objects are often shared across pages.** Copy before modifying.

**Check `q`/`Q` balance before wrapping a content stream.** Balanced means a
`q … cm` / `Q` wrapper is safe. Unbalanced means an inner `Q` will pop your
state early — wrap the page in a form XObject instead.

**Reset the graphics state in generated pages.** If you draw a shaded region with
`setFillGray`, set it back to 0 before the next text, or every following string
renders grey. This bites in reportlab-generated question pages.

## Swapping a question in

Mark totals must stay at 90 per paper (JC: 100). When the incoming question
carries a different tariff, Adrian prefers **cutting a whole question or a whole
sub-part** over shaving one mark off several tariffs — that keeps the remaining
questions matching the school's original mark scheme. **Ask which part to drop
rather than choosing silently.**

When a part is dropped, relabel what remains — a question that runs (b), (c)
after the cut should print as (a), (b).

## Answers come from the school

The answers in the question bank are transcribed from the school's own paper and
marking scheme. **They are the authority.** Do not "correct" them from a
recomputation, and be especially wary of doing so for anything that depends on a
diagram or a graph — the bank stores question text with operators sometimes
stripped (`2n  5k` could be `+` or `−`), and diagrams are not in the text at all.
A recomputation from that basis is not evidence.

Override only where the school's own printed question disproves the school's
answer by substitution, and say so explicitly when reporting. Where the stored
answer is visibly corrupted (`... wait`, malformed LaTeX like `\fracy1}{4}`),
flag it for Adrian to fill from his marking scheme rather than inventing a value.

## Verifying

Nothing here is finished until these pass. They catch the failures that look fine
in a thumbnail.

- Every page you did not touch renders **pixel-identical** to the original.
- The text layer no longer contains the school name, paper code, wrong subject,
  `[Turn over]`, or any content from a removed question.
- On shifted pages, the lowest visible ink still clears any bottom mask.
- Marks per paper are unchanged (or intentionally rebalanced) — read the `[n]`
  tags back out of the built PDF.
- The title area is blank and question 1 starts at 2.95 cm.
- Every page shares one MediaBox — including the LaTeX-built key pages, which
  land at 593.1 pt wide if the preamble says `pt` where it should say `bp`.
- Render the answer-key pages and **look at them**. Check that no `\dfrac` or
  matrix touches the row above or below, and that nothing spilled past x 540.

Report what moved, by how much, and what you deliberately left alone.
