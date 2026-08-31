# Marking defects — Adrian's read of the 31 Aug batch

Raised in one pass over several marked scripts (AM/EM prelim practice, JC complex
numbers, EM real-world). Recorded verbatim-ish so none is lost, each with a first
diagnosis and where the fix would live. **Nothing here is fixed unless it says so.**

Grouped by what kind of failure it is, because they need different work: an
accuracy error needs the marking prompt or a guard; a rendering bug is a
renderer fix; a layout problem is `ai/annotate.js` geometry.

---

## A. Accuracy — the marker was wrong

**A1. Correct answers marked wrong (complex numbers, Q8(b)).**
Adrian: *"correct answers were marked wrong in complex number question."*
Third instance of this class today, after Kayla's Q7 (units) and Q19 (set
notation). The two guards shipped today — the answer-key cross-check now seeing
keys printed on the page, and the deducted-marks second look — should catch
this shape. **Test them against this exact script before believing them.**

**A2. Struck-through working was marked (Q9(a), kite). — RULE SHIPPED 31 Aug 2026.**
Adrian: *"marker marked cancelled working?"* The student crossed out a whole
quadratic-formula block; the marker put red ✗ on the cancelled lines. Crossed-out
work costs nothing in SEAB marking — it should be ignored, not penalised.
`MARK_SEVERITY_RULES` (bot `ai/paper-marker.js`) now carries **CROSSED-OUT WORKING
IS NOT ASSESSED AT ALL**: every line with `is_crossed_out` true must come back
`verdict:"neutral"`, `error_type:null`, `scheme_code:null`, `correction:null` — so
there is nothing for the annotator to draw. The one exception is spelled out: if
NOTHING stands for the part, it scores 0 for absence of work and the summary says
the attempt was abandoned, not that it was wrong. **Still to verify on a real
script** — the rule constrains the model, it does not force it.

**A3. Green-pen corrections were counted.**
Adrian: *"shouldn't student's working green pen be not counted? usually these
are students corrections (can marker recognise? should already be built)."*
It IS built — Sophie's Q12(a) flagged *"corrections in a different pen (green)
detected"* and left the decision to triage. Here it did not fire. Find out
whether the detector missed the colour or the rule only runs on some paths.

**A4. Graph read wrong (linear law). — RULE SHIPPED 31 Aug 2026.**
Adrian: *"graph of student reads 3.01, not 3.00 as marker claimed."* A read-off
from the student's own drawn line — and the marking quoted an intercept off a line
that is not on the page. This is the worst class on the list: a number the student
can look at and see is not theirs destroys trust in every other number on the
script.

`MARK_SEVERITY_RULES` now carries a **GRAPH READ-OFF GUARD** — never quote a
number you cannot see. The only admissible evidence for a "use your graph"
question is what is on that page: their points, their line, their marked
intercept. Computing what the line *should* give from theory and presenting it as
their read-off is banned outright. Two consequences encoded with it:
- **Tolerance follows the grid.** On a 2 mm grid a read-off is good to about half
  a small square, so **3.01 vs 3.00 is the same reading and costs nothing**; only a
  difference the grid can resolve is an error.
- **"I cannot read this from the scan" is a correct outcome.** When the line, axes
  or scale are illegible: `match_confidence "low"`, say so in `match_note`, award
  the method marks the working supports, and leave the read-off marks for triage
  rather than deducting on a guess.

**Still to verify on a real script**, and worth doing deliberately: re-mark the
linear-law paper and check the marker now either reads the line or declines.

**A5. Brackets on Q12(a). — WAITING ON ADRIAN.** *"brackets are required?"*
Nothing can be encoded until he rules. It is a genuine either-way call, and
guessing it would put a wrong rule in the calibration ground truth, which is worse
than the open question.

## B. Rendering — the output is wrong on the page

**B1. Raw `$…$` leaking into annotations.**
Adrian: *"there are still some rendering issues in annotations $..$"*. Visible in
the complex-number script: a flag header printed literally as
`Q8(b) find $z_2$ and $z_4$ 2…`. The maths delimiters reached the page instead
of being typeset. `lib/latex-repair.ts` / the pen renderer.

