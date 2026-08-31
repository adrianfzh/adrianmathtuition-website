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

**A2. Struck-through working was marked (Q9(a), kite).**
Adrian: *"marker marked cancelled working?"* The student crossed out a whole
quadratic-formula block; the marker put red ✗ on the cancelled lines. Crossed-out
work costs nothing in SEAB marking — it should be ignored, not penalised. The
marking prompt needs an explicit rule, and the annotator needs to not draw on
struck-through regions.

**A3. Green-pen corrections were counted.**
Adrian: *"shouldn't student's working green pen be not counted? usually these
are students corrections (can marker recognise? should already be built)."*
It IS built — Sophie's Q12(a) flagged *"corrections in a different pen (green)
detected"* and left the decision to triage. Here it did not fire. Find out
whether the detector missed the colour or the rule only runs on some paths.

**A4. Graph read wrong (linear law).**
Adrian: *"graph of student reads 3.01, not 3.00 as marker claimed."* A
read-off from the student's own drawn line. Needs the page at full resolution to
confirm, then a rule about stating read-off precision.

**A5. Brackets on Q12(a).** Adrian: *"brackets are required?"* — unresolved,
needs his ruling before it can be encoded either way.

## B. Rendering — the output is wrong on the page

**B1. Raw `$…$` leaking into annotations.**
Adrian: *"there are still some rendering issues in annotations $..$"*. Visible in
the complex-number script: a flag header printed literally as
`Q8(b) find $z_2$ and $z_4$ 2…`. The maths delimiters reached the page instead
of being typeset. `lib/latex-repair.ts` / the pen renderer.

**B2. Correct-solution block printed on a question the student got RIGHT.**
Q7 sin-curve: both parts 2/2 green, and a full `Correct solution – Q7` block
printed underneath anyway. On a full-marks question it is noise.

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

**C3. The same point made twice, in two blues.**
Diagnosed 31 Aug: a guard exists comparing the part's diagnosis against its
study note, but it compares WORDING, and these two notes duplicate in MEANING
while sharing few words. The robust rule is structural: one error, one note
location. Not yet fixed.

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
