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
- **A step that applies a formula is TWO lines, not one** (14 Sep 2026: "we can show
  how the formula is being used"). One line puts the expression into the form the
  identity expects; the next applies it. The student has to be able to see the match.

      ✗  sec 162° = 1/cos 162°
                  = 1/(−cos 18°)          ← 162° = 180° − 18°, 2nd quadrant, cosine negative
                  = −1/√(1 − p²)

      ✓  sec 162° = 1/cos 162°
                  = 1/cos(180° − 18°)     ← 162° = 180° − 18°
                  = 1/(−cos 18°)          ← using cos(180° − θ) = −cos θ, here θ = 18°
                  = −1/√(1 − p²)

  The ✗ line does two things at once — rewrite the angle AND apply the identity — and
  hides the identity behind a quadrant sentence. Splitting it gives each move its own
  line and its own note, which is the same instinct as "a new '=' is a new line". See
  §2 for how the second note is worded.
- **Every fraction is numerator OVER denominator — a fraction inside a fraction too.**
  Never `7/(7√5/2)` on one line, never Word's slanted/linear fraction (14 Sep 2026:
  "for fractions, write them as numerator over denominator, even for fractions within
  a fraction"). The library enforces it (`_stack_slashes`, run on every converted
  expression): a `<m:type m:val="lin"|"skw">` becomes a bar fraction, and every bare
  "/" run becomes a real `<m:f>`, taking the operand either side the way the maths
  binds — `a+b/c+d` gives b over c, a bracket group is taken whole, and a "/" inside
  `\text{}` (5 m/s) is left alone. So `\dfrac{\pi}{2}` and `\pi/2` render the same;
  write whichever is clearer. Only caveat: a division inside a grey ← note now stacks
  too and makes that line taller — if a note must stay on one line, word it without
  a division.
