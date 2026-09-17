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
  graphs. **Two graphs that touch never take the same colour** — the palette holds five.
- **`y = a tan bx` has `b` graphs in 360° — tangent is counted EXACTLY like sine and
  cosine** (14 Sep 2026, over three corrections on the same picture: "this is considered
  one tangent graph -> this should be same colour, then another set of this should be
  another colour", then "you misunderstand. this is ONE tangent graph", then, on
  `y = tan 2x` drawn branch by branch, "this should be two colours (left one colour from
  0 to 180) and right one colour (from 180 to 360)"). So **one tangent graph is 360°/b
  wide**: `y = tan x` is ONE graph filling 0°–360°, `y = tan 2x` is TWO (0°–180° and
  180°–360°), `y = 2 tan ½x` is HALF a graph in the range. **An asymptote does NOT end a
  graph** — `y = tan 2x`'s 0°–180° block holds a half-branch, a whole branch and another
  half-branch, and it is one graph. Do not re-derive the count from tan's 180° period and
  do not "correct" his captions: earlier sessions coloured each branch separately (three
  colours on `y = tan x`), then coloured only the middle branch and greyed the two stubs,
  and he rejected both. The count is `b`, the colours are `b`, and the colour boundaries
  fall at the multiples of 360°/b.
- **A single graph, or less than one, is drawn plain BLACK — never coloured, never grey**
  (`y = tan x` and `y = 2 tan ½x` over 0°–360°). A colour on the picture is a graph you
  can count; with nothing to count a colour says the wrong thing. `cycle_colour(None)`.
  `cycle_colour('part')` (grey) exists for a genuine offcut beside graphs that ARE being
  counted, which on the tangent pictures never happens now that a graph is 360°/b wide.
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
- **Type on a figure is sized for the PAGE, not for matplotlib** (14 Sep 2026, looking at
  the Example 4d sketch `f(x) = 4 sin 3x − 2`: "also, fonts can be larger, especially for
  the equation of the graph"). `trig_figures/draw.py`'s `fig(w,h)` draws every figure at
  **1.9×** its target cm size (`figsize=(w/2.54*1.9, …)`), saves it at `dpi=200`, and the
  document then places it back at `w` cm — so every point size on the axes lands at about
  **0.53×** what it says. `fontsize=8` prints at roughly 4.2 pt and the `font.size: 9`
  base at roughly 4.7 pt, under half the 11 pt body text: right in the plot window, far
  too small on paper. **Choose the size you want ON THE PAGE and multiply by 1.9.** The
  equation of the graph gets the biggest lift — it is the label a student reads first,
  and the one he named. Same complaint, same family, once before: "make the Pythagoras'
  theorem part font larger" went to 11 pt. Whenever a generated figure is judged, judge it
  at its printed size, not on screen.
- **The NUMBERS along the axes are sized through `arrow_axes`, nowhere else** (14 Sep
  2026, the axis numbers on the Graphs of Functions figures printing at half the size of
  the axis names beside them). `arrow_axes` moves both spines onto the origin, and that
  move REBUILDS the tick artists — so a size given earlier by
  `set_xticklabels(..., fontsize=…)` or `ax.tick_params` is thrown away without a word and
  the numbers fall back to matplotlib's own 10 pt, which on a 1.9× figure prints at about
  5 pt. Pass `tick_size=PT(8.0)` (the page size × 1.9, same scale as `size`) to
  `arrow_axes` instead, and let it set them after the spines have moved. Measure a doubted
  figure rather than trusting the call: crop a digit and an axis name out of the PNG and
  compare their glyph heights — they should be close.

- **A label goes ALONG its line when there is no room beside it** (15 Sep 2026, the
  speed-time sheet's answer graph: two journeys crossing on the same axes, neither with
  a clear gap to its left or right). A label beside a steep line either lands on the
  other line or on the arrow between them, and a white bbox big enough to protect it
  erases what it sits on — which §4 forbids. So set the text ON the line, rotated to the
  line's own screen angle, at a fraction of its length where nothing else is drawn:
  transform both endpoints through `ax.transData`, take
  `degrees(arctan2(dy, dx))` of the transformed pair, and pass it as `rotation=` with
  `rotation_mode="anchor"`. The angle must be measured in SCREEN space, not data space —
  a graph whose axes have different scales tilts the line, and the data-space angle
  writes the label off the line. Call `f.canvas.draw()` first, after the limits and
  ticks are set, so `transData` is the one the saved figure uses.

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
- **Notes may break across a page; a question may not** (15 Sep 2026, the speed-time and
  graph-paper sheets: a section's notes and its first example sat in one block, so the
  blanket glue held them together and Word pushed the whole thing forward — two thirds
  of the first page of every section came out empty). Notes are not a part, so the page
  rule does not protect them. Call `ws.notes_end()` after a section's notes and before
  its first example: it closes the run so each paragraph paginates on its own. A bold
  heading still holds the line beneath it, so nothing is stranded at the foot of a page.
- **A bold heading at the end of a block glues forward to what follows** (15 Sep 2026,
  the bare word "Practice" printing alone at the foot of a page with question 1 over the
  fold). `_finish_block` now carries `keep_with_next` on a trailing bold-only paragraph.
  A heading is a promise about what comes next; alone at a page foot it reads as the end
  of the sheet.
- **A part's lead-in glues to its first roman sub-part** — `ws.keep_with_next()` after a
  line like "(d) By drawing a suitable tangent," so the bare "(d)" cannot sit alone under
  the page rule while (i) and (ii) start the next page. The page rule says a part is
  never cut; a lead-in and its romans are one part, even though Word sees three
  paragraphs.
- One `[Ans: (a) …; (b) …]` line per practice question, orange, right-aligned, at the end
  — never after each part.
- **A practice sheet has no working space** (17 Sep 2026, on the S4 AM Circles sheet:
  "formatting is not great"). Questions follow one another straight down the page,
  like his own practice sheets: `Worksheet()` already defaults to `working_space=0`, so
  never pass a gap in. **The `[Ans:]` line fits on ONE line**: if the bank's key wraps
  (a long proof-style answer, a range written as "a < p < b or c < p < d"), pass a
  shorter override in `answers=` ("(b), (c), (d) shown", "1 < |p| < 9") that says the
  same thing. Open the rendered pages before sending; the text extract hides both faults.
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
- **A marked paragraph's text stops 1.4 cm short of the right edge** (14 Sep 2026). The
  `[n]` sits at a right-aligned tab at 15.5 cm; a last line that runs past about 15.0 cm
  eats that tab — LibreOffice prints `…significant figures.[4]` flush, Word throws the
  `[n]` into the margin. `_add()` therefore sets `right_indent = 1.4 cm` on any paragraph
  carrying marks (0.5 cm beyond the tab + the widest label `[10]` + a gap), so the marks
  column is always clear. Only marked paragraphs narrow; everything else keeps the full
  16 cm measure.
- **A question's table of values is a real table, not a line of LaTeX** (15 Sep 2026, the
  graph-paper sheet). The bank stores a table of values two different ways — a markdown
  pipe table in some rows, a LaTeX `array` in others — and neither prints as a table a
  student can read a value off. `ws.data_table(rows, label_w_cm=None)` draws it with
  Word's own grid: the `x` row above the `y` row, each cell its own maths, the first
  column (the row's name) narrow. The builders parse whichever form the row carries and
  hand the values to `data_table`; a table left as text is a defect, not a style choice.
- **A marks tag stored inside a part's own text is stripped** — `strip_marks(text)` in
  `scripts/revision-builders/build_lib.py`. Some rows print "[3]" inside
  `question_text` as well as carrying `marks: 3`, so the part rendered with the marks
  twice, once mid-sentence. The tag belongs in the right-aligned `[n]` column and
  nowhere else.
- **A bank row may be overridden, in the open, in two places only** — `answers=` when the
  stored key is wrong, `stems=` when the stem is unusable (it leaks its own answer, or
  repeats a part label the parts list uses for something else). Both take
  `{id: replacement}`, both are read by `render_practice`, and both PRINT what they
  changed at build time — "** answer OVERRIDDEN (bank key is wrong): 507982ac", with the
  bank's text and the used text under it. Every entry carries a comment at its call site
  saying what is wrong with the row. Nothing about a bank row is quietly corrected: an
  override is a fault to report back, and the build log is the report.
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
- **Export from Word's own container folder, not from a scratch folder.** Word is
  sandboxed: asked to open a file anywhere it has not been granted, it puts up a modal
  *"Grant File Access — Microsoft Word needs access to the folder named X. Select the item
  to grant access."* and waits for a human. From the outside that is indistinguishable
  from a hang — `osascript` never returns, Word sits at 0% CPU, and `sample <pid>` shows
  `runModalForWindow`. `~/Library/Containers/com.microsoft.Word/Data/Documents/adrianmath-export`
  needs no grant. If a script is already stuck there, `set display alerts to none` before
  the `save as` lets it through (15 Sep 2026, the E Math book — twenty minutes read as a
  Word hang before a `screencapture` showed the dialog; when a Word export looks hung,
  screenshot the screen before diagnosing anything).
- **Never export a document Word already has open, and never trust `open file name`'s
  return value.** Two traps, both of which produce a *plausible wrong answer* rather than
  an error. (a) `set d to open file name …` returns nothing in this Word build — `d` is
  unbound and the `save as` dies with `-2753 "variable d is not defined"`; use
  `open file name …` then `set d to active document`. (b) Word resolves a document by
  NAME, so `save as document "x.docx" …` — and an `open` of a name already on screen —
  acts on whatever it finds, which with several scratch books open is quite possibly not
  the one you meant. 15 Sep 2026 this exported the *baked* E Math book while claiming to
  export the un-baked one, produced a 90-page PDF where the file itself paginates to 97,
  and cost an hour of chasing a fault that did not exist. **Copy to a fresh unique
  filename, open that, export that** — and if a page count surprises you, re-run it from a
  clean copy under a new name before believing it.

## 7 · Stitching sheets into one book

Adrian, 15 Sep 2026, on the overall S3 revision book: "make it into a nice document, with
similar formatting for titles and subtitles … make a NEW document (do not alter the
existing ones)", then "cut trig practice for consistency". A merged book keeps ONE copy of
everything a `.docx` stores once, so any sheet that disagreed with the others about a
document-wide default is silently re-laid-out. Bake the sheet's own value onto its
paragraphs before merging — the sheet on its own is then unchanged, and the merge can no
longer reach the setting.

- **`defaultTabStop`** (settings.xml). Twelve of the thirteen S3 sheets sit at Word's 720
  twips; Circles alone was written at 397. In the book every tabbed line in Circles
  advanced nearly twice as far as it was written to, so the `[1]` / `[2]` mark counts at
  the end of each part were pushed past the right margin and wrapped onto lines of their
  own. Three extra lines split a solution table and the sliver printed as a blank page.
  Write the sheet's own ladder onto every paragraph holding a tab (`prep.py bake_tabs`),
  starting past any explicit stop and past the paragraph's own indent.
- **Normal's font and size** reach the paragraph MARK, which is a real character: a
  `pPr/rPr` with no `w:sz` takes the master's Normal and puts a floor under the line.
  608 of Trigonometry's 713 marks had none, worth 2 pages at 1.5-line spacing.
- **`m:ctrlPr`** carries the run properties of the parts of an equation that are not typed
  characters — the fraction bar, the radical sign, the delimiters — and is what scales the
  equation as a whole. 833 of Trigonometry's 935 equations had no size on it.
- A sheet that still disagrees after baking gets a **scoped body style** of its own
  (`TrigBody`), never a change to a shared one: `ListParagraph` is used by 824 paragraphs
  elsewhere in the book, so it is cloned, not edited.
- **Normal's own `pPr`** goes the same way, and it is the one that moves whole pages.
  Every sheet `worksheet_lib` writes declares Normal as Times New Roman 9.5 pt at 1.5 line
  spacing with no space before or after; the ten sheets Adrian typed leave Normal bare. In
  the E Math book the four `worksheet_lib` sheets lost theirs to the master's and grew
  +1, +2, +2 and +2 pages — his page breaks, moved — while the other ten matched their
  solo exports exactly. Fix: lift that Normal out as `SheetNormalWS`, put `pStyle` on every
  plain paragraph of those sheets, and re-base the styles that were `basedOn` Normal
  (`SubQuestion`, `WSTitle`, `WSSubtitle`). Direct paragraph formatting still wins, so
  nothing else moves.
- **Find the guilty part-file by substitution, not by reading XML.** Copy the sheet, swap in
  the BOOK's `styles.xml` (then `settings.xml`, `theme1.xml`, `fontTable.xml` one at a time),
  export each and count pages: the one that reproduces the growth is the cause, and putting
  the single style back into it must remove the growth again. Two 30-second exports settle
  what an afternoon of theorising will not.

**Three ways a merged book grows a blank page**, all found on this build:

1. The document ends on a table, and a Word document may not — Word supplies an implicit
   12 pt paragraph that can spill. Write that paragraph explicitly, 1 pt with no spacing.
2. A page break alone in its own empty paragraph: the break fires, then the remains of
   that paragraph take the first line of the new page. Carry the break on the next block
   as `pageBreakBefore` (on a table, that means the first paragraph of the first cell) and
   delete the paragraph.
3. An empty paragraph immediately BEFORE a forced page break — invisible normally, but if
   the block before it fills its page exactly it opens a page of its own and prints
   wholly blank. Delete it.
4. A hard page break before a section heading, on a page that already ended on the bottom
   margin. The break has nothing left to push, so it pushes nothing onto a page of its
   own. A section that starts a fresh page carries `page_break_before` on the heading
   itself — `ws.section('Section F — …', new_page=True)` — because Word drops that
   property when the heading is already at the top of a page (15 Sep 2026, the JC2 P&C
   manual had two such blanks, before Sections F and G).

`pdftotext` cannot tell a blank page from an image-only one, and it reports a page holding
only an empty table row as blank too — cross-check with `pdfimages -list` and render the
page with `pdftoppm` before believing either answer.

Every section is measured against its own standalone export, page for page. A sheet's solo
PDF usually ends on a trailing blank page of its own; discount it before calling a
difference a loss.

## 8 · Watermarks — chosen, not switched on

Adrian, 15 Sep 2026, after twenty-two candidates over real pages of his own book: **"i like
T, U and V, put them into memory (not using them yet, but may and iterate later)"** — and,
later the same day, of the earlier pattern batch: **"i like this watermark as well, which
was G."** So:

- **A watermark goes on only when he asks for it.** Adrian, 16 Sep 2026: **"watermark only
  when i request for it, otherwise no watermark"**. This is the whole rule — not a default
  that can be talked round by "it's a keeps-book", not something to offer because a sheet
  looks bare. No request, no carpet. `worksheet_lib.py` has no `watermark=` argument and
  must not grow one until he asks for that too.
- The **four** he liked, the engines that draw them, and the four typographic rules that make
  a tiled carpet look set on purpose live in **`watermark/`** (`README.md` + `designs.py` +
  `patterns.py`). **T, U and V are carpets** tiling the words **`AdrianMath Tuition`** at
  more than one point size — T level, U high-contrast, V in Georgia; `designs.py`. **G is
  not a carpet**: one large AM badge, brand navy `#1e3a5f`, 11%, in the middle of the page —
  `patterns.py` `big_icon(pct=11, colour=NAVY)`. It is the quiet one, for a page that already
  carries dense working. Start from these four when he comes back to it, not from scratch.
- Two things must be fixed before any of it ships: the figure helpers must
  `savefig(..., transparent=True)` (matplotlib saves opaque white, which would punch a white
  rectangle through the carpet at every figure), and **a carpet goes only on what a student
  KEEPS** — anything that comes back for marking gets the footer line alone, because the
  ScanSnap and the AI marker read the page as an image.

### Putting one on a finished book — `watermark/book/`

First asked for 16 Sep 2026: the Sec 3 E Math revision book, **T at 70 %**, a cover page, his
own logo. `watermark/book/bookify.py` does the whole job on a `.docx` and writes a NEW file;
`cover.py` draws the cover. What that build had to learn:

- **Judge ink by pixel value, not by eye.** T at 100 % peaks at grey 213 on white, at 70 %
  at 226, at 40 % at 239 — and 239 will not survive a laser print. Worse, image previews in
  a terminal or a chat client are contrast-boosted, so a carpet that measures 243 grey can
  *look* like solid type on screen. Measure: `min(i for i,v in enumerate(im.convert('L')
  .histogram()) if v)` over a patch with no black in it. 70 % is the practical floor for
  something meant to print.
- **The figures are the real work, not the header.** The EM book had **104 of its 110
  pictures opaque white**; every one would have printed as a white rectangle punched through
  the carpet. `alpha_figures()` takes the white out using `min(R,G,B)` as the whiteness — so
  coloured ink and grey shading stay — with a ramp (250→234) rather than a threshold, so
  antialiased edges survive. JPEGs have no alpha at all: they are re-encoded as PNG and
  their `document.xml.rels` targets rewritten. Look at the low-white ones first; if any were
  photographs they would have to be left alone.
- **A stitched book can have no headers at all.** This one had eleven `<w:sectPr>` and zero
  `<w:headerReference>`. A section without one inherits the previous section's, so a carpet
  wired into "the header" reaches nothing. Wire every section explicitly, and give the cover
  its own first section pointing at an EMPTY header part.
- **LibreOffice may refuse the book outright** — it crashed on this one, untouched, before
  any edit. That is not evidence you broke the file. Export through Word, and prove the file
  is sound with an XML parse of every part in the zip plus a page count against the
  untouched original exported the same way (64 pages + 1 cover = 65 — the Dropbox PDF beside
  it was a day stale and said 90).
- **A stitched book's contents links are probably dead — check them, and repair them with
  `contents_links.py`.** Adrian, 16 Sep 2026: **"the hyperlinks to each topic does not
  work"**. They *look* alive: `<w:hyperlink w:anchor="secNN">` renders as a blue live link
  whether or not the bookmark exists. When per-topic files are stitched into one book each
  source brings its own `w:id="0"` bookmark and only one survives — his book had 14 anchors
  and exactly ONE bookmark. `contents_links.py in.docx out.docx` re-derives each destination
  from the link's own text (`difflib` at 0.80, so "Graphs on Graph Paper" in the contents
  still finds "Graph on Graph Paper" in the body) and bookmarks the **running banner** at the
  top of the topic page, not the title halfway down it — styles are no help, only 5 of these
  14 headings used Heading 1, but the banner recurs at every `<w:pageBreakBefore/>`. Two
  traps: `<w:bookmarkStart>` goes AFTER `<w:pPr>` (pPr must be a paragraph's first child),
  and a section break can leave a **spare banner line at the foot of the page before** the
  topic — of two adjacent banners the topic is the second, the one with the page break. Get
  that wrong and the link lands at the bottom of the previous page.
- **The way back is a line in the header, so nothing reflows.** He also asked for
  backlinks. Page geometry here is `pgMar top=1134` (2 cm) over `header=709`, which leaves
  room for one 8 pt line — a right-aligned grey `↑ Contents` hyperlink added to the
  watermark header costs **zero** body reflow and rides on every page but the cover. An
  internal `w:anchor` link needs no relationship entry and survives Word's PDF export. Run
  `contents_links.py` AFTER `bookify.py`: it hangs the backlink on the headers bookify makes.
  It points at the **contents page**, not the cover — that is the page that makes it useful.
- **Prove the links in the PDF, not the docx.** Word writes an internal link as
  `<< /Dest N 0 R … /Subtype /Link >>` — no `/GoTo`, no `/Names`, so grepping for those says
  "no links" on a perfectly good file. Resolve each `/Dest` object (`[ <page obj> /XYZ x y ]`)
  and map the page object through the `/Kids` arrays: 14 topic destinations on 14 distinct
  pages, each at the page top (y ≈ 785 of 842), and one contents destination collecting the
  backlink from all 64 non-cover pages.
- **The macOS prompt is not Claude Code's.** Copying into `~/Library/Containers/com.microsoft
  .Word/…` is "data from other apps" to TCC and it asks the terminal, once per data domain —
  bypass-permissions mode does not cover it, and it reads exactly like a hang. `screencapture
  -x` to see it (memory: `word-export-container-folder`).

## Adding a rule (how this list grows)

1. Quote what Adrian said, with the date, in the section it belongs to (new section if
   none fits).
2. If it is mechanical, implement it in `worksheet_lib.py` so every pipeline gets it for
   free, and name the function here. If it is an authoring judgment, write the exact
   code shape.
3. Commit both together. The skills that render sheets link here; none of them keeps a
   private copy of a rule.