**B2. Correct-solution block printed on a question the student got RIGHT. — FIXED
31 Aug 2026.** Q7 sin-curve: both parts 2/2 green, and a full `Correct solution –
Q7` block printed underneath anyway. `solutionEntry` (bot `ai/solution-entry.js`)
now returns null whenever `awarded >= max`, which **deliberately overrules
`matches_correct`**: a marking claiming full marks AND a mismatched final answer
is self-contradictory, and the marks are the half that reached the student's
score. Tested, including that a 0-mark proof with no mismatch still gets its
solution (the chloe case that put the rule there) and that `max: 0` means "marks
unknown", not "full marks".

**B3. "Figure – Q10" solution block cut off.**
Adrian: *"Figure Q10, solutions cut off."* The block runs past the page edge.

**B4. Lisa (real-world, Q10(c)) — solution may not reach the answer.**
Adrian: *"suppose to determine the max number of levels to purchase, but
solution did not arrive at that (was it cut off?)"*. The printed block DOES end
at "≈ $701000 … highest level priced up to about $701000", so this may be a
crop rather than a missing derivation — confirm against the PDF he was reading.

## C. Layout — right content, wrong place

**C1. Leader arrows pointing at nothing.**
Adrian: *"Q11 → arrow is pointing to some phantom working?"* and *"(b) trigo
question, arrow placement is off."* Two separate scripts, so not a one-off.

**C2. Blue teaching notes on blue student ink.**
Adrian: *"students write in blue pen, so blue ink with blue pen may be hard to
read."* This is the strongest argument yet for changing the note colour — and it
reframes his earlier green suggestion: the problem is not that blue is ugly, it
is that it collides with the student's own pen. Green collides with their
CORRECTIONS (see A3) and would break the green-pen detector's meaning. A third
colour — or a tinted panel behind the note — is the likely answer.

**C3. The same point made twice. — PARTLY FIXED, and the limit is now measured.**
The placement half was already solved (a part's diagnosis and its ✱ study note are
folded into one block, so they cannot print in two places). What remained is one
block saying the same thing twice.

The gate that should catch it was raw-word overlap at 60%. It is now extracted to
bot `ai/note-dedup.js` with tests, stop-words dropped, tokens stemmed, and a
synonym table — whose keys, in the first draft, were dictionary words that
`stem()` never produces, so the table matched nothing at all. A test now asserts
every key is a `stem()` fixed point.

**But the honest finding is that token overlap cannot solve this.** Scored against
hand-written pairs: restatements land at 0.20–0.67 overlap, genuinely additive
notes at 0.00–0.50. **Those ranges overlap**, so no threshold separates them, and
lowering it just starts eating real teaching:

| | overlap | |
|---|---|---|
| "You rounded to 3 s.f. in the middle of the working." / "Rounding early loses accuracy — round only at the final line." | 0.25 | a restatement |
| "The area came out negative." / "Shoelace needs the vertices anticlockwise; a negative area means reversed order." | 0.50 | genuinely additive |

The feature that actually separates them is whether the study note introduces
maths or a named rule the diagnosis lacks — a judgement about meaning, not words.
So the threshold sits at 0.55 (just above the band where the classes mix), the
restatements it cannot reach are pinned in the suite as **KNOWN MISSES** rather
than dropped, and the real fix is either the marking prompt not emitting the
restatement or a cheap second-pass check.

**What would settle it: the actual duplicated pair from the script Adrian saw.**
Calibrating on invented examples is how a gate ends up eating the teaching.

## D. Open question

**D1. Do Adrian's own iPad annotations come back?**
He marks up the PDF in a Pencil app, saving to Dropbox. Those edits reach us
only when the file is re-uploaded (✍️ Upload amended on the triage row, or by
hand from `/Marked papers`). They are NOT read back into the marking record, so
a correction he writes on the page does not change the stored score. Worth
deciding whether it should.

---

## How to work this list

The accuracy items (A) come first: a wrong mark reaches the student. Rendering
(B) and layout (C) are visible to a parent but do not change what a student is
told they scored.

And every A-item is a test case for the two guards shipped on 31 Aug. Before
building anything new, re-mark these scripts and see whether the guards flag
them. If they do, the answer is "keep vetting and watch the number". If they
do not, the guards are not the fix.