- **Function names get a space**: "cos P", "sin x cos y", not "cosP" — the library adds
  the thin space (`_function_spaces`) after `\sin`, `\cos`, `\tan`, `\sec`, `\cot`,
  `\operatorname{cosec}` and before one that follows an argument ("cosP should be written
  like human typed cos P ← the omml way").
- **"cosec A", never "csc A"** (14 Sep 2026: "write csc A as cosec A"). Write
  `\operatorname{cosec}` or plain `\csc` — the library rewrites the latter
  (`_cosec`, in `_latex_to_omml`) so the sheet always says cosec. Same for the
  reciprocal identities and anything quoted from a question.

## 2 · Notes beside a line — and the words everywhere else

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
- **A note carries the REASON, not just the conclusion** — "a little more explanation
  wherever it helps a student" (14 Sep 2026, the three edits he made to the S3
  Trigonometry sheet). The student cannot see the step you skipped in your head, so
  the note is the place to say it. Three shapes, from his own corrections:
  - **Say where the fact came from, not just the fact.**
    ✗ `← reject the negative: Q/2 is in the 2nd quadrant, sine positive`
    ✓ `← reject the negative: since Q is in 4th quad, Q/2 is in the 2nd quadrant,
      hence sine positive`
    The quadrant of `Q/2` is the thing being asserted — the note has to start from
    what the question gave (`Q` in the 4th) and walk to it. "since … hence" is his
    wording.
  - **Name what is being used, in words.** A bare formula label is not a sentence.
    ✗ `← sin(A − B)`  ✓ `← using the formula for sin(A − B)`
  - **A line that silently substitutes a known value gets a note saying so**, even
    when the substitution feels obvious to us: `= (1/√2)(2/√5) − …` earned
    `← know the trigonometric ratios: sin π/4 = 1/√2`. The exact ratios, the special
    angles, a standard result quoted from the notes — if the value appeared without
    being computed on the page, say where it comes from.
  - **Quote the formula in general form, then bind it to this question** (14 Sep
    2026). Naming a formula is not the same as showing it work:
    ✗ `← 162° = 180° − 18°, 2nd quadrant, cosine negative`
    ✓ `← using cos(180° − θ) = −cos θ, here θ = 18°`
    The general identity with its own letter, then what that letter is on THIS line.
    The angle rewrite that sets the line up is a note of its own on the line above
    (`← 162° = 180° − 18°`) — §1, a step that applies a formula is two lines.
    A quadrant sentence is a different tool: it justifies a SIGN the student has to
    decide (§3's reject-the-negative case), not an identity that already carries its
    own sign.
  This is authoring judgment, not something the renderer can supply: it can only
  warn. `find_terse_notes()` prints a hint at `save()` for a ← note that carries no
  words of explanation at all (a bare formula or symbol), which usually means one of
  the three shapes above is missing. It never blocks a save — a genuinely one-word
  note is fine.
  The countervailing rule still holds: a note that WRAPS drops its line out of
  alignment. When the explanation will not fit beside the line, put it on its own
  short line under the working rather than shortening it into a label.
- **Plain words, said straight — this is a maths sheet, not an English lesson**
  (14 Sep 2026: "don't use fancy words like 'awkward' (not teaching english here),
  explain simply and directly"; "saying the lonely 1 is … is cryptic"). The rule
  covers the lede sentence above a solution, the line introducing a part, and the
  ← notes alike. Two habits to drop, both from the S3 Trigonometry sheet:
  - **No metaphor, no personification, no nickname for a term.** Call it what the
    student can see on the page, and say what to do with it.

        ✗  the target has cot A, so divide by sin² A; the lonely 1 is sin² A + cos² A
        ✓  the target has cot A, so divide by sin² A; replace the 1 with sin² A + cos² A

  - **No adjective that judges the maths** — awkward, nasty, messy, ugly, tedious,
    elegant, trivial, obvious. They name a feeling instead of a move, and a student
    who does not share the feeling learns nothing from them.

        ✗  A "hence, solve" part means: replace the awkward side by the identity,
           then solve the simpler equation.
        ✓  A "hence" question requires the use of the previous part — observe to see
           how you can use the previous part

    The ✓ is his own rewrite. It says what the word "hence" obliges the student to
    do, in the words the question uses, and then tells them where to look.

  The test for any sentence on the sheet: it names what the student must DO, in the
  vocabulary of the question. `find_fancy_words()` prints a hint at `save()` for the
  judging adjectives; metaphor is authoring judgment and cannot be checked.

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
- **A reference diagram sits beside the line it is for** (14 Sep 2026: "put the ASTC
  near where the equation is, so student know that ASTC is for that equation"). An
  S A T C square floated at the top of the box reads as decoration for the whole
  solution; it belongs level with the equation whose quadrants it settles — the
  `tan A = −3/2` branch, its basic angle, the `A = 180° − 56.3°` line. So do NOT wrap
  a whole solution in one `('cols', …)` with the diagram in the right column. Write
  the lines above it as ordinary steps, then open the columns at the line the diagram
  serves: `('cols', [[those few lines], [('figure', astc_png, 3.9)]], [10.6, 3.9])`.
  Two cases that each need a quadrant square get one each, beside its own case.
- **Notes can use columns too, outside any solution box** — `ws.columns([col, col, col],
  [5.33, 5.33, 5.33])`, each column holding the same step shapes a solution row takes
  (a parts list, a bare latex line, `('figure', png, cm)`). A set of related pictures
  goes side by side so the student reads them as one picture (14 Sep 2026, on the trig
  graphs: "show the three basic graphs (perhaps in three columns), with their
  max/min/amplitude/centreline/period formula/period"). Keep every column the same
  shape — the equation line first, then the figure, then the short facts — so the eye
  compares straight across. The widths must sum to about 16 cm.
- **Every GRAPH carries named, arrowed axes** (14 Sep 2026: "the graphs should have x
  and y axis labelled with the arrow for x-axis and y-axis (it was not drawn in the
  trigonometric worksheet you presented)"). The two axes cross at the origin, each one
  ends in an arrowhead, and each one carries its name — `x` and `y`, or `\theta` and `y`
  when the angle is in radians. Draw them with the shared helper, never with spine code
  of your own: `from axes import arrow_axes` then `arrow_axes(ax, xlabel='x', ylabel='y')`
  AFTER the limits are set (`trig_figures/axes.py`). The helper also lifts the axis
  above the curve and puts a white outline round the numbers, so a curve passing through
  a tick label still leaves it readable. A quadrant reference square (`astc.py`,
  `quad.py`) is not a graph — it keeps its plain crossed lines. And the curve is named
  on the curve, not down the side of the axis: a rotated y-axis label saying the same
  thing twice is removed.
- **A graph is taught as a series, not as one finished picture** (14 Sep 2026: "showing
  step by step how to draw a graph, properly show a series on diagrams… then copy the
  graphs… use different colours for each graph on the same diagram"). One panel per
  step of the SAME axes, each adding one thing: maximum and minimum first, then the
  centre line, then the period and how many cycles fit the range, then the five points
  of one cycle a quarter period apart, then that one cycle drawn, then the cycle copied
  along — each copy in its own colour on the same diagram, with a closing line saying
  the colours only show the cycle moved along and in the exam all of them are one pen.
  Pattern: `trig_figures/drawsteps.py`.
- **More than one graph in the range means colour code them — colour only, no numbers**
  (14 Sep 2026: "if there are more than 1 graph, we should colour code to highlight the
  number of graphs", then "for the trigo graphs, don't have to put the numbers"). One
  colour per graph, so the student COUNTS the graphs off the picture instead of being
  told the answer; a numeral written above each one says the answer out loud and is
  clutter, so the graphs carry none. One graph in the range is drawn plain black — a
  colour there counts something there is nothing to count. Palette and helper live in
  `trig_figures/axes.py` (`CYCLE_COLOURS`, `cycle_colour(i)`); every figure uses the same
  one, so graph 2 is the same orange on the step-by-step panels as on the variation
  graphs. **Two graphs that touch never take the same colour** — the palette holds five
  because a tangent range can hold four whole graphs plus a part-graph at each end.
- **One tangent graph is the piece between two asymptotes** (14 Sep 2026, pointing at the
  90°–270° branch of `y = tan x`: "this is considered one tangent graph -> this should be
  same colour, then another set of this should be another colour"). So the piece, not the
  period counted from 0, is the unit of colour: on `y = tan x` over 0°–360° the tail at
  0°–90°, the whole branch at 90°–270° and the head at 270°–360° are three DIFFERENT
  colours. A part-graph at the start of the range and a part-graph at the end belong to
  different graphs and must never share a colour — an earlier version gave both ends the
  same colour to say "between them they make one", and he corrected it. How many graphs
  are in the range is read off the period, not counted off the colour bands.
- **A tangent graph is drawn to 360°, not to one period** (14 Sep 2026: "for tangent
  graph draw until 360 degrees, to illustrate how many tangent graph there are in
  360degrees"). The point of the picture is the count, and a picture that stops at one
  period has nothing to count. One tangent graph is only 180° wide, so `y = a tan bx`
  has **`b` tangent graphs in 180°, and `2b` in 360°** — do NOT carry over the sine and
  cosine rule of "`b` graphs in 360°", it gives the wrong number for tangent. The range
  ends usually cut a graph in half; each half is part of its OWN graph and is coloured
  apart from the other end (see the bullet above). Pattern: `trig_figures/tgraphs.py`
  `variation(..., pieces=…)`, one `(from, to, colour)` run per piece between asymptotes.
- **A shifted sine or cosine shows its centre line, dotted** (14 Sep 2026: "the graph in
  the solution should show the centre line (dotted)"). Any sketch of
  `y = a sin bx + c` / `y = a cos bx + c` with `c ≠ 0` — the SOLUTION graphs as much as
  the teaching ones — carries a thin black dotted line at `y = c` across the drawn range,
  under the curve, with no label of its own (the value is already a y-tick). Two curves
  on the same axes get two centre lines, the fainter curve's at `alpha=0.6`. Helper:
  `trig_figures/draw.py` `centre_line(ax, c, x0, x1)`.
- **Draw a graph even when the question never asked for one** (14 Sep 2026, Example
  4d(ii) — the tide `h = 1.2 cos(4πt/25) + 5` and a boat that needs 4.2 m: "question did
  not ask for a graph, but would be good if there is a graph to illustrate how to solve
  the question - the visual will be very helpful"). The arithmetic answers it; the
  picture shows WHY, and a worded context question — depth, height, temperature, a
  Ferris wheel — is exactly where a student loses the thread. Put four things on it:
  the model curve, the level the question tests it against (dashed, labelled with what
  the level IS — "h = 4.2 (draft)", not just a number), the stretch where the answer is
  no (lightly shaded), and the moment the question names (a dashed drop to the curve with
  its value beside it, `h = 3.88 < 4.2`). The graph sits in the right column beside that
  part's working, never at the top of the box — §4's "beside the line it is for". Helper:
  `trig_figures/context_graph.py` `threshold_graph(...)`; the centre line rule applies to
  it like any other shifted cosine.
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
- **A sub-part label gets its own column** (14 Sep 2026, on a solution box whose "(a)"
  sat in the label column while "(i)", "(ii)", "(iii)" were typed at the head of the
  working: "there should be two columns separately to accomodate (a) and (i) / you can
  look at how i did it in my notes worked examples"). His notes do it as a THREE-column
  table — outer label, sub label, working (`AM 16 Trigonometric Graphs.docx`, the
  (iv)(a)/(iv)(b) table: 0.94 cm, 0.75 cm, the rest) — so the sub labels line up under
  each other and the working starts at the same x on every row. A "(i)" typed into the
  working pushes that first line right and nothing below it lines up. Pass the label as
  a PAIR and `solution_box` builds it; a row with no sub label merges the sub column into
  the working, so an unlabelled row still uses the full width:

  ```python
  w.solution_box([
      (('(a)', '(i)'),  ['period = …']),
      (('',    '(ii)'), ['q = …']),
      ('(b)',           ['…']),          # no sub-part: merged row
  ], keep_together=False)
  ```

  The outer label is repeated only on the FIRST of its sub-parts and left `''` on the
  rest, the way he writes it.
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
- **No rubric line under a "Practice" heading** (14 Sep 2026: "don't have to put the
  statement 'answers are at the end of each question…'"). The heading goes straight
  into question 1. The `[Ans:]` line is visible at the foot of every question, so
  saying so is noise, and his students already show working. Stripped from `rw.py`,
  `bank_worked_sheet.py` and the `scripts/revision-builders/*` builders. A line that
  carries REAL information about the questions still belongs there — "Each question
  refers to the diagram printed with it" stayed; only the boilerplate half went.
- **The first line of a table gets 2 pt above it** — spacing Before 2 pt, After 0 pt,
  line spacing 1.5, no indent, exactly as his Paragraph dialog reads (7 Sep 2026: "2px
  spacing from the top of the box for the first line only"; extended 14 Sep 2026 to
  EVERY table: "for the first line of a table, leave the spacing before as 2pt").
  `solution_box` had only ever set it on its own top row, so the nested `('cols', …)`
  tables and the Notes tables started lower than the rest; `_table_first_line_gap`,
  called from `save()`, now sets it on the first paragraph of every first-row cell of
  every table, nested tables included. A figure in a first row loses its usual 4 pt —
  that is the rule, not a bug.
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
