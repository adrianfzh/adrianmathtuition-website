# House format — exact measurements

All figures verified against built sets (AM Set 2 / Ngee Ann, EM Sets 1–4, JC Set 3).
A4 is 595.32 × 841.92 pt as these files emit it. Set 1 (Ahmad Ibrahim, EM) is
US Letter 612 × 792 pt — **check every page's MediaBox before assuming anything**,
including within a single set (see "Mixed page sizes" in SKILL.md).

## Document structure

    Paper 1 question pages
    Answers - Paper 1            (two pages is normal for E Math)
    Paper 2 question pages
    Answers - Paper 2

Dropped: school cover pages, the formulae list, "BLANK PAGE" fillers, the marking
scheme, all headers, all footers, all page numbers. Kept: working space, answer
lines, marks, diagrams, and the original pagination of the question pages.

## Title block — reserved, not printed

**Adrian adds the titles himself.** Since EM Set 4 the block is left blank: the
body is still shifted down so the space is there, but nothing is stamped into
it. Do not print a title unless he asks for one.

| element                            | from page top | spec                    |
|------------------------------------|---------------|-------------------------|
| top of page → blank                | 0 – 2.95 cm   | reserved for Adrian     |
| topmost ink of question 1          | **2.95 cm = 83.6 pt** | target |

Measured on EM Set 4: Q1 at 2.95 cm on both papers. Paper 1 needed a 9.0 pt
shift and Paper 2 an 11.1 pt shift — different, because the papers open
differently. Always measure per page.

If a printed block is ever wanted again, the legacy geometry was line 1 baseline
at 32.0 pt (~0.80 cm) and line 2 (`Paper 1`) at 51.0 pt (~1.46 cm), Times-Bold
13.5 centred — `title_overlay()` still emits it.

In LaTeX built from `reproduce-exam-paper`'s preamble with a 2.0 cm top margin,
this is a `\vspace*` of roughly 0.2–0.5 cm before the first `\Qn` — but calibrate
against the measured result, not the nominal number. Aim the *topmost ink* at
2.95 cm.

Adding the gap costs nothing elsewhere — it comes out of the `\WS{}` stretch glue
on that page.

## Answer-key heading

Content-stream form, exactly as Set 3 emits it:

```
q BT 1 0 0 1 60 779.89 Tm /tibo 15.5 Tf (Answers  -  Paper 1) Tj ET Q
q BT 1 0 0 1 60 760.89 Tm /tiit 10 Tf (2026 EM Prelim Practice Set 3) Tj ET Q
q 60 749.89 m 540.28 749.89 l .9 w 0 0 0 RG S Q
```

Fonts are base-14, not embedded, WinAnsi:

    /tibo -> Times-Bold      /tiit -> Times-Italic      /tiro -> Times-Roman

Offsets that matter, so the block can be rebuilt on a page whose rule sits
somewhere else:

- bold baseline  = rule y + 30
- italic baseline = rule y + 11
- both lines share the rule's left x
- rule: 0.9 pt, black, x 60 → 540.28 on A4 (92.0 pt from the top)

Answer rows below the rule: bold label at x 60, answer text at x 122,
Times 10.3 pt, leading 19.1 pt. First row baseline = rule y − 22. Break to a new
page (repeating the heading) when the next row would fall below y = 60.

## How the rows are built

`pdflatex` lays out the rows only; the heading block is drawn with reportlab
afterwards and overlaid on every key page, so the heading geometry stays exactly
as Set 3 emits it while the mathematics gets a real typesetter.

Two things that will bite:

**Use `bp`, not `pt`.** LaTeX's `pt` is 1/72.27 in; PDF points are 1/72 in.
`paperwidth=595.32pt` yields a 593.1 pt page and breaks the one-MediaBox check.
Every length in the key preamble — paper size, margins, `\topskip`, `\lineskip`,
`\hangindent`, the label box, and `\fontsize` — is specified in `bp`.

**Give `\lineskip` room or fractions collide.** Rows ride a 19.1 bp baseline
grid, which a `\dfrac` overshoots; TeX then falls back to `\lineskip`, and the
1 pt default leaves fraction rows touching their neighbours. `\lineskip 8.5bp`
with `\lineskiplimit 3bp` keeps plain rows on the grid and opens up only the
tall ones.

