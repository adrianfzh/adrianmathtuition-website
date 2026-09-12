# Adrian's worksheet style — the one list every pipeline follows

**Read this before writing any solution that will be rendered by `worksheet_lib.py`** —
the revision-worksheet (`rw`) and `crw` skills, the self-study sheet worker, the GCE paper
export, the Telegram `/ws` worker, `create-worksheet` itself. The library enforces most of
it; what it cannot enforce is listed as an authoring rule. Each entry carries the date and
Adrian's own words so a future session knows why, and **this file is where a new rule is
added** (see the last section) — never only in one skill's notes.

The reference is his own notes: `Dropbox/Apps/AdrianMathNotes/Notes/AM/15–20 *.docx`
(Trigonometric Ratios → Applications). When in doubt, open one and copy the shape.

## 1 · Working: line by line, aligned at "=", every line editable

- A worked solution is written **one equation per line**, the lines **aligned at the
  equals sign**, each line its own editable equation — the same structure he types:
  one Word math paragraph (`m:oMathPara`, left-justified), one `m:oMath` per line, the
  "=" run carrying `m:aln`, a soft break (`w:br`) ending every line but the last.
  Enter inside the block adds a line that aligns; a line can be deleted on its own.
  (12 Sep 2026: "readability is poor, lines are written continuously, should be by line,
  aligned at equal sign"; "able to make them line by line so i can edit, add lines, delete
  lines? equation should still be aligned at equal sign".)
- **Never build the lines as a table** — one row per line was rejected outright
  ("you have built the equations inside tables, that's not what I want").
- Code shape: a bare `\begin{aligned} lhs &= rhs \\ &= rhs \end{aligned}` string as a
  solution step. `_solution_lines` turns it into the structure above. Nothing else to do.
- **Never chain three "=" on one line**; a new "=" is a new line. Stacked fractions
  (`\dfrac`) always.
- **Function names get a space**: "cos P", "sin x cos y", not "cosP" — the library adds
  the thin space (`_function_spaces`) after `\sin`, `\cos`, `\tan`, `\sec`, `\cot`,
  `\operatorname{cosec}` and before one that follows an argument ("cosP should be written
  like human typed cos P ← the omml way").

## 2 · Notes beside a line

- A short reason sits at the **end of its own line**, grey, after a "←":
  `… \quad\text{← divide by } \sin^2 A`. Only "←" triggers the grey style; ⇒ and → stay
  black maths. Keep the note short enough that the line still fits — a note that wraps
  drops its line out of alignment.
- A rejected value says **why**, on the line or right under it: `← reject, since
  −1 ≤ sin x ≤ 1`; a square root is written `±` first, then the wrong sign rejected with
  the reason ("square root there should be plus and minus, and write the reason to reject
  the incorrect one", 12 Sep 2026).
- A derivation is shown, not quoted: the half-angle formula comes FROM the double-angle
  formula on the page (`cos 2A = 1 − 2 sin² A` → put `A = Q/2` → …), not stated.

## 3 · Two cases side by side with "or"

- A factorised equation's two cases are solved **side by side**, "or" between them, in the
  SAME math paragraph as the working — his AM 17 Example 3c. Each case aligned at its own
  "=". Not a table, not a box, no gap above it (13 Sep 2026: "you just put them in a box
  instead, and left a large gap … look at how i did it").
- Code shape: `('or', left_aligned, right_aligned)` as a step. The case with more lines
  gets the real alignment marker; the other is set by counted Cambria Math spaces. Long
  lines are split the way he splits them (`basic angle = tan⁻¹ ½` then `= 0.4636`).
  A rejection goes under the rejected case as short text lines.

## 4 · Diagrams and columns

- Columns inside the solution box are welcome when they make the page neater: the
  working on the left, a diagram or an S A T C reference on the right —
  `('cols', [[working…], [('figure', png, 4.2)]], [10.6, 3.9])`. ("you can create columns
  in tables to enhance readability and neatness".) A line in the left column must fit
  ~10 cm; widen the column or split the line rather than let Word wrap it.
- Quadrant work is drawn **like his**: the triangle inside its quadrant on x–y axes,
  signed sides on the legs, Pythagoras beside it, one diagram per angle, the three
  ratios in a ROW under their own diagram (never all six stacked in one column);
  the hypotenuse arrow must not cross a number. Helpers: `trig_figures/quad.py`,
  `trig_figures/astc.py` (see `trig_figures/README.md`).
- Quadrant reasoning is three lines: `cos P > 0 → P in 1st or 4th quadrant`,
  `sin P < 0 → P in 3rd or 4th`, `hence P in 4th quadrant`.
- Figures from the question bank are embedded as stored; hand-drawn art only when the
  bank has none (and then through the bot's figure registry first — CLAUDE.md §Figure
  library).

## 5 · Numbering, sections, spacing

- **Questions and every part are real Word numbering** — the bank's own label decides
  letters `(a)` or romans `(i)`; a part he adds in Word numbers itself.
  Examples: `ws.numbered(parts, 0, fmt, restart=first)` for parts, level 1 for subparts.
  Practice: `ws.Q` / `ws.SQ`, `numbered(…, 1, 'roman')` for roman parts, level 2 for
  subparts; a parts-only question gets `ws.Q([])` so its number sits on its own line.
  ("and can you autonumber to questions and subparts?", 12 Sep 2026.)
- A topic with several strands is **sectioned** (`ws.section("Section A — …")`), the
  **notes at the front of each section**, that section's practice right after its
  examples ("put the notes at the front of each section instead").
- Concept line in bold above `Example N`; the example IS the exam question, verbatim,
  marks right-aligned in `[n]`; `Solution:` then the box with a 1 cm label column.
- **The page rule, every sheet** (13 Sep 2026): a part is never cut across two pages;
  a NEW part may start on the next page; the question, its figure and `Solution:` stay
  with the first part; if the example almost fits and only a little hangs over, tighten
  the spacing so it fits (`scripts/sheet-worker/fit-examples.py`); only a part taller
  than a page is broken, at a sensible line — write it as two rows, the second with
  label `''`. His words: "a new part can go to another page, but not in the middle of a
  part … if the solutions almost fit into a page, just a little left hanging … tighter to
  fit, then do so. otherwise, it is okay to let a part be on another page". His notes do
  it: AM 18 Example 3b breaks between (c) and (d) at the foot of a full page. So
  `keep_together=False` everywhere (gluing a whole box left half a page empty — "there
  is a large gap", 12 Sep). Practice questions and their `[Ans:]` line stay together.
- One `[Ans: (a) …; (b) …]` line per practice question, orange, right-aligned, at the end
  — never after each part.
- No empty paragraphs for spacing; the box hugs its content; a small gap between parts is
  paragraph spacing.
- Notes block: formulas as display maths, ≤ 6 "Mistakes to avoid"; the word "never" does
  not appear on a page.

## 6 · Filing

- A sheet handed over in Dropbox is **his file**. A rebuild goes beside it under a new
  name (`… v2.docx`, `(3rd version).docx`) — check for Word's `~$` lock file first; never
  copy over it (12 Sep 2026, thirty minutes of his edits lost).
- DOCX → PDF through Word from the container folder with a fresh file name each time
  (memory: word-export-container-folder). Never `rw.to_pdf` at a Dropbox path.

## Adding a rule (how this list grows)

1. Quote what Adrian said, with the date, in the section it belongs to (new section if
   none fits).
2. If it is mechanical, implement it in `worksheet_lib.py` so every pipeline gets it for
   free, and name the function here. If it is an authoring judgment, write the exact
   code shape.
3. Commit both together. The skills that render sheets link here; none of them keeps a
   private copy of a rule.
