---
name: create-worksheet
description: >
  Generate Singapore secondary/JC math practice worksheets as formatted .docx files.
  Use this skill whenever Adrian asks to create, generate, or produce a worksheet,
  practice paper, or question set — even if phrased casually like "make me a worksheet
  on differentiation" or "can you generate some practice questions for AM". Also trigger
  when asked to reformat or clone an existing worksheet into a new .docx. The skill
  produces properly formatted Word documents with proper OMML equation rendering,
  auto-numbered questions and sub-questions that restart per question, right-aligned
  marks, inline answers in orange in the format [Ans: ...], correct page margins, and
  consistent typography matching Adrian's house style. This skill also owns Adrian's
  Revision "(With Worked Examples)" sheet format — notes summary, concept-titled boxed
  Examples, practice set — so use it for those too; the separate revision-worksheet
  skill is only for building worksheets out of real past-paper questions from the
  question bank. Use THIS skill when the worksheet should be produced straight from
  a topic and a count, with no round of choosing first. If Adrian wants to SEE
  candidate questions from the question bank and pick which ones go in before
  anything is built, that is worksheet-clerk — which calls this skill to render
  whatever he picked.
---

# Create Worksheet Skill

Generates math practice worksheets as `.docx` files with one Python script per worksheet. The library `worksheet_lib.py` handles all the styling, numbering definitions, OMML conversion, and inline `numPr` patching internally — you just write the questions.

