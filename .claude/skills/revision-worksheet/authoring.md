# Authoring brief — worked examples in Adrian's style

The binding source is `~/Desktop/AdrianMath/teaching_style/FEEDBACK.md` (his own
amendments, diffed). This file is the distillation for ONE surface — the Revision
"(With Worked Examples)" sheet rendered by `create-worksheet/worksheet_lib.py` — with
the exact code shapes that renderer accepts. When FEEDBACK.md has a newer dated entry
than 5 Sep 2026, read that entry too; it wins.

Two of his own sheets are the reference for this surface, and worth opening once:
`Revision/S2/2 REV Polygons (With Worked Examples).docx` and
`Revision/EM/O REV Number Patterns (With Worked Examples).docx`.

**Plain Singapore classroom English in every lede, note and annotation — no idioms**
(Adrian, 7 Sep 2026, on "That same line hands you the factor (x − a) to divide by":
"don't say 'hands you', Singapore students don't speak like that"). Say *gives*, *gives
you*, *tells you*, *is*. Not *hands you*, *buys you*, *for free*, *do the heavy lifting*,
*nail down*, *unlock*, *the trick is*, or any other figure of speech — a student should be
able to read the line aloud in class. FEEDBACK.md carries the dated entry.

## What a worked example is on this sheet

- **The Example IS the exam question.** Stem and parts come from the bank verbatim
  (`sm(row["question_text"])`, `sm(part["text"])`), `[n]` printed per part, and the
  part marks add up to `total_marks`. No paraphrase, no changed numbers, no school or
  year anywhere on the page — provenance goes in the run report.
- **Order on the page:** concept line → `Example N` → question → `Solution:` box.
  The concept line names the skill **as an action, in Title Case**: "Find n From a Mix
  of Given Angles", "Explain Why a Regular Polygon Cannot Exist", "Use Exterior Angles
  Where Two Polygons Meet". Not a teaser, not a filing label.
- **Two questions that teach one concept share one number**: write the concept once,
  then `Example 3a`, `Example 3b`. Use it for a warm-up followed by the exam-level
  version of the same move; do not use it to pad.
- **One example per aspect of the topic.** The plan gives you the bank's skill map;
  the sheet is comprehensive when every aspect a student can be examined on has an
  example, and it is not repetitive when no two examples exercise the same primary
  aspect. A capstone that links two aspects is worth having; a third question on
  interior-angle sums is not.

## Inside the box

- **A routine procedure gets a BARE box** — one complete equation per line, a `←`
  on the lines that need one, nothing else. Prose that narrates what the working
  already shows was cut from every sheet he amended.
- **A non-obvious idea opens with one to three grey italic principle lines**
  (general rule → the trick → applied to this question), then a blank line, then
  the working. Write them as a prose step with `{'italic': True, 'color': GREY}`.
- **Every `←` names the rule or the target**, not the move itself: `← sum of
  exterior angles = 360°`, `← divide by 5 to obtain n`, `← (n − 2) × 180° is the
  interior-angle sum`. The annotation says what the line is FOR. Routine moves get
  the rule's name (`← chain rule`); he also writes `**must know …` tags inside an
  annotation when a fact is examinable on its own.
- **Where two tools both work, show both** — his Polygons sheet puts "Method 1:
  Using Interior Angles" beside "Method 2: Using Exterior Angles (faster)". In this
  renderer that is two labelled rows in one box, or two prose headers each followed
  by its aligned block. Say which is faster.
- **Geometric statements carry their reason in brackets**: `(ΔABC is isosceles)`,
  `(angles on a straight line)`, `(ext. ∠ of a regular n-gon)`.
- **Conclude with `∴`** when a result is being stated; a show-that ends `(shown)`;
  a rejected root says why (`← reject n = −4, a polygon has a positive number of
  sides`).
- **Stacked fractions always** (`\dfrac`, `\tfrac` inside a line) — a flat `4/3`
  reads as a lower standard to him. **Never chain three `=` on one line**: use
  `\begin{aligned} … &= … \\ &= … \end{aligned}`, one `=` per line.
- **Units and accuracy on the final line**: `= 21.1 m (3 s.f.)`, angles to 1 d.p.
- **At most ONE Common Error per box**, and only when it names the wrong TOOL in one
  sentence. No numerical disproofs, no picture arguments, none on a routine box.
- **A Check only where a real check exists**, in exact form.
- **The word "never" does not appear.** Write "not", "does not", "is not".
- **The box hugs its content**: no empty trailing step, no blank step for spacing —
  the renderer inserts the one blank line between parts itself.

## Practice under the examples

- Real Word numbering, straight through; the parts of one question are (a)(b)(c).
- **ONE `[Ans:]` line per question**, at the end, carrying every part, typeset as
  maths: `(a) 24°; (b) n = 10; (c) 144°`. Exact forms kept.