Row layout is `\hangindent` + a fixed-width `\makebox` for the label, not a
`\parbox` — a parbox is a single unbreakable box, so its internal lines fall off
the baseline grid and it cannot split across a page.

## Answer text is LaTeX

Answer rows are typeset by `pdflatex` with `mathptmx` (Times text, Times math),
so answers are written as LaTeX source. Prose stays plain; mathematics goes in
`$…$`. ASCII transliteration is dead — it was a workaround for base-14 fonts.

| want            | write                                        |
|-----------------|----------------------------------------------|
| fractions       | `$\dfrac{3}{8}$`, `$1\tfrac{4}{7}$`          |
| powers          | `$\dfrac{27q^{12}}{64m^{9}}$`                |
| multiplication  | `$1.15 \times 10^{8}$`                       |
| degrees         | `$67.5^{\circ}$`                             |
| pi              | `$1.11\pi$ litres`                           |
| roots           | `$\sqrt{129}$`                               |
| inequalities    | `$26450 \le x \le 26549$`                    |
| matrices        | `$\mathbf{N} = \begin{pmatrix} 4 \\ 2 \\ x \end{pmatrix}$` |
| angles          | `$\cos \angle BDC = -\dfrac{13}{20}$`        |
| vectors         | `$\overrightarrow{CY} = 2\mathbf{a} - 2\mathbf{b}$` |
| sets            | `$\{6, 9, 12, 15\}$`                         |
| units after math| `$79.1$ cm$^{2}$`, `$25.5$ km/h`             |
| words in math   | `\text{IQR}` (needs `amsmath`, already loaded) |

Escape `%` as `\%` in prose *and* in math — `$8.45\%$`. Coefficient fractions
inside a larger expression read better as `\tfrac`; a standalone answer that is
just a fraction reads better as `\dfrac`.

Graph and sketch answers get one line describing the key features:
`n-shaped parabola; x-intercepts $(-5, 0)$ and $(3, 0)$; y-intercept $(0, 15)$;
maximum point $(-1, 16)$`.

Use `\dfrac` freely — the row grid handles it (see below).

## Subtitle wording

    2026 <SUBJECT> Prelim Practice Set <N>

`<SUBJECT>` is `EM`, `AM` or `JC`. Never the school, never the source year, never
a paper code such as `NAS/2025/Prelim/AM-O/P1`.

Filenames keep the school for Adrian's own filing:

    2026 EM Prelim Practice Set 3 Chung Cheng High Yishun.pdf

## Header and footer bands

Strip by position (`strip_text_band`), not by string — subsetted fonts make the
extracted text garbled bytes.

| page size | header y | footer y | bands to strip |
|-----------|----------|----------|----------------|
| A4 841.92 | ~794.8   | ~38.5    | (789, 800) and (33, 44) |
| Letter 792| ~744.8   | ~38.6    | (740, 750) and (33, 44) |

Headers (page numbers) appear on every page; footers (`[Turn over]`) usually on
odd pages only. On EM Set 4 this was 47 headers and 24 footers across 47 pages.

## Letter → A4 normalisation

    scale = 595.32 / 612 = 0.972745
    dy    = 841.92 - 792 x scale = 71.51

Wrap: `q 0.972745 0 0 0.972745 0 71.51 cm … Q`, set MediaBox to
`[0 0 595.32 841.92]`, and delete `/CropBox`, `/TrimBox`, `/BleedBox`, `/ArtBox`.
The 47 pt top margin scales to 45.9 pt — a 1.3 pt difference, invisible.

## Marks

O-Level E Math and A Math: 90 per paper. JC H2: 100 per paper (Paper 2 splits
Section A 40 / Section B 60).

When a question is swapped in and the total moves, Adrian prefers cutting a whole
question or a whole sub-part over shaving one mark off several tariffs — that
keeps the remaining questions matching the school's original mark scheme. Ask
which part to drop rather than choosing silently, then relabel the survivors so
the lettering runs (a), (b), … again.

Verify by extracting `[n]` from the built PDF per page and summing per paper.