Requires `pandoc` and `python-docx` (both present in the Cowork sandbox and on Adrian's Mac — Homebrew pandoc + pip python-docx).

## Workflow

This skill runs in two environments; the only difference is the paths.

`<skill-dir>` = this skill's own directory (announced as "Base directory for this skill" when the skill loads; in Cowork it's `/mnt/skills/user/create-worksheet`, locally it's `~/.claude/skills/create-worksheet`).

```bash
# 1. Make a working directory:
#    Cowork:      /home/claude/<topic>
#    Claude Code: the session scratchpad dir (or any temp dir)
mkdir -p <workdir> && cd <workdir>

# 2. Copy the library from the skill directory
cp <skill-dir>/worksheet_lib.py .

# 3. Write your author script (template below), then run it
python3 my_worksheet.py
# Output: my_worksheet.docx — ready to use
```

That's it. One script to run. The library produces a Word-ready docx in a single pass.

## Author Script Template

Save as `my_worksheet.py` next to `worksheet_lib.py`:

```python
from worksheet_lib import Worksheet

ws = Worksheet()
ws.title('Worksheet Title')
ws.subtitle('IP4 / Sec 4 Mathematics')

# Single-part question with sub-parts
ws.Q([('text', '(Topic)  Given that ', {'italic': True}),
      ('math', 'A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}'),
      ('text', ',')])
ws.SQ([('text', 'Find '), ('math', 'A^2'), ('text', '.')], marks=2)
ws.SQ([('text', 'Hence find '), ('math', 'A^3'), ('text', '.')], marks=2)
ws.ans([('text', '(a) '), ('math', 'A^2 = ...'),
        ('text', '; (b) '), ('math', 'A^3 = ...')])

# Standalone question (no sub-parts)
ws.Q([('text', '(Topic)  Solve ', {'italic': True}),
      ('math', '2x^2 - 5x + 3 = 0'),
      ('text', '.')], marks=3)
ws.ans([('math', 'x = 1'), ('text', ' or '), ('math', 'x = \\dfrac{3}{2}')])

# Display equation in the middle of a question
ws.Q([('text', '(Topic)  Evaluate the integral', {'italic': True})])
ws.math_block(r'\int_0^1 (3x^2 + 2x) \, dx')
ws.para([('text', 'using the fundamental theorem of calculus.')], marks=3)
ws.ans([('math', '= 2')])

ws.save('my_worksheet.docx')
```

Run with `python3 my_worksheet.py`.

## API Reference

The `Worksheet` class exposes these methods. All take a `parts` list (described below) except where noted.

| Method | Purpose |
|---|---|
| `ws.title(text)` | 12pt bold navy centred title |
| `ws.subtitle(text)` | 10pt italic centred subtitle |
| `ws.concept(text)` | Bold concept subtitle above the worked Example(s) it covers — see **Worked-example labelling** below. |
| `ws.example(letter=None)` | Bold auto-numbered `Example N` label. `example('a')` starts a lettered group (`Example 3a`); `example('b')` reuses the number. |
| `ws.Q(parts, marks=None)` | Main question. Auto-numbered `1.`, `2.`, `3.`, ... Each call also opens a fresh sub-question pool, so any `SQ()` calls that follow restart at `(a)`. |
| `ws.SQ(parts, marks=None)` | Sub-question under the most recent `Q()`. Auto-numbered `(a)`, `(b)`, `(c)`, ... Restarts when a new `Q()` is called. |
| `ws.para(parts, marks=None)` | Plain paragraph with no numbering. |
| `ws.math_block(latex)` | Centred display equation (no surrounding text). |
| `ws.ans(parts)` | `[Ans: ...]` line — right-aligned, orange. The wrapper `[Ans: ` and `]` are added automatically; pass only the inner content. |
| `ws.figure(path, width_cm=10.5)` | Embed a rendered figure PNG, centred under the current question. Cap 16 cm; never upscales a small image. Render the PNG with `figure_lib.render` first — see **Figures** below. |
| `ws.solution_box(rows, keep_together=True)` | Boxed worked solution in Adrian's house format — see **Worked-solution boxes** below. |
| `ws.page_break()` | Manual page break. |
| `ws.save(path)` | Write the final docx to disk. |

### `parts` format

A `parts` argument is a list of tuples. Each tuple is one of:

```python
('text', "string")                                    # plain text
('text', "string", {'bold': True})                    # styled text
('text', "string", {'italic': True})                  # italic text
('text', "string", {'color': RGBColor(0xff,0,0)})     # coloured text
('math', "latex_expr")                                # inline equation
('math_display', "latex_expr")                        # display equation inline
```

Mix freely:

```python
ws.Q([('text', 'Find '),
      ('math', 'x'),
      ('text', ' such that '),
      ('math', 'x^2 + 3x - 4 = 0'),
      ('text', '.')], marks=2)
```

### Important LaTeX-in-Python tips

- Use **raw strings** for math-only fragments: `r'\dfrac{a}{b}'` so backslashes pass through.
- Inside `\begin{pmatrix}...\end{pmatrix}`, the row separator `\\` becomes `\\\\` in a regular string. Or use `r'...'` to keep it as `\\`.
- Always put math in `('math', ...)` tuples — never embed `$...$` directly in text strings.

## Worked-solution boxes (2026-08-13)

Adrian's Revision "(With Worked Examples)" sheets put every worked solution in a
bordered table directly under a bold **Solution:** line. `ws.solution_box(rows)`
reproduces that format exactly: a table showing **only the outer border** (the
inside grid lines are suppressed — Adrian's boxes are a single rectangle),
**two columns** — the part label alone in a narrow (1 cm) first column, the
working beside it — **one table row per part**. An unlabelled solution becomes
a single full-width cell instead.

```python
ws.solution_box([
    ('(a)', [
        [('text', 'Differentiate: ')],          # a parts list = left-aligned prose line
        r'\dfrac{dy}{dx} = 3x^2 - 4',           # a bare latex string = display equation,
                                                #   left-aligned at a 0.5 cm indent
    ]),
    ('(b)', [
        ('figure', 'q3_fig.png', 7.0),          # a figure step: centred PNG inside the box
        r'x = 2 \text{ or } x = -\tfrac{2}{3}',
    ]),
])

# Unlabelled (whole solution, no parts):
ws.solution_box([('', [ [('text', 'By symmetry the area is ')], r'A = 12' ])])
```

- `rows` is a list of `(label, steps)`; label `'(a)'`/`'(i)'`, or `''` for the
  single-cell variant. Each step is one of: a `parts` list (prose, same shapes
  `Q()`/`para()` take), a bare LaTeX string (display equation, left-aligned at
  0.5 cm), or `('figure', path, width_cm=8.0)` for an explanatory diagram
  rendered with `figure_lib` (see **Figures**).
- **Never chain three or more `=` on one line.** Split into an aligned block —
  one `=` per line, vertically aligned:
  `r'\begin{aligned} s &= \int v\, dt \\ &= t^3 - \tfrac{15}{2}t^2 \end{aligned}'`.
  Short side-by-side statements stay on one line with `\qquad` between them.
- **Arrow annotations**: end a working line with `\quad\text{← short reason}`
  and the arrow plus everything after it is styled automatically in Adrian's
  annotation format (50 % grey, 8 pt) — e.g.
  `r'... + C \quad\text{← every integration needs a constant}'`. Only `←` triggers
  this; `⇒`/`→` remain normal math.
- **One blank line between parts** is inserted automatically inside the box —
  after the bottom of each part, never after the last one. Don't add empty
  steps for spacing.
- The box writes a spacer line, then its own bold `Solution:` header, then the
  table, then a blank paragraph — don't add any of those yourself.
- **Keep-together** (default on): the whole block — question paragraphs since
  the last `Q()`, the `Solution:` header, and the box — refuses to straddle a
  page break; Word pushes it to a fresh page instead. Blocks taller than a full
  page still split gracefully. Pass `keep_together=False` to let a box flow.
- Don't mix labelled and unlabelled rows in one call; one call per solution block.

### Worked-example labelling (2026-08-13)

Every worked example is labelled **Example N** (bold, auto-numbered), and the
concept it teaches is written **first**, as its own bold subtitle line above the
label — never folded into the Example line:

```python
ws.concept('Total Distance When the Particle Turns Round Twice')
ws.example()                     # -> Example 3
ws.para([('text', 'A particle moves so that ...')])
ws.solution_box([...])
```

Related examples that share one concept get **one number with letter suffixes**:
write the concept once, then `ws.example('a')` (starts the group — `Example 4a`)
and `ws.example('b')` / `ws.example('c')` for the siblings. A later plain
`ws.example()` continues the numbering (`Example 5`).

Order on the page: concept subtitle → `Example N` → question paragraphs →
`solution_box`. The concept and label lines automatically join the
keep-together block of the box that follows, so the whole example stays on one
page.

## Figures (2026-08-12)

Generated questions may carry diagrams — but **never freehand one**. The iron
rule is a single source of truth: define the question's parameters ONCE in the
script, and derive the question text, the answer, **and the figure spec** from
those same variables. A figure that is drawn from the numbers the answer is
computed from cannot contradict the mark scheme.

```python
import figure_lib      # copy from the skill dir alongside worksheet_lib.py

# ONE set of parameters drives everything:
mu, sigma, cut = 50, 5, 55

ws.Q([('text', f'The masses of oranges are normally distributed with mean {mu} g '
               f'and standard deviation {sigma} g. Find the probability that a '
               f'randomly chosen orange has mass greater than {cut} g.')], marks=2)
fig = figure_lib.render({'kind': 'normal', 'mu': mu, 'sigma': sigma,
                         'shade': [cut, None], 'xticks': [mu, cut],
                         'xlabel': 'mass (g)'}, 'q1_fig.png')
ws.figure(fig)
ws.ans([('text', '0.159 (3 s.f.)')])   # computed from THE SAME mu/sigma/cut
```

Supported genres (`figure_lib.GENRES`) and their key spec fields:

| kind | fields |
|---|---|
| `graph` | `curves: [{expr, domain, label, label_at?}]`, `points`, `vlines`/`hlines` (an hline may be `{y, label}` — label sits above its right end, for asymptotes), `shade: {expr, from, to, to_expr?}`, `xticks`/`yticks` + optional `xtick_labels`/`ytick_labels` (display strings, e.g. `r'$\frac{5}{3}$'` at tick 5/3), `xlim`/`ylim`, `clip_y` (asymptotes), `axis_names` (default `("x","y")` — pass `("t","v")` for kinematics) |
| `normal` | `mu`, `sigma`, `shade: [lo, hi]` (`None` = tail), `xticks`, `xlabel` |
| `histogram` | `bins: [[lo, hi, freq], …]`, `density: true` for unequal widths, `xlabel` |
| `boxplot` | `min, q1, median, q3, max`, `xticks`, `xlabel` |
| `cumulative` | `points: [[x, cf], …]`, `xlabel` (ogive with grid) |
| `points` | `points: {A: [x,y], …}`, `segments: [[A,B] or [A,B,'dashed']]`, `circles`, `right_angles: [[A,B,C]]` (mark at B), `angle_arcs: [{at, from, to, label}]`, `labels: [{text, at, halo?, size?}]` (`halo: true` paints a white box behind the text — use it for any dimension label that has to sit on or near a line, otherwise the line strikes through it), `hide_points: [names]`, `axes: true` for coordinate questions |

- `expr` strings use a whitelisted namespace: `x`, `sin cos tan exp ln log sqrt abs pi e`.
  `render` raises on anything else — a bad spec must fail the script, never ship a blank box.
- **If the question needs a genre that doesn't exist** (3-D solids, bearings with
  scale, complicated circle-theorem configs), write the question WITHOUT a figure
  or pick a different question. A described-but-missing diagram is the one output
  this system exists to prevent.
- Real past-paper diagrams are a different pipeline: the `revision-worksheet`
  skill embeds the bank's stored `question_images` — don't re-render those here.
- Requires `matplotlib` (present on Adrian's Mac; in Cowork check with
  `python3 -c "import matplotlib"` and `pip install matplotlib` if missing).
- Verify visually: after building, extract and LOOK at each figure
  (`unzip -o out.docx 'word/media/*' -d check/`) the same way equations get an
  OMML count — a wrong diagram is worse than a missing one.

## House Style

The library hardcodes Adrian's house style. To change it, edit `worksheet_lib.py` directly.

| Property | Value |
|---|---|
| Font | Times New Roman |
| Body size | 9.5 pt |
| Title size | 12 pt, bold, navy `#1F4E79`, centred |
| Subtitle | 10 pt, italic, centred |
| Line spacing | 1.5 |
| Paragraph spacing before/after | 0 pt |
| Page size | A4 (21 × 29.7 cm) |
| Margins | top 2 cm, bottom 1 cm, left/right 2.5 cm |
| Marks tab stop | 15.5 cm, right-aligned |
| Marks colour | Black |
| Answer style | Right-aligned, orange `#843C0C`, prefix `[Ans: ...]` |

## Verification

After running the script:

```bash
# OMML check (positive number = math equations embedded)
unzip -p my_worksheet.docx word/document.xml | grep -o "m:oMath" | wc -l

# OOXML validation — Cowork only (script lives in the sandbox docx skill;
# skip locally, the OMML count + opening the file is enough there):
python3 /mnt/skills/public/docx/scripts/office/validate.py my_worksheet.docx
```

Then deliver the file:

```bash
# Cowork: copy to outputs so Adrian gets a download card
cp my_worksheet.docx /mnt/user-data/outputs/<descriptive_name>.docx

# Claude Code local: copy to the Desktop (Adrian's convention for worksheets)
cp my_worksheet.docx ~/Desktop/<descriptive_name>.docx
```

## How It Works (Internal Details)

The library handles three things that are easy to get wrong:

1. **Word's auto-numbering needs inline `numPr`, not just style inheritance.** MS Word ignores numbering attached to a paragraph style alone, so the library adds `<w:numPr>` directly on each `Q()` and `SQ()` paragraph at write time.

2. **Each question's sub-list needs a unique `numId` to restart `(a)`.** The library pre-allocates 30 sub-question lists in `numbering.xml` (numIds 10–39), each with `<w:startOverride w:val="1"/>`. Every `Q()` advances an internal counter, and the next `SQ()` calls bind to that counter's numId. When a new `Q()` is called, the next numId is used — automatically restarting at `(a)`.

3. **OMML equations come from pandoc.** For each `('math', ...)` or `('math_display', ...)` part, the library shells out to `pandoc` on a small fragment, extracts the `<m:oMath>` element from the resulting docx, and inserts it into the current paragraph. This produces native Word equation objects rather than Unicode plain text.

The clean `numbering.xml` is injected at `save()` time by rewriting the docx zip — this avoids python-docx's noisy default numbering definitions.

## Sandbox Caveat

LibreOffice in the Linux sandbox can't render Cambria Math, so equations appear blank in PDF previews generated here. **The docx is correct** — equations render perfectly when opened in MS Word. Verify equations are present by counting OMML blocks in the XML (see Verification above).

## Quick LaTeX Reference

| Pattern | LaTeX |
|---|---|
| Inline | `('math', 'x^2 + 2x - 3')` |
| Display | `ws.math_block(r'\int_0^1 x^2 \, dx')` |
| Fraction | `\dfrac{a}{b}` |
| Matrix (round) | `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` |
| Matrix (square) | `\begin{bmatrix} a & b \\ c & d \end{bmatrix}` |
| Cases | `\begin{cases} x, & x \geq 0 \\ -x, & x < 0 \end{cases}` |
| Vector hat | `\hat{i}`, `\hat{j}` |
| Greek | `\alpha, \beta, \theta, \pi, \sigma` |
| Inequalities | `\leq, \geq, \neq, \approx` |
| Sets | `\in, \notin, \cup, \cap, \subset` |
| Derivatives | `\dfrac{dy}{dx}`, `f'(x)`, `\dfrac{d^2 y}{dx^2}` |
| Integrals | `\int_a^b f(x) \, dx` |
| Trig | `\sin, \cos, \tan, \arctan` |