- No hint unless a `[Remember: …]` line genuinely unlocks the question; light grey.
- **No source line under a question.** None.

## The running head

`render` puts TITLE and SUBTITLE in the PAGE HEADER, copied off his own sheets: two
centred bold Times New Roman lines, the level line at 9.5 pt over the topic at 12 pt,
repeating on every page. There is no body title block — the first thing on the page is
`Notes:`. Word dims header text in Print Layout, which is why his look grey; the runs
carry no colour. A centred grey "Page x of y" footer is added (`page_numbers=False`
turns it off); his own sheets have no footer, so that is the one deliberate addition.

## The Notes block

His own sheets open with a Notes block: the definitions, the two or three formulas
as display maths, and — on the S1/S2 sheets built in August — a numbered **Mistakes
to avoid** list (six at most). When the topic has a hand-authored Notes function in
`scripts/revision-builders/build_s1.py` / `build_s2.py` the CLI reuses it verbatim;
otherwise you draft one to that shape and the run report flags it as *drafted*. It is
Adrian's to amend — keep it short, keep it his.

## Verification — every number on the page is recomputed

Solve every example yourself; the bank's `solution` and part-level `answer` are
reference only and contain real errors (documented ones in the builder's SKILL.md).
Write `verify.py` next to `content.py` in the working directory — `sympy` is
available under `/usr/bin/python3` — and check every printed value, intermediate
lines included: a right answer reached through a wrong line is still an error,
because students copy the working. `rw.py render` refuses to write the sheet if
`verify.py` exists and exits non-zero. Then check the part marks sum to
`total_marks` for every example (render does this for you) and LOOK at the rendered
pages before handing over.

## Code shapes (exact)

`content.py` is the only file you write for the sheet; `rw.py render` imports it.
Helpers available inside it: `sm(text)` splits bank text with `$…$` into parts,
`GREY` is the annotation grey, `B`/`I`/`T`/`M` are the usual part constructors.

```python
from rw_content import sm, GREY, T, B, I, M, P, U   # P = grey italic principle line, U = bold underline

TITLE    = "Sec 2 Math Revision"                 # header line 1 — the level line
SUBTITLE = "Polygons"                            # header line 2 — the topic

# ── Notes block ───────────────────────────────────────────────────────────────
# Each entry: ('head', text) | ('para', parts) | ('math', latex) | ('mistakes', [text, …])
NOTES = [
    ('head', 'The three facts every polygon question uses'),
    ('para', [T('Sum of interior angles of an '), M('n'), T('-sided polygon: ')]),
    ('math', r'(n - 2) \times 180^\circ'),
    ('para', [T('One exterior angle of a regular polygon: ')]),
    ('math', r'\dfrac{360^\circ}{n} \qquad \text{and} \qquad \text{interior} + \text{exterior} = 180^\circ'),
    ('mistakes', [
        'Using $(n-2) \\times 180^\\circ$ for ONE interior angle — that is the total; divide by $n$.',
        'Forgetting that exterior angles of ANY polygon sum to $360^\\circ$, regular or not.',
    ]),
]

# ── Worked examples ───────────────────────────────────────────────────────────
# (id8, concept, rows[, letter])  — id8 = first 8 chars of the bank id from plan.json.
# rows are solution_box rows: (label, steps); label '' for an unlabelled box.
# A step is a bare latex string (display maths), a parts list (prose), or
# ('figure', path, width_cm). letter 'a'/'b' groups siblings under one concept.
EXAMPLES = [
    # Two tools, side by side — the shape from his own Polygons sheet
    ("3f1c9a20", "Find the Number of Sides From One Interior Angle", [
        ('(i)', [
            r"p = \dfrac{(5-2) \times 180^\circ}{5} = 108^\circ \quad\text{← one interior angle of a regular pentagon}",
        ]),
        ('(ii)', [
            r"q = 360^\circ - 108^\circ - 108^\circ = 144^\circ \quad\text{← angles at a point}",
        ]),
        ('(iii)', [
            [B('Method 1: Using Interior Angles')],
            r"\begin{aligned} \dfrac{(n-2) \times 180}{n} &= 144 \\ 180n - 360 &= 144n \\ 36n &= 360 \\ n &= 10 \end{aligned}",
            [B('Method 2: Using Exterior Angles (faster)')],
            r"\begin{aligned} \text{exterior angle} &= 180^\circ - 144^\circ = 36^\circ \\ n &= \dfrac{360^\circ}{36^\circ} = 10 \quad\text{← total exterior angles = 360°} \end{aligned}",
            [T('∴ 10 pentagons are needed to form the ring.')],
        ]),
    ]),

    # A non-obvious idea — principle lines first, then the working
    ("b71e0d44", "Explain Why a Regular Polygon Cannot Have This Interior Angle", [
        ('', [
            [I('A regular polygon exists only if its exterior angle divides 360° exactly — '
               'so test the exterior angle, not the interior one.'), ],
            r"\text{exterior angle} = 180^\circ - 130^\circ = 50^\circ",
            r"n = \dfrac{360^\circ}{50^\circ} = 7.2 \quad\text{← n must be a whole number}",
            [T('∴ 7.2 is not an integer, so no regular polygon has an interior angle of 130°.')],
        ]),
    ]),

    # A routine procedure — bare box
    ("9ac02e17", "Find n From a Mix of Given Angles", [
        ('', [
            r"\begin{aligned} 156 + 94 + 130(n-2) &= (n-2) \times 180 \quad\text{← interior-angle sum} \\ 250 + 130n - 260 &= 180n - 360 \\ 350 &= 50n \\ n &= 7 \end{aligned}",
        ]),
    ]),
]

# ── Practice answers ──────────────────────────────────────────────────────────
# id8 -> the whole answer line for that question, every part, typeset as maths.
ANSWERS = {
    "76e2abbd": "(a) $24^\\circ$; (b) $n = 15$",
    "e5252acf": "$x = 63^\\circ$",
}
```

Principle lines are prose steps: `[('text', '…', {'italic': True, 'color': GREY})]`.
The renderer greys `←` annotations automatically when they are written as
`\quad\text{← …}` at the end of a maths line — that is the only colour that lives
inside maths; keep colour to prose lines otherwise.

## Render contract — what `rw.py render` reads and enforces

Everything below is what `cmd_render` does; **read this, not `rw.py`** (a session
spent 40 s re-reading the source for exactly these facts, 7 Sep 2026).

`render --dir <workdir> [--out <path.docx>] [--pdf] [--flow]` imports
`<workdir>/content.py` and reads `plan.json` + `practice.json` beside it.

| Name in `content.py` | Required | Shape | Default |
|---|---|---|---|
| `TITLE` | no | str — header line 1 (the level line) | `plan.level_line` |
| `SUBTITLE` | no | str — header line 2 (the topic) | `plan.topic` |
| `NOTES` | no (warns) | list of `('head', str)` · `('para', parts)` · `('math', latex)` · `('mistakes', [str, …])` — **or** a builder string `"module:function"` naming a hand-authored Notes function in `scripts/revision-builders` (e.g. `"build_s2:notes_polygons"`) | none → warning *no Notes block* |
| `EXAMPLES` | yes | list of `(id8, concept, rows)` or `(id8, concept, rows, letter)` | |
| `ANSWERS` | yes | dict `id8 → str` — the whole answer line, `$…$` inline maths (split with `sm`) | |

- `rows` = list of `(label, steps)`; `label` is `'(a)'` / `'(i)'` or `''` for one
  unlabelled cell. A step is a bare latex string (display maths), a parts list
  (prose — `[T(…), M(…)]`, `[B(…)]`, `[P(…)]`), or `('figure', path, width_cm)` for a
  sketch **you** drew. Bank figures are placed by render itself — do not add them.
- `letter`: `None`/`''`/`'a'` prints the concept line, then `Example N` / `Example Na`;
  `'b'` prints only `Example Nb` under the previous concept.
- Helpers importable from `rw_content`: `sm`, `GREY`, `LIGHT`, `T`, `B`, `I`, `M`, `P`, `U`.

What render does, in order — each **stop** is a `SystemExit` before any file is written:

1. Runs `<workdir>/verify.py` with `/usr/bin/python3` if it exists → non-zero exit **stops**;
   no `verify.py` → warning *numbers not machine-checked*.
2. Every `EXAMPLES` id8 must be in `plan.json`'s pool → else **stop**. Every practice
   id8 in `practice.json` must have an `ANSWERS` entry → else **stop**.
3. Fetches the bank figures for every example and practice question into
   `<workdir>/figs` and lays them out itself (examples: under the stem, max height
   6.5 cm; practice: 7.5 cm; unreadable figure → warning, laid out without it).
4. Header from `TITLE`/`SUBTITLE` (running head, every page) → Notes → page break →
   per example: concept line, `Example N`, stem and parts **verbatim from the bank**
   with `[marks]`, then `solution_box(rows)`. The question + box are kept on one page
   unless `--flow`. Part marks ≠ `total_marks` → warning, not a stop.
5. Page break → `Practice` → Word numbering restarted → each question with its
   `ANSWERS` line; parts-only questions hoist the first part onto the number line.
6. Writes the DOCX to `Revision/<folder>/…` named as SKILL.md §5 says, **never
   overwriting** (`--out` for an exact path). `--pdf` exports through Word (works since 7 Sep 2026;
   refuses a target under `/private/tmp`) and falls back to `<workdir>/preview.html`. Every
   warning lands in `<workdir>/report.md`; repeat them in the hand-over.

