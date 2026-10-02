# FEEDBACK — corrections from Adrian's reviews. Every entry is a BINDING rule.

> Contract (from the create-teaching-notes skill): when Adrian corrects an
> output, the generalizable rule lands here and the same correction must never
> happen twice. Newest entries at the bottom.

## 2026-08-30 — readability of worked examples / self-study sheets

Source: Adrian's review of the "Calculus Essentials" self-study sheet
("sentences are being written continuously again, need better readability —
align at equal sign").

1. **One idea per line, everywhere.** Explanation prose must never run
   multiple thoughts into one continuous paragraph. Each sentence/thought
   starts its own line (same rule as the student-facing card content).
2. **Equation steps align at the equals sign.** In every worked solution,
   consecutive equation steps go ONE PER LINE with their `=` signs vertically
   aligned — the way the working is written by hand. Mechanism in DOCX: an
   OMML equation array (`m:eqArr` with alignment on `=`), or a borderless
   two-column layout (LHS right-aligned | `= RHS` left-aligned), or a fixed
   tab stop at the `=` column. Never a run-on line of `a = b = c = d` when it
   is a derivation — chains break into aligned continuation lines (`= …`).
3. **A chain never shares a line with prose.** Prose introduces the step
   above the maths; the maths lines stand alone.

## 2026-08-30 — Adrian's own edit of the two pilot sheets ("Practice Again")

Source: diff of Adrian's sent-to-student version ("PRACTICE AGAIN — Learn from
A Math 2021 Paper 1", 4pp) against the generated "First Moves" + "Calculus
Essentials" sheets. Binding rules:

1. **One sheet per assignment, Example→Practice pairs, numbered straight
   through** (Example 1..8 / Practice 1..8). No section machinery.
2. **Kill the rule-box scaffolding.** No TRIGGER/FIRST LINE/WHY IT IS ALWAYS
   SAFE boxes, no memory-aid chants, no recap box. The teaching lives INSIDE
   the annotated worked solution; at most a 1–2 line italic strategy opener in
   the solution box ("The bases 6 and 3 look different, but 6 hides a 3…") and
   the occasional 1–3 line mini-box for a single formula.
3. **Headings are plain skill phrases**, not rule numbers: "Differentiating a
   square root of a linear expression", "Integrating Power −1 VS Integrating
   Other Powers", "Writing dr/dV from dV/dr".
4. **Teach by contrast where possible** — one worked pair showing BOTH cases
   side by side (the ∫3/x² and ∫1/(3x−5) family in one example) beats two
   separate rules.
5. **Examples chain**: reuse an earlier example's result explicitly ("From
   Example 5: … ← carried forward") instead of restarting.
6. **More practice, escalating**: 2–4 questions per skill, later ones mixing
   in the next idea (chain rule practice ends in product-rule combos).
7. **Colour discipline**: red = the one danger line only ("Only a power of
   exactly −1 gives ln", "don't forget to power reduce by 1") and red-marked
   offending terms; blue = check/verify lines ("Check: a derivative times its
   reciprocal must equal 1 ✓") and the key substitute-BEFORE rule; grey = ←
   annotations and Common Error working. Title = plain, references the source
   paper ("Learn from A Math 2021 Paper 1").
8. **Embedded verification culture**: show the check line with a ✓, and
   disprove the Common Error numerically ("test it: … ≠ 1").
9. **A side "Note:" panel** beside the working (not above it) for the
   conceptual rule, with an italic warning sentence ("If your gradient still
   contains x, you are not ready to write the line").
10. **Scope: one wave at a time.** Deliberately leave whole topics out of a
    sheet rather than overwhelm (Polynomials / Plane Geometry / Integration
    (Area) deferred to wave 2 for this student).

## What earns a practice question (31 Aug 2026 — Sophie's A Math 2021 P1)

Adrian read the first self-study sheets and drew the line that had been missing:
**practice is for what a student cannot yet do, not for what they got wrong.**

The sheet had opened by saying every skill on it came from a question where
"your method was already right — the marks went in the last line", and then set
practice on all of it. That is precisely the category that must NOT be
re-practised. A student whose method was right does not need to do it again;
they need to be shown the line and left alone.

Three tiers, and the sort decides the sheet:

- **Teach and practise** — conceptual and method gaps: the shoelace area (a
  wrong idea of how an area is obtained), the weather balloon (a
  differentiation-technique gap). These come first.
- **Show, don't drill** — arithmetic and careless slips, one line each, no
  practice: dividing (−56 + 14√2) by −14 and flipping only the first sign;
  dividing by an extra 60 when the rate was already per second; −48 ÷ 8 written
  as +6.
- **Optional** — real but slight, worth knowing, drilled only if there is time.
  Clearly marked, at the back. The trigonometry slips on this paper.

Two rules that fall out of it:

- **Target the missing skill, not the question's topic.** The weather balloon
  sits inside a rate-of-change question, but the marks went on carrying a
  constant multiplier through a derivative. So set differentiation-technique
  practice, not more rates.
- **Rank by damage, not by paper order.** A major conceptual error outranks a
  topic that only produced slips — the area question before the trigonometry.

And the constraint behind all of it: **their time is limited.** A sheet that
drills everything they got wrong is a sheet that does not get done.

## What Adrian changed in Wave 2 (31 Aug 2026) — read before authoring a sheet

The generated sheet and the copy he actually sends differ in six ways. Every one
is a rule.

**Generated:** 5 core sections + 1 optional — area · identity · "hence"/halve ·
factor pair · squaring-two-cases · Optional: alternate segment. 189 paragraphs.

**His:** 4 core + 1 optional, 131 paragraphs, roughly a third shorter.
1. Integrating with a constant on top, only the inside dividing
2. Which curve bounds the region (area)
3. "A constant factor rides along — and read what the rate is measured per"
4. "Squaring hides a second case + Make Sure You Perform Shoelace Method Correctly"
5. "Optional — do this one only if you have time": the trig identity

The six rules:

1. **An optional TOPIC is optional whole.** He said the trigonometry could be
   optional; the sheet made only the alternate-segment item optional and kept
   the identity and the "hence" work as core sections. He moved the identity to
   Optional and cut the "hence" one. When he calls a topic optional, none of it
   is core.

2. **Four core skills, not six.** He cut two sections outright ("hence"/halve,
   factor pair) and the optional alternate-segment one. A third of the sheet
   went. Aim at four; six is a sheet that does not get finished.

3. **Merge skills that share one lesson.** Two of his four sections are joins —
   rate-of-change with the constant-factor rule, and squaring-two-cases with the
   shoelace method. Do not give every diagnosed skill its own Example/Practice
   pair when one worked example can carry both.

4. **Section titles are numbered and name the BEHAVIOUR**, in his voice, and may
   join two ideas with "+" or give a direct instruction: "3. A constant factor
   rides along — and read what the rate is measured per", "4. Squaring hides a
   second case + Make Sure You Perform Shoelace Method Correctly".

5. **"Already taught last wave" is not a reason to shelve a skill.** The sheet
   shelved integration coefficients because the previous wave covered them; he
   put them back as section 1. Still wrong means still taught.

6. **Individual practice ITEMS can be marked "(Optional)"**, not just whole
   sections — his Practice 4 has "(Optional)" on item 3 alone. Optionality is
   per item as well as per section.

## Practice layout (31 Aug 2026)

- Number practice items **1, 2, 3 …**, never (a), (b), (c). Letters belong to the
  parts of one question; using them for separate questions makes three questions
  look like one.
- A question WITH parts gets **one answer line at the end**, carrying every part
  — not an answer under each sub-part, which lets the student check (a) before
  attempting (b).
- **Answers are typeset too.** A fraction typed as 3/2 beside a properly set one
  in the working reads as a different standard.
- **Right tab stop at 15.5 cm** for the marks and the answer line, so every
  question lines up down one edge.

## Typesetting and boxes (31 Aug 2026 — reading Klaire's sheet on screen)

- **Every fraction is stacked**, numerator over denominator. Word can draw a
  fraction "linear" (`4/3` side by side) and it is tempting for small ones like
  ½ and 4/3 — Adrian rejects it. On a page where the derivatives are stacked,
  the flat ones read as a lower standard, and 4/3 in front of πr³ is exactly the
  constant a student mis-copies. Same for slashes typed in prose: "v = dx/dt"
  inside a sentence is still maths, so it is still an equation.
- **A solution box hugs its content.** Two Word traps, and neither is fixable by
  the reader:
  - The gap under the "Solution:" label is paragraph spacing, not an empty line,
    so Backspace does nothing. It has to be authored away (no space after the
    label, none before the first line inside the box).
  - A trailing empty paragraph inside the box cannot be deleted — Word will not
    remove the last paragraph of a cell. So never write one. (Two of Klaire's
    six boxes had one; five of Kiara's ten.)

## Why Klaire's sheet is the reference (31 Aug 2026)

Adrian: *"klaire's self learning sheet is very similar to what i have in mind
compared to sophie's or kiara's."* Compared side by side, the differences are:

1. **Headings that teach, not label.** "When the power is −1 the power rule
   breaks" vs "Always Increasing / Always Positive Leading To The Discriminant
   Condition". A student who reads only the headings should have learnt
   something.
2. **Two worked examples where one skill has two faces**, then one practice set
   covering both — rather than one example per skill.
3. **The three tiers as three visible zones in order** — numbered skills with
   practice; then "Read these once — no practice needed"; then "Optional — do
   these only if you have time". Not an "(Optional)" tag floating mid-document.
4. **Diagrams in the examples AND the practice**, not in neither.
5. **Every solution box opens with one plain-English line** saying what kind of
   problem this is, and closes with the danger line and a ✓ check. A box that
   opens straight into algebra is the thing that makes a sheet feel thin.

## Sheet wording and sources (2 Sep 2026 — Sophie's EM 2025 P1 sheet, sent back)

- **No school names in the source lines.** `[2023 / EM / Prelim / Q9]`, not
  `[2023 / EM / Prelim / Tanjong Katong Girls / Q9]`. Year, level, exam type and
  question number stay; "GCE" stays because it is the board, not a school.
- **The title block is tight.** "For <Name>" sits directly under the title, and
  the first instruction line directly under the name. A 6pt + 10pt gap there
  reads as "such a large gap".
- **One question with parts is lettered (a), (b) — never numbered 1, 2.** The
  31 Aug rule (items are 1, 2, 3) cuts both ways: "By drawing a suitable line…"
  followed by "Hence solve the inequality…" is one question with two parts and
  one answer line, not two items.
- **Never tell the student which paper a mistake came from, or how many
  papers.** "Q23(b) at Zhonghua", "in three of your four papers", "all four of
  your marked papers" all came out. The sheet talks about the paper in their
  hand; other papers are Adrian's evidence for choosing the wave, not the
  student's reading.
- **The marked paper's front page reads that paper alone** (same day, on Eva's
  cover: "we should just analyze that particular exam paper, not across 5
  papers") — and it should look friendly for a teenager, not like a report for
  an adult: colour, rounded cards, a big score badge.
- **The DIAGNOSIS is single-paper too** (2 Sep 2026, later the same day:
  "diagnosis should be single-paper"). This reverses the 1 Sep "read every
  paper" rule. The sheet is built from the marked paper in the student's hand:
  what they lost marks on there, ranked by damage and by how often the same
  slip recurs WITHIN that paper. Older papers are not pulled in to find habits.
  Progress over time belongs to the portal's tracking, weighted towards the
  latest work — not to the sheet.

## How Adrian explains — captured from his amendments to Sophie's EM 2025 P1 sheet (2 Sep 2026)

Adrian rewrote two worked examples by hand and asked for the difference to be
noted and followed on EVERY surface — self-study sheets, teaching notes, worked
examples, the bot's answers. This is a diff of what he changed, not a theory.

### Shape of a solution box (his version)

1. **Grey italic principle first, three lines at most, general → trick → applied.**
   *"Solving equations graphically usually involves solving simultaneous
   equations. The trick is to make one side of the equation identical to the
   graph already drawn. For example to solve 6x² − 2x³ + 2x − 6 = 0, make one
   side of the equation x³ − 3x² + 2 = …"* Grey `7F7F7F`, italic. The applied
   line already carries the colour coding of the working below it.
2. **A blank line**, then the working as **auto-numbered steps** — `1) Start with
   the equation you need to solve`, `2) y = [the expression on the other side of
   the equal sign] is the graph you need to draw`. Each step is a sentence that
   says WHAT you are doing, then the lines that do it.
3. **The general rule is stated inside the step, in green bold, in square
   brackets** — `y = [the expression on the other side of the equal sign]` — so
   the student sees the rule and the instance on the same line.
4. **Every algebraic move gets a grey `←` annotation that names the target**:
   `← divide by −2 to obtain x³ − 3x²`, `← add 2 to obtain x³ − 3x² + 2 (which is
   the graph drawn)`, `← the expression on the right side is the graph required`.
   The annotation says what the move is FOR, not just what it is.
5. **Close with the instruction and the read-off**: `∴ Draw y = x − 1 on the grid
   and read off where this line intersects the curve → read the x-coordinates`,
   then `From the graph, x = −1, x = 1, x = 3`.
6. **He deleted** the punchy italic opener ("You are not asked to solve the printed
   equation…"), both red "on your paper you…" danger lines, and the blue Check
   line. The teaching is the annotated working itself; the student's own mistake
   is not narrated back at them inside the box.

### Colour coding (his — "helpfully visual for students")

| colour | hex | used for |
|---|---|---|
| grey italic | `7F7F7F` | the principle/strategy lines at the top of the box; `←` annotations |
| **blue** | `0432FF` | the expression you are trying to MATCH (the printed curve's `x³ − 3x²`) — wherever it appears, in the principle line and in the working |
| **red** | `EE0000` | the piece you ADD or CHANGE to complete the match (the `+ 2`) |
| **green bold** | `00B050` | the general rule in square brackets, and the RESULT that rule produces (the line `x − 1`) |
| black bold `←` | — | a plain-English instruction annotation: `← write percentages as decimals` |
| bold + underline | — | the BASE being emphasised: **<u>From 2019</u>** to 2020 → 2019 is the base (100%) |
| grey | `808080` | the Common Error working |
| red | `C00000` | the one-line Common Error warning |

One colour, one meaning, and the same meaning inside the principle line and the
working below it — the student's eye connects the blue in the sentence to the
blue in the algebra.

### The percentages example (his version)

- **Open with the conversion facts and their reason in brackets**, annotated in
  black bold: `A rise of 12% multiplies by 1.12 (because 100% + 12% = 112% =
  112/100 = 1.12 ← write percentages as decimals)`. Same line for the fall.
- **Declare the unit in bold**: `Let the country's exports in 2019 be 100 units.`
- **One block per base, separated by blank lines**, each opened by a bold
  underlined base line with an arrow: `From 2019 to 2020 → 2019 is the base
  (100%)`, then FULL-WORD equation lines: `exports in year 2020 = 100 × 1.12 =
  112` — not `2020 = 112`.
- **The formula in words before the numbers**: `percentage increase =
  increase/original × 100% = (130 − 95.2)/95.2 × 100% = 36.6%`. No `34.8/95.2`
  intermediate, no `← 3 s.f.` tag.
- Common Error kept: grey working line, then ONE red warning. He cut the second
  red line ("the divisor is the value you started FROM…") — one warning per box.

### Wording

- **The word "never" does not appear.** `A fall of 15% is × 0.85, not −15.`
  Use "not", "does not", "is not" — he changed "never" to "not" by hand.
- **Headings name the skill as an action, in Title Case**: "2. Find the Required
  Line To Draw To Solve An Equation Graphically", "3. Mastering Percentages –
  Whether To Multiply or Add/Subtract". Not the teasing one-liner ("Subtract the
  printed curve — whatever is left over IS the line you draw") — he replaced both.
- **No source line under a practice question**, at all. He deleted every
  `[2023 / EM / Prelim / Q9]`.
- **1.5 line spacing throughout**, inside the solution boxes included ("improve
  readability").
- **Auto-numbered practice items** (Word numbering, so an inserted or deleted
  item renumbers the rest), not typed "1.  ".

## Four sheets amended in one evening — Kiara, Klaire, Rainie, Chloe Zhang (2 Sep 2026)

Adrian edited four worker sheets by hand on 2 Sep 2026 and asked for the
changes to be compared against the originals and their essence captured. Each
was diffed paragraph by paragraph (text, colour, spacing, numbering, boxes);
the per-sheet reports are in the session scratch under `compare/<student>/`.
The four agree with each other far more than any one agrees with the rules
written before them, so **where this section contradicts an earlier rule,
this section wins**. Numbers first:

| sheet | paragraphs | boxes | practice items | figures | what happened |
|---|---|---|---|---|---|
| Kiara | 214 → 104 | 8 → 4 | 21 → 8 | 1 → 0 | half the sheet cut; boxes gutted to bare working |
| Klaire | 164 → 158 | 6 → 8 | 14 → 13 | 3 → 4 | the reference sheet, refined: two boxes and a 12-mark question ADDED |
| Rainie | 154 → 121 | 6 → 5 | 7 → 9 | 2 → 1 | one skill dropped whole, one promoted, practice deepened |
| Chloe Z | 125 → 90 | 4 → 3 | 8 → 4 | 5 → 3 | two skills merged into one exam-shaped example |

### Structure — what a sheet looks like after his hand

- **Headings are unnumbered Title Case skill labels.** "Master Finding Area
  Using Integration", "Finding Coefficient of A Specific Term In An Expansion",
  "Always Increasing / Always Positive Leading To The Discriminant Condition"
  (his own rewrite — retire it as the counter-example in "Why Klaire's sheet is
  the reference" §1; the "headings that teach" test is dropped). The section
  number `1.` `2.` went on all four sheets. An Example may carry the skill in
  its own heading — `Example 1a : Solving Exponential Equations Using
  Logarithms` — followed by **one blue key-move line** ("Bring all terms
  involving x to one side", "Always Form Chain Rule") that is then echoed,
  in blue, as the `←` on the exact line where it happens.
- **A page break before each new skill.** Three of four sheets.
- **No "Read these once" zone. Ever.** All four deleted it whole. Every line in
  it said what the student did ("You had the intercept 3 — one more line
  gives k/4 = 3"), and that is the one thing he does not put on a sheet.
  Slips are either not mentioned or become an ordinary practice item.
- **"Optional" survives as a bold `(Optional)` line above a section** (Kiara,
  Rainie), or the leftovers go into a closing `Practice N – Miscellaneous
  Practice` (Klaire). Not a zone with its own instruction sentence.
- **Two skills that are (a)/(b) of one exam question are ONE Example with
  (a)/(b) and ONE Practice with (a)/(b)** (Chloe: y-coordinates then
  gradients on `y = 12x − x²`). A diagnosis that was wrong is deleted with
  its heading, not corrected in place.
- **One instruction paragraph, not three lines.** Rainie: "Read through each
  **Example**. Then do the **Practice** under it on your own, before you look
  at the answers." Kiara: title, then one line. No subtitle, no "every skill
  below cost marks" narration.

### The Example is the exam question

- **Quote the exam stem's wording and constraints** — a paraphrase that
  changes the domain is a bug (he corrected `0 < m < 12` to `0 < m < 4`).
  Write the curve's equation on the diagram; ticks at `m`, `3m`; no dashed
  verticals.
- **Print the marks per part** (`[3]`, `[2]`) and **bold the operative word**
  the student misread (`Find the **magnitude** of the acceleration`).
- **The example is the exam's own variant, at the exam's difficulty**
  (Klaire: 800 cm³/s after 2 seconds, not the easier 300 cm³/s at r = 10);
  the easier variant then gets no practice item.

### Inside the box

- **A routine procedure gets a BARE box** — the working, one complete
  equation per line, `←` annotations, nothing else. Prose lines ("Now write
  the chain.", "Only now put the radius in.", "Turn that into a value of the
  sine first.") were cut everywhere they narrated a step the working already
  shows. Prose survives only where the idea is non-obvious.
- **A "you stopped here" red line becomes the missing line of working.**
  `Stopping at 3x²+2px+q > 0 earns nothing…` → the actual lines
  `For increasing function, dy/dx > 0` / `3x²+2px+q > 0`, and a show-that
  ends `p² < 3q (shown)`.
- **Common Error only when it names the wrong TOOL in one sentence**:
  `b²−4ac counts the roots of an equation. It says nothing about the y-value
  of a point.`; `∫3/x² dx = 3ln(x²)+C ✗ ← ln needs the power to be exactly −1`.
  Every "Test it: with m = 1.5…" numerical disproof, every picture-argument
  Common Error, and every Common Error on a routine box was deleted (Kiara: all
  eight). This narrows 30 Aug rule 8.
- **Checks only where a real check exists**, and then in exact form:
  green `Check: 3^{lg28/lg3} = 28 ✓`; a `✓` closes a completed proof
  (`Since m > 0, the difference 4m is always positive…✓`). The aside
  `Check: acceleration is largest exactly where the speed is zero ✓` went.
- **Annotations: a routine move gets the rule's NAME** (`← chain rule`, not
  `← chain rule: × derivative of the inside`); a non-routine move still names
  its target. He also writes **`**must know …` tags** and **`eg.`
  micro-examples** inside an annotation: `← convert log eqn to indices eqn:
  eg. log₃(x)=7 ⟹ x=3⁷ **must know how to convert`.
- **Magnitude**: show the signed value first, then `|a| = … ← magnitude is
  just the value without the minus sign`.
- **`+C` on every line of an indefinite integral**; `ln(2x+7)` without
  modulus bars on A-Math sheets; `= 1.21 cm/s (3sf) ← radius divided by
  time, hence unit is cm/s`.
- **Teach by contrast as a trio** (Klaire 4a → 4b → 4c): a warm-up box, then
  a stem-less box with the wrong attempt in red and the fix in blue
  (`3x⁰/0 which is undefined` / `in such a case, we use ln`), then the exam
  question.
- **Name the method the student knows**: `Perform long division:` then the
  result — not "force a 6(x+1) to appear on top, then split the fraction".

### Practice

- **A routine skill gets ONE item — the exam question's twin** with the same
  part structure and marks, the function family varied (cos for sin). No
  clone that only changes a number.
- **The conceptual skill carries the volume: 3–4 escalating items** —
  discriminant: always increasing → always decreasing → two stationary points
  → no stationary points — pulled from the bank / a Learn-unit's practice
  cards. Revises 30 Aug §6's flat "2–4 per skill".
- **A set may end with a full exam question and its figure** (`Show that the
  area of the shaded region is … [12]`).
- A one-question set is unnumbered; parts stay (a)(b); one `Find` lead-in over
  (a)(b)(c); one typeset answer line per question. A hint goes UNDER the
  question in light grey: `[Remember: At a stationary point dA/dx = 0 …]`.

### Colour, as used across the four

| colour | meaning |
|---|---|
| blue `0432FF` / `0070C0` | the key move under a heading and its `←` echo; the rule symbol or formula parameter; the closing rule line |
| red `EE0000` / `C00000` | the substituted value; the wrong turn; ONE danger sentence per box, if any |
| grey `7F7F7F` / `808080` | `←` annotations, italic strategy lines |
| green `008F00` / `00B050` | the Check line (Klaire) or the rule in brackets (Sophie) |
| `A6A6A6` light grey | `[Remember: …]` hints under a practice question |
| brown `843C0C` | answers |

### Slips in the amended copies — re-verify before release

His hand is the standard, but a hand-typed sheet is unverified until checked:

- **Klaire, Example 1b**: multiplying `log₂x + log₂(x+3)/2 = 3` by 2 gives
  `… = 6`, so `x²(x+3) = 2⁶` and `x³ + 3x² − 64 = 0`. The sheet says `2³`
  and `− 8`. The worker's original had it right.
- **Kiara, Example 1**: the chain `12k − k² > 36k − 9k²` … `k(k−3) > 0`
  points the wrong way (that is y_A > y_B); only the last line `0 < k < 3`
  is right.
- **Kiara, Practice 3 Q2**: `10k² + 3k − 1 = 0` gives `k = 1/5` or `−1/2`;
  nothing in the question rejects `−1/2`.

So the sheet worker gains a step: **run the sympy verifier on Adrian's amended
DOCX before release** (in the release-with-sheet flow) and Telegram him the
mismatches instead of releasing.

### Artefacts, not rules

A Word re-save turns `−` into `-` inside retyped equations, drops the right
tab on retyped marks lines, and leaves a trailing empty paragraph in an edited
box. Lines he typed by hand are left-aligned rather than `=`-aligned — keep
the generated `eqArr` alignment (he changed none of the worker's aligned
arrays); do not copy the hand layout.

## How Adrian explains — "when can I divide?" (WhatsApp, 3 Sep 2026)

A student solving cosθ+4sinθ over 2cosθ+sinθ = cotθ reached 4sin²θ − 2cos²θ = 0 and asked, after
the bot divided by cos²θ: "Wont it get rid of an angle?", then "how do I know when I can divide
and when I can't", "which scenarios can I not divide, which will result in me losing a solution".
The bot's answer was correct but not satisfactory to Adrian (it argued "cos θ = 0 is never a
solution here, so dividing is safe" — a case check, not a rule). Adrian replied himself:

> All scenarios. When you can divide by variables, means you can bring over to one side
> (one side = 0), then factorize.
> This is NOT the case where you can shift 2cos²θ over to left and factorize → hence you
> will not lose solutions here.
> In this scenario, you can't factorize from sin²θ and cos²θ, so you can divide say by cos²θ
> to obtain tan²θ, and you will not lose solutions.

**The rule as he teaches it:** factorise-first. If everything can be brought to one side and
factorised, do that and never divide by the variable — dividing throws away the root of the
factor you divided by. Division is what you do only when factorising is impossible, and it is
safe exactly then (here sin θ and cos θ are never both zero). Captured as an APPROVED
`method_templates` row (source `adrian-chat-2026-09-03`, topic = the trig topic already in
`pitfalls`) so the practice hint, grader, marker and sheets pick it up. The bot's chat solver
does NOT yet read the teaching-knowledge layer (only the generation worker and the paper
marker do) — wiring it is the follow-up if Adrian wants the bot to answer this way.

## How Adrian explains — "maximum gradient" (WhatsApp, 3 Sep 2026, 7:15 pm)

The bot answered a student's "what does maximum gradient mean" correctly and at length:
maximum point vs maximum gradient, treat dy/dx as its own function, differentiate again and
set d²y/dx² = 0, third-derivative sign check, a hill analogy. The student then asked what
the reply meant. Adrian answered:

> Basically to find
> max y → set dy/dx = 0
> max A → set dA/dx = 0
> max dy/dx → set d²y/dx² = 0
> max d²y/dx² → set d³y/dx³ = 0
> The idea is: set the derivative of the thing you want to max/min to 0

**The pattern:** one rule, shown as a ladder of four concrete lines, before any distinction
or analogy. Same shape as the dividing rule earlier today — a habit the student can run, not
a case analysis. Captured as an APPROVED `method_templates` row under
`Differentiation (Maximum and Minimum)` (source `adrian-chat-2026-09-03`). Second time today
a correct bot answer needed Adrian's rewrite → the chat solver reading the teaching layer
would carry exactly these.

## 7 Sep 2026 — no idioms in a lede: "hands you"

On a Practice Again sheet (Using f(a) = 0 to show that x = a is a root), the lede read
"That same line hands you the factor (x − a) to divide by." Adrian: **"don't say 'hands
you', Singapore students don't speak like that."**

**The rule:** plain Singapore classroom English in every lede and note. Say *gives*,
*gives you*, *tells you*, *is* — "That same line gives the factor (x − a) to divide by."
No figures of speech: not *hands you*, *buys you*, *for free*, *do the heavy lifting*,
*nail down*, *unlock*, *the trick is*. A student should be able to read the line aloud
in class. Captured in the `self-study-sheet` skill's voice rules and the
`revision-worksheet` authoring brief the same day.

## 7 Sep 2026 — the exponential-to-quadratic example, six amendments

On a Practice Again sheet (Using a substitution to turn an exponential equation into a
quadratic, 5eˣ + 3 = 2e⁻ˣ), Adrian:

- **"Don't say 'clears it', say 'remove the denominator'."** Concrete verbs for concrete
  moves: remove the denominator, make the subject, take out the common factor,
  substitute back. Not clears / kills / gets rid of.
- **"Don't reject u = −1, sub back eˣ and then reject eˣ = −1."** With a substitution,
  write the roots in u, substitute EACH back, and reject in the original variable with
  the reason: "eˣ = −1 has no solution since eˣ > 0 for all x."
- **"Don't say 'one root survives', just say 'there is only 1 solution'."** The
  conclusion of a show-that is stated plainly: "So there is only one solution. (shown)"
- **On "Common Error: b² − 4ac counts the roots of the quadratic in eˣ …": "Is that
  necessary? doesn't seem to help but being a confusing message."** A Common Error is a
  concrete wrong move a student writes at this step, in one sentence, or nothing.
  Commentary on a theorem is not an error.
- Layout: the "Solution:" line and everything in the box at 1.5 line spacing; 2 pt of
  air above the first line in the box (renderer fixes, worksheet_lib, same day).

## 7 Sep 2026 — the circle example and the area example, layout and diagrams

- **"The diagram doesn't seem to match part (a) — it is misleading … in worked solutions
  that diagram should be provided, but for (b) onwards (not for (a))."** A worker-drawn
  diagram goes in the solution box at the first part that uses it, showing only what is
  established by then. The question shows a diagram only when the exam question had one.
- **"The parts (a) (b) (c) should be vertically aligned with the first line 'The equation
  of a circle…'."** Example parts flush with the stem (`ws.parts()`); under a numbered
  practice question they stay level with the question's text. All lists are live Word
  numbering (his earlier ask, 2 Sep) — examples, parts and practice items renumber
  themselves.
- **"Diagram generation for A and B, they are not block by the lines."** Point labels
  are placed at the first offset no stroke crosses.
- **"A check beside the tick and the fonts in green … that check is not part of the
  working."** Sanity checks render as a green "✓ Check:" line, set apart from the working.
- **"Solution: should have line spacing of 1.5"** and 2 pt above the first line in the
  box — renderer and repair script aligned.

## 7 Sep 2026 — small slips that are fundamental gaps

Denise's Q3(b): multiplying by (4x² + x) when integrating (2x + 1)^(−3/2) — two marks — and
the sheet filed it as "Optional". Adrian: **"this integration technique working reveals a
very important conceptual error which is not reflected in analysis and in learn again sheet
— need to include … integration has a very high weightage in exams. Analysis should capture
important conceptual errors or gaps in knowledge even for small slipups that reveal deeper
or fundamental gaps/misunderstanding/conceptual errors — and reveal them in analysis to let
students/teachers know and design/create/find relevant practices (with clear worked examples
focus targeting that fundamental gap)."** And Q2 ("Show that x = −1 is a solution"), never
shown: **"emphasize: question asked to show that x = −1 is a solution."**

**The rule:** the marker names the rule or habit behind an error as a `gap` whenever it will
recur, whatever it cost; the analysis ranks a gap above a bigger loss without one and prints
it on page 1; the Practice Again sheet gives every gap its own worked example and practice —
never the Optional tail. A skipped instruction ("show that", "verify", "hence") leads the red
note, quoted, and is a gap in exam habit. Also: the marker's notes in plain classroom
English — the marker wrote "hands you" too.

## 8 Sep 2026 — every example needs its practice; a rule shows its exception

Denise's second Practice Again sheet, Example 5a (integrating a power of a linear bracket):
**"there is no corresponding practice questions for example 5a"**, and **"there should be
examples and practices where the power is −1, which will result in the integral being ln
instead."**

**The rules:** every Example, lettered ones included, carries at least two practice items of
its own shape in its own Practice section — the worker counts them before filing. And when a
rule has a case where it changes shape or fails, the section shows that case in one worked
example and in the practice: ∫(ax + b)ⁿ dx at n = −1 → (1/a) ln|ax + b| + C; dividing an
inequality by a negative; √(x²) = |x|; the R-formula's quadrant; tan at 90°.

## 9 Sep 2026 — the cross sits where the error is made; teach the missed step; arrows beside the prose; maths in a tag is an equation; reuse a vetted example

Alessi's A Math 2021 Paper 2, three questions and one system ask.

Q10, the gradient: (0 − 0)/(2π/3 − 0) = 3/(2π) — **"the gradient calculation is wrong,
but no cross there"** — the ✗ had landed on the next line, y = 3/(2π) x, which merely
copied the wrong number. **"And seems like the student do not know how to get the exact
form. so the practice again sheet should particular focus on that."** Q6, the binomial
product: **"explanation is okay. but can also use arrows to show the expansion → more
visual. both explanations will be good because students tend to have a hard time knowing
how to obtain the coefficients. and 1/x is not written as omml in docx in the practice
again sheet."** Q4(c), the R-formula: **"student knows how to get the maximum value, just
not the corresponding angle, should focus on that in the practice sheet."** Then:
**"make sure all these teachings (pedagogy) are absorbed into the system"** and **"for
frequently marked papers, perhaps some examples can be reused if appropriate."**

**The rules:**
- **The ✗ goes on the line where the error is MADE** — the first line that is wrong on its
  own — never on a later line that only carries the wrong value forward. The gradient
  line, not the equation built from it. Later lines that inherit the mistake get no second
  ✗ (they are follow-through), and the red note sits beside the originating line.
- **The sheet teaches the missed STEP, not the whole method.** The marker's `gap` names
  the step the student could not do; the sheet's example makes that step the longest part
  and the practice items ask for it each time. Alessi finds the maximum of R sin(θ + α);
  she cannot find the θ that gives it — so the section is about solving θ + α = 90°
  (and the quadrant), with the maximum value mentioned once. Alessi cannot carry an
  exact value (2π/3, √3) through to the answer — so the "show that" example carries
  exact forms through, with no decimals anywhere.
- **A binomial product gets prose AND arrows.** The written "which terms multiply to give
  x⁰" explanation stays; beside it sits the figure with coloured arrows from each left-hand
  term to its right-hand partner, the pair boxed in the same colour, the product written
  in that colour. Both explanations, because coefficients are where students lose the
  thread.
- **Every piece of maths in the docx is an equation object.** 1/x inside a green rule tag,
  a coefficient in a caption, a "= 60" in a prose sentence — all OMML, never typed text.
  The worker runs the plain-maths sweep before filing and a hit blocks the file.
- **Reuse a vetted example before writing a new one.** For a paper marked more than once,
  the worker looks up earlier sheets on the same paper first; same question AND same gap
  → the earlier section is reused (Adrian's edited copy from Dropbox when he changed it
  after filing), re-verified, and the Telegram says what was reused. Same question but a
  different gap → written fresh; the gap decides, not the question number.

## 10 Sep 2026 — name the unknown after a substitution; "survive" is still banned

**"the phrasing both roots are positive so both of them survive.. sounds weird (what does it
mean both roots? and survive?)"** — on a Practice Again solution note for 4ˣ with u = 2ˣ.

**The rules:**
- **After a substitution, don't talk ABOUT the substitution — write it.** Adrian, later
  the same day: *"just don't mention it. say the substitution, students can understand by
  working."* No "both roots", no "both values of u are positive, so each gives…". The
  note shows the lines: u = 2ˣ, u² − 5u + 4 = 0, u = 1 or u = 4, so 2ˣ = 1 or 2ˣ = 4, x = 0
  or x = 2. The working carries the meaning; a sentence explaining which unknown is which
  is noise the student has to read past.
- **No personification of a number.** *survive*, *left standing*, *make it* — say what
  happens: it gives a solution, or it has no solution since 2ˣ > 0. (The 7 Sep rule; the
  worker now refuses to file a sheet with these words in the text.)

## 10 Sep 2026 — a slip inside a right method earns no practice (Isabelle, AM 2024 P1)

**"you put the differentiation question as the first question for practice again, but in
her paper, the differentiation question was incorrect because she just copied the question
wrongly, her method/working/idea/concept is okay > so this should not be the main teaching
(perhaps put as optional or not even put at all) / there is no need to practice again for
arithmetic errors, transfer errors, rounding off errors, copy wrongly (or errors like
that) if method/approach of doing question is correct / practice again should emphasize on
wrong concept/approach and method in order of marks got incorrect and the severity of the
misconception (if a large amount of marks is lost due to arithmetic errors, transfer
errors, rounding off errors, copy wrongly (or errors like that), the analysis page should
as usual reflect loss of marks by magnitude, but practice again sheet need not include
practice for that). practice again sheet focuses on wrong approach/method/concepts"**

**The rules:**
- **The marker's `error_kind` decides the tier, not the size of the loss.** arithmetic,
  transfer (incl. the printed question copied wrongly), sign, rounding, units, careless →
  ② show in one line, never a ① Example → Practice section — even at 6 marks.
- **A `misread` whose sentence says "copied … wrongly" is a copy slip**, not a misreading
  of the question. Isabelle read Q8 correctly and wrote V down wrong.
- **① is ordered by marks lost, then by how wrong the idea was**: a named gap or a wrong
  concept first, then a real misread, then an unfinished method.
- **The cover still shows the magnitude.** MARKS LOST keeps the six marks that went to
  slips; only the practice is withheld. When only slips are left, the cover says the
  method was right and points at the marked lines instead of naming "the one thing".
- Mechanism: the worker's triage (SKILL.md / WORKER_PROMPT.md) + a deterministic gate on
  the site (`applyPracticeFocus`) that demotes a ① whose every lost part was a slip and
  pings Adrian — so the sheet can be revised, not silently shipped.

## 10 Sep 2026 — sub-part gap in a solution box; keep-with-next on the sheet

- **A solution box that covers several sub-parts leaves a gap between them** — (a)'s last
  line and (b)'s first line are not the same paragraph. Library rule in `worksheet_lib`,
  `repair-sheet.py --check` step 2c flags a box that runs them together.
- **A heading, its key-move line and the first line of its Example stay on one page**
  (keep-with-next glue in `workspace()`, "do what you see fit according to space
  management") — a section title alone at the foot of a page is a page turn wasted.
