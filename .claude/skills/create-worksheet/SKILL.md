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
  consistent typography matching Adrian's house style.
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
| `ws.Q(parts, marks=None)` | Main question. Auto-numbered `1.`, `2.`, `3.`, ... Each call also opens a fresh sub-question pool, so any `SQ()` calls that follow restart at `(a)`. |
| `ws.SQ(parts, marks=None)` | Sub-question under the most recent `Q()`. Auto-numbered `(a)`, `(b)`, `(c)`, ... Restarts when a new `Q()` is called. |
| `ws.para(parts, marks=None)` | Plain paragraph with no numbering. |
| `ws.math_block(latex)` | Centred display equation (no surrounding text). |
| `ws.ans(parts)` | `[Ans: ...]` line — right-aligned, orange. The wrapper `[Ans: ` and `]` are added automatically; pass only the inner content. |
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
