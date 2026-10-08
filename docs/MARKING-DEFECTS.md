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

**VERIFIED 1 Sep 2026 — and the original report was inverted.** Traced to Kiara AM
TYS 2022 P1 Q2. Her graph WAS submitted: photo 18 of 19, filed at the end the way
graph paper always is. Marking that page the marker scored her plotting 2/2;
marking the question page (photo 1) it had her printed table but no line, derived
the intercept it expected, and wrote *"Your line cuts the axis at 3.00, not
3.10"*. **The same script, marked once against her work and once against an
imagined version of it.**

**Her line reads 3.01 and she wrote 3.10 — a full major square out, so the
deduction was RIGHT.** Adrian's note was that the marker QUOTED 3.00 where the
line reads 3.01, a hundredth the grid cannot resolve (now covered by the tolerance
rule). So the bug was never the mark: it was that the marker reached the right
answer **without being able to see the evidence**, and would have reached it just
as confidently had she been correct.

**Fix: the graph now travels with the question** → `ai/graph-companion.js` (pure,
12 tests) + the classification pre-pass reporting `graph_for` per page. Only a
page whose question has its graph elsewhere gets the second image.

**Can the marker actually READ a graph? Yes, tested decisively.** Kiara's own
graph cannot answer this — reading and calculating both give ≈3.00 there. So a
synthetic sheet was drawn with the true table points plotted and the LINE
DELIBERATELY WRONG: intercept 3.40, gradient −0.20, missing every point. A reader
reports 3.40; a calculator reports 3.00. The marker returned:

> *"your line cuts the $\ln m$ axis at **3.40**, not 3.10 — and a line through the
> points gives $\ln A = 3.00$"*

Exact, and it volunteered that the line does not fit the points. **Known gap:** on
the SECOND read-off (part (c)) it used the fitted gradient (−0.250) rather than
reading off the drawn line (which gives t ≈ 5.45). It reads the intercept, then
falls back to computing for the rest. Immaterial on a realistic line, large on a
deliberately wrong one — worth revisiting if a student's line is ever badly off.

**A5. Brackets on Q12(a). — RULED AND SHIPPED 31 Aug 2026.**
The question was Klaire's AM TYS 2021 P1 Q12(a): she wrote $\log_6 5\times3^{x+1}$
for $\log_6(5\times3^{x+1})$, with nothing round the argument — strictly
$(\log_6 5)\times3^{x+1}$ — and the marker ticked it.

**Adrian's ruling: it gets a note, not a deduction.** The mathematics is right and
her own next line shows the intended grouping, so it is a notation habit, not an
error. Award in full, and write one short sentence giving the correct form.

Encoded in both prompts as **BRACKETS ROUND A FUNCTION'S ARGUMENT** (log, lg, ln,
sin, cos, tan, roots), with two guards:
- **This is the ONE case where a full-marks part carries a note**, stated
  explicitly — otherwise the marker starts commenting on every correct answer.
  `error_summary`'s spec was widened for it; the renderer already drew a note on a
  full-marks part, the prompt was simply forbidding one.
- **If the student went on to USE the loose reading**, the missing bracket produced
  the wrong quantity and marks go normally. The test is what their next line does
  with it, never how it looks.

**B5. Circled equation numbers printed as empty boxes. — FIXED 31 Aug 2026.**
Found on the same page. Klaire numbered her equations ① and ②; the marker echoed
them — *"so ② = ① just gives 0 = 0"* — and Patrick Hand has no circled-digit
glyph, so the note reached the page as *"so ⊡ = ⊡ just gives 0 = 0"* and said
nothing. Same class as B1: the marking was right, the page could not draw it.
①–⑳ (plus Ⓐⓑ⑴) now render as `(1)`, `(2)` — what a student writes when they
cannot circle. Applied to the JOINED output, not just the prose path: `② = ①`
counts as a maths run because of the `=`, which is how it leaked past a
prose-only repair in the first place.

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

**C3. The same point made twice. — FIXED 31 Aug 2026, and the gate turned out to
be the bigger bug.**

Measured against **all 505 (error_summary, study_note) pairs the marker has ever
written, across 66 papers** — not against invented examples. Word overlap alone
flagged **92**, and reading them, essentially every one was GOOD: a short
diagnosis naming what broke, then a longer note teaching the rule. They overlap
because they are about the same mathematics. **The gate was silently deleting the
teaching half of nearly one note in five**, and nobody could see what went missing.

The genuine duplicates are structurally different. In 91 of those 92 the study
note was LONGER than the diagnosis (median ~2×). The six real restatements in the
whole corpus are all roughly the SAME LENGTH, because they repeat instead of
expanding — e.g. *"the student is picked from the 15 who study French, so the
answer is 8/15"* beside *"your denominator is the French total (8+7=15), not the
whole 30"*.

So the discriminator is **not overlap, it is whether the second note spent more
words**. You cannot restate a sentence at twice the length without adding
something. Requiring overlap ≥ 0.6 AND length ratio ≥ 0.7 takes it from **92 false
deletions to 6 true ones** on the same corpus. Thresholds set by which way the
error hurts: a false match costs a student the explanation of their own mistake
and leaves no trace; a miss costs one visible repeated sentence, which Adrian sees
and reports. Prefer the miss.

Every test pair is now real corpus data. The lesson worth keeping: an earlier pass
on this same defect, calibrated on hand-written examples, concluded the ranges
were inseparable and *lowered* the threshold — making the deletion worse. The
corpus was available the whole time.

<details><summary>The superseded analysis, kept because the reasoning failure is the point</summary>

**PARTLY FIXED, and the limit is now measured.**
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

</details>

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

---

# 10–11 Sep 2026 round — Adrian's list over twelve papers

Twenty complaints, twelve papers, five root causes. Bins per `docs/FANOUT.md`.
**Fix-forward throughout** (Adrian: "all these are for future markings … no
need to re-release already released papers"); the three papers re-marked were
the ones he named.

| # | paper · complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| E1 | Isabelle AM 2025 P2 "68/90", Joey "am tys 2025 p1" really EM | grounding | the 2025 GCE papers were in no bank, library or scheme; every allocation guessed (68 of 73) | papers extracted + `paper_library` questions rows; inbox now files marker rows, cuts a combined book at its covers, hand-in hint "No questions detected" | ✅ re-marked 74/90, 78/90, 65/90 |
| E2 | purple "needed help" ink ignored | pen | ink scan only knew green | `lib/ink-colour.js` purple hue (bot bd6d37d) | ✅ |
| E3 | Alexis AM 2023 P1 Q9 half-marked; Sijia EM 2022 P2 Q2 page unmarked | rule | a non-work read dropped the page | `nonWorkVerdict`, pre-2023 EM 80/100 totals (7cfaa56…) | ✅ |
| E4 | Alexis AM 2023 P2 `\textcircled` raw, dt beside circled dx, part (b) no chip; EM 2023 P2 map scale "mark like I do" | pen + rule | missing TeX macros; ring + insert could not coexist; no map-scale rule | five rules + `figure-tex` macros, `scored_elsewhere` chip (4193cc4…56c82d4) | ✅ |
| E5 | Joey vectors written as rows; paper named AM | rule | no column-vector rule; level not read off the paper | vector column rule, `capMathText`, `paperSubjectCheck` (b49493a, 3c7d634) | ✅ + run renamed |
| E6 | Joey set 3 P1 Q2 HCF/LCM table, Q14 unmarked page, Q18 turning-point arrow, Q25(c) no chips; P2 Q4 skipped, ticks on printed text | rule + pen | table method unknown; `pageClaimsStudentDrawing`; blank-part rule; line codes on printed text | HCF/LCM rule, `missing_labels`, blank-part exception, `ai/line-codes.js` (0fc090c) | ✅ |
| E7 | Shayenne EM 2022 P1 Q9(b), Chloe Q4b teaching diagrams | pen | no bearing-perpendicular / arc-region kinds | `perpendicular`, `arc_region` (02f7fef) | ✅ |
| E8 | Rainie EM 2022 P2 Q1(d) overlaps, `\euro`, Q9(b)(iii) tick vs cross, necklace pages unmarked | pen | glyphs over each other; answer-line ticks on wrong answers; photo-holds-working unknown | ink ledger, answer-line guard, `photoHoldsWorking` (2f8ab2e…d436b37) | ✅ |
| E9 | Rainie Q10(c) 4/8 — answer split over two pages | rule | fragments of one part scored separately, capped by each page's bracket | `passMergeFragments` (f2ffc89) | ✅ 7/8 forward |
| E10 | Kiara EM 2022 P2 missing in Dropbox | infra | filing failed silently | retry ×3 + never-silent line + `file-catchup` sweep with Telegram (fd3fd9d, cf24b5f4) | ✅ filed |
| E11 | pen realign misfire on Rainie's page (`realignRenumbered` fired on a genuine numbering) | pen | NOT reproduced in 24 live line-pass answers (the one page where the rejoin fires, it is right, proved by geometry). The real weakness: the model sometimes boxes rows we never listed, and such an echo that also drops a line has the same shape as a renumbering — rank-joining it IS the one-line-off. Also a coin-flip tie in `bestIndexShift` on that page | the rejoin now scores both joins against the model's own tick/fix labels and stands aside when the echo fits better; the tie breaks on the same evidence (bot fe49dd8, tests from the real captured arrays) | ✅ forward. Note: pages marked BEFORE 10 Sep (Rainie pp. 1 & 13, Isabelle 2024 P1 p. 3) are stored one line off from their first hole; a stored-pack redraw reproduces it, a 🔁 page re-mark places afresh |
| E12 | Isabelle AM 2024 P2 75/85 — attached-PDF grounding never consults the bank's per-part brackets | rule | the bank is consulted only when the ANSWERS are ungrounded; a library solutions PDF (or the Mac lane's `externalReads`) took the other arm, so every bracket was page-read and split answers were capped | `lib/bank-allocation.js`: when nothing else settles the brackets, the paper's own marks come from the bank, at the one seam all three assembly paths share; a stored allocation still wins, the library key must match, Practice Again sheets refused (bot 5062a75, deployed v1987). Replay: 79/90, not 75/85 (three split answers, not two) | ✅ forward |
| E13 | hand-in 504 (Jamie), machine at load 6 | infra | batch lane off + three re-marks + a hand-in on 1 CPU / 2 GB | resize, `mapLimit` 2, heap 2048, two Fly processes (a2e625f), marker alarm (702e881), `batch_lane` on ops | ✅ |

| E14 | (found by the golden bench on its first run) the allocation re-read corrected only half of a read: `marking.parts` got the printed bracket, `marking_output.parts` kept the old one, so the cover's "marks lost by kind" under-counted by one on Jamie's EM 2024 P1 Q20 | rule | `applyCorrections` rebuilt one of the two part arrays | both arrays corrected (bot 4c20a2f, 3 regression tests) | ✅ forward |
| E15 | Alexis's two 8 Sep runs stored NO placement boxes, so their pages cannot be redrawn from stored ink or go on the pen bench | pen / storage | not a bug: they were drawn 9 Sep 01:02 SGT, and the box store began with bot bc3837a at 13:00 SGT that day. Joey's and Rainie's pages have boxes because they were drawn after it (Joey's on the 10 Sep re-mark). Any page drawn before 9 Sep 13:00 lacks boxes until a 🔁 page re-mark redraws it | — | ✅ closed (explained) |

| E16 | a scheme DERIVED from a student's page reads outranks the bank for every later marking of that paper (`gce 2025 em p1/p2` carry unvetted derived rows from 8 Sep; they happen to agree with the bank — the 10 Sep AM P1 poisoning was the same shape and did not) | rule | stored rows won before the bank was queried, whatever their status | approved scheme > bank (only when its brackets add up to the paper's total) > derived/extracted row > page brackets, at the one seam all assembly paths share; the marker's prompt block follows the winner; a count/total disagreement Telegrams one line; desk stamps `scheme_overridden` / `bank_allocation_refused` (bot bee09bd…, website 9823dc33) | ✅ forward |
| E17 | (found by E16's sweep of every stored scheme) the bank filter for a national paper matches on school/year/level/paper only, so the SEAB **Specimen** filed under the same year (`exam_type='Specimen'`, school GCE — 2021 AM P1/P2, 2016 EM P1, 2023 EM P1) is mixed into the real paper's rows: 27 rows for a 14-question paper, brackets summing to 101 | grounding | `bankFilterFor` / the six query sites ignored `exam_type` | `lib/paper-key.js applyBankFilter` is the ONE place the four fields become `.eq()`s and adds `.neq('exam_type','Specimen')` for a GCE paper; grounding, solver, availability and allocation reads all go through it (bot 26ba2c3) | ✅ forward |

**The bench (11 Sep 2026).** `npm test` now replays eight real papers' reads through the post-read assembly (`test/golden/*.json`, 0.3 s, no credentials) and `scripts/golden-pen.cjs` redraws real pages from stored boxes with five ink checks; the capture recipe is `scripts/golden-capture.cjs <runId>`. A rule or pen fix is verified there and by the page re-mark door, never by re-marking a whole released paper (bot CLAUDE.md § Golden bench).

What the round cost and why (the retrospective's numbers): 19 agents launched
including relaunches, 6 lost to a transient API error or the session limit, 18
bot deploys, 3 hand merges, the queue in-flight on one paper for 20 minutes
twice. The playbook that came out of it is `docs/FANOUT.md`.

**COST-1. A Mac-read paper cost $9.43 on the API (Isabelle, EM GCE 2023 P2, 17 Sep 2026). — FIXED 17 Sep 2026 (bot).**
Adrian: *"why is marking this paper so expensive?"* The Mac read all 36 pages on
the plan, but ~20 retry reads (empty hand-back pages, unmatched lines) "fell
through to the sync API call" because the batch lane was shut and Mac-only was
not on the assembly, and each carried the attached solutions library as an
87k-token prefix — five of them wrote that prefix cold at double price because
the warm-up is skipped whenever the reads are external. Every other Mac-read
paper that week cost $0.06–$0.64. Fix: `handlers/webchat.js` passes
`noApiReads` for any queued paper with no batch executor to fall to (only ⚡
Mark now keeps the sync call), and `ai/external-reads.js` takes a `warm`
callback that runs the cache warm-up ONCE before the first API fall-through
(tests in `test/external-reads.test.js`). Watch for: a page that now goes out
"could not be read" and is re-read by a Mac slot via the auto re-read instead.
The second assembly (page re-mark, 11:28 SGT) spent another $4.14 the same
way before the fix deployed (11:54 SGT) — 35 sync page reads in all, $12.58.
**COST-2. Two Mac slots claimed the same paper 2 s apart — FIXED 17 Sep 2026 (bot).**
`externalClaimNext` guarded only on `queued_at`, which a claim does not move;
the loser's hand-back was refused ("claim lost") so no duplicate reached the
student, but both Macs read all 36 pages on the plan. The conditional update
now also requires `external_claim` to be exactly what the claimant read.

---

# 17 Sep 2026 round — Alessi Tay, EM GCE 2022 P1 (run `022d1058`, marked 16 Sep)

Nine complaints over one paper, read against the stored reads. Bins per
`docs/FANOUT.md`. Fix-forward; the paper is not re-released.

**What the stored reads say first**, because it changes three of the bins:

- The run was keyed `2022 em p1` (student typed "2022 Emath Paper 1"), so it
  never matched the extracted scheme `gce 2022 em p1` that Alexis's run of the
  SAME paper used the day before. It marked on a scheme it derived from its own
  page reads (`grounding.scheme.status = derived`, `allocation = page`).
- Three answer lines (Q17, Q21, Q25(c)) carry `error_type: "transfer"` although
  the slip was on an earlier line of the SAME part — the marker over-applied the
  10 Sep "inherited wrong answer names its source" rule (prompt line ~693).
- Q25(c) line 9 has `slip_token: null` (kind "misread"), so the pen had no
  token to ring and the fix arrow landed on the ✗.
- Q7(b) and Q17 line 2 DO carry a correction text in the read (the missing
  rhombus statement; "O is the centre, not a point on the circle …") — the pen
  did not draw either beside the line.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F1 | Q6: student never said what a and b stand for | rule | no "define your variables" habit note | notation-note shape: full marks, one line beside the tick | ✅ rule (bot 78ff795: UNDEFINED LETTERS ARE A NOTE) |
| F2 | Q7(b) 1/2: the B0 line has a ✗ and nothing saying what is missing | pen | correction text IS in the read (`lines[17].correction`); pen dropped it — suspect the `incomplete` kind or the answer-lines area | ✅ bot fc74bb0: a wrong line's correction and the part's note always reach the page (side strip, footer past that); bench case `alessi-q7b-silent-part` | 
| F3 | Q10 2/3 M1 M1 A0 — "is this SEAB?" | grounding | run not grounded on the extracted scheme (see above). Under that scheme (504π/3 → πr² = 2(168π)+25π → r = 19) the student did step 1 only: **1/3** is the SEAB-shaped mark, 2/3 was the derived scheme's generosity | `lib/paper-key.js`: a school-less name with year + level + paper and no "prelim" is the national paper (student shorthand "2022 Emath Paper 1") | ✅ bot 78ff795 + 7d46482: `seabFrom` reads "© UCLES & MOE <year>" as the national paper and the classifier copies that footer into `paper_header` (test added). The generosity itself is not re-marked (fix-forward). OPEN QUESTION for Adrian: a school-less name with year + level + paper and no printed footer ("EM 2025 p1") still keys as a non-national paper on purpose (the practice-set test) |
| F4 | chips printed twice: Q66, Q1010, Q1515, Q1717, Q2121 | pen | a partless question's part label came back as the question number ("10") instead of "(whole)"/"" (the bank-allocated run had "(whole)"); the chip is `Q${question}${label}` and a second chip is drawn for the part | ✅ bot b901798: `lib/part-label.js isWholeQuestionLabel` — one chip, "Q10 2/3"; also stops the derived allocation re-feeding the spelling and the re-mark purple flagging it; golden fixture `em-2022-p1-partless-labels` + invariant `one-chip-per-part`, bench case `em-2022-p1-partless-chip` |
| F5 | Q17: "concept error" says nothing; should name the concept (angle at centre = 2 × angle at circumference) | rule | the kind label is the bare kind word; the reason lived only in the strip note | ✅ rule (78ff795: A CONCEPT ERROR NAMES THE CONCEPT — correction opens "rule name: right line") + pen (fc74bb0: the words before the colon replace "concept error"; today's stored reads have no colon so they still say "concept error") |
| F6 | Q17 65°, Q21 5x, Q25(c) 6300 all labelled "transfer error" on the answer line | rule | see above — same-part inheritance filed as transfer | ✅ rule (78ff795: the 10 Sep rule revised — answer line null, chain in the correction, part keeps the original slip's kind) |
| F7 | Q17: the lines built on the wrong 35° are unmarked; Adrian wants to SEE the error propagate to the answer | rule + pen | inherited lines are `neutral` by design (the ✗ goes where the error is made) | ✅ ruled 30 Sep 2026 (Adrian: "today is the best, but the second line should circle 35 and say incorrect from previous line") — built as `carried_token` SHIPPED 30 Sep 2026 23:41 SGT (bot 29edbf89, red-pen-batch) |
| F8 | Q18(b): "It represents…" — should open "The elements represent…" | rule | no wording note on a full-marks explain part | ✅ rule (78ff795: AN EXPLANATION THAT OPENS WITH "IT" IS A WORDING NOTE — the one prose exception to the notation-slip rule) |
| F9 | Q21: "+6 · careless" should read "should be +6" | pen | fix label = `${fix_short} · ${kind}` | ✅ bot fc74bb0: `lib/pen-labels.js` — "should be +6 · careless"; bench case `alessi-q21-should-be` |
| F10 | Q25(c): arrow points at the ✗, not at 2000 | rule (+ pen) | `slip_token` null on a "misread" line where one wrong given IS the token | rule: a misread that uses the wrong given sets `slip_token` to that value; pen: when the token appears twice on the line ring the one in the working, not the answer | ✅ rule (78ff795: A MISREAD THAT USES THE WRONG GIVEN RINGS THAT VALUE); pen ring of the first occurrence already existed |

Model split (Adrian, 17 Sep): Opus 5 agents for the pen bugs, verified on
`scripts/golden-pen.cjs` / `pen-dryrun.cjs`; the rule rewrites in this session.

**Shipped 17 Sep 2026 evening:** bot 78ff795 · 7d46482 · b901798 · fc74bb0 (one deploy, `npm test` 3027 green, pen bench 33/33). Fix-forward: Alessi's released paper is not re-inked.

**Same sheet, the Practice Again (job `584dddc6`):** Practice 1 = bank questions Montfort 2023 P1 Q22 + TKGS 2024 P1 Q13; Practice 3 already pairs HCF (Dunman 2024 P1 Q2) with LCM (Swiss Cottage 2024 P1 Q6, the 120 cm cube). Sub-parts sat in the number's column because the worker called `ws.parts()` under a numbered `ws.Q()`: `worksheet_lib.parts()` is now a no-op until the next `para()` stem (website, ADRIAN-STYLE §5).

| F11 | (Lakshanya, H2 VJC 2024 P2, run `b60a84cb`) the footer's Correct solution Q6(d) sentence ran off the page — "sentence is cut off sometimes" | pen | the solver set the whole sentence as ONE `$…$` span of `\text{}` pieces; `wrapPenLine` cannot break inside a span, shrank it to the 11 px floor and it still overflowed | bot b09d72b: a span wider than the line that carries `\text{}` is exploded into words + its maths (`explodeWideSpan`), so it wraps at full size; pure-maths wide spans keep the old path (test in `pen-math.test.js`) | ✅ forward |
| F12 | same paper Q8(a): "probability of one speaker being faulty is independent of the probability that another is faulty" ticked B1; "constant" without "for every speaker" ticked with no note | rule | no rule on the wording of binomial/Poisson assumptions | bot b09d72b: BINOMIAL / POISSON ASSUMPTIONS ARE STATEMENTS ABOUT EVENTS — the probability line is wrong (concept, B0, correction "independence is between events: …"); the missing quantifier is a note beside the tick | ✅ forward (Override on the desk for the released paper) |
| F13 | a student on Q9(a) ("Show that y is always increasing if a² < 3b"): "Teacher i dont really understand 9a" — the strip note was a paragraph; Adrian's own red pen was a column of steps with a reason beside each | pen + rule | phase 2's "From your line" continuation was never switched on (`MARKING_PEN_V2` unset), so the only teaching was the strip paragraph; and the continuation had no place for reasons | bot 1719421b: `step_reasons[]` parallel to the steps (validated ≤ 40 chars, drawn "← reason" under each step, "(shown)" closes a show-that); `MARKING_PEN_V2=1` staged + deployed | ✅ forward |
| F14 | Isabelle EM 2023 TYS P2 (run `cc4eb0e4`) "seems double marked" — 36 pages, every question inked twice | infra + pen | the 18 files were uploaded TWICE (36 distinct URLs, byte-identical pairs, two covers). Reconciliation kept one read per part so 74/90 was right, but both copies stayed in the PDF and the losing copy was inked without chips | bot 4be17b06: `lib/photo-dedupe.js` drops byte-identical photos and renumbers the run's source before the Mac claim and the API lane read (`source.dropped_duplicates`); Isabelle's run re-queued as a whole re-mark → 18 pages, re-issued on release | ✅ re-marked 17 Sep 18:18 SGT: 18 pages read (18 duplicates dropped at the claim), 74/90 unchanged, copy re-issued at 18:21 |
| F15 | Sijia EM 2023 P1 (run `bb025b41`, drawn 17 Sep 17:27 SGT with fc74bb0): Q2(a)/Q6(a)/Q8(c)(i) carry the same note two or three times in the strip; the new red strip text is plain (tofu superscripts, one continuous line); Q5(b)/Q6(a) answer-line fixes point at the ✗ (no ring on an answer line); Q17(b)'s "should be …" label crosses into the strip; Q21(c) B1 drawn nowhere | pen (regression) | fc74bb0 routed every wrong line's correction AND the answer chain to the strip beside the part note that already says it, drew them as plain text, and lengthened labels without re-measuring; answer-line tokens never ring; a two-row matrix line gets no tick | Opus agent `pen-strip`: one typeset note per part (`saysTheSame`), sentence-per-line, ring/arrow on the answer's ink, labels clipped to their column, the matrix tick; bench cases on pages 0/1/2/3/6/8/11 | ✅ bot dfd88ea7: `chooseStripNote` (one typeset note per part), answer-line ring at full width + shared `_slipAnchor`, label re-set whole → kind on its own line → no kind → strip, `fillMissingPartGlyphs`; 8 Sijia bench cases + 4 check kinds (81/81); deployed with 0224ad64 (brand line + student-voice rule) |
| F16 | Sijia Q14 footer "Correct solution": the last three equation lines are not aligned at "=" (prose-prefixed lines break the aligned group) | pen | `groupAlignedTex` aligns only consecutive equation-only lines | open — align the equation tail even after a prose line | ✅ SHIPPED 30 Sep 2026 23:41 SGT (bot 29edbf89, red-pen-batch) (30 Sep 2026): the tail was already grouped on main; the unfit-block fallback now keeps the "=" column |
| F17 | Isabelle EM 2023 P2 (run `cc4eb0e4`, re-marked + re-inked 17 Sep evening): "marking quality dropped for this paper" — Q3(c) states one error five times (strip note ×2, verdict line, "should be" label, the From-your-line box), a red verdict bracket runs from the wrong line down to the answer line ("a red line going downwards across the page… for?"); the whole paper to be audited against the red-pen standard | pen (audit) | the one-note-per-part fix (dfd88ea7) did not cover a part with a continuation, and the redraw path may not share the seam; the verdict bracket spans non-contiguous wrong lines | ✅ three rounds, bot 58ce451a · 6f2eb663 · f9fc5548: an inherited answer line keeps only its ✗ + code; the verdict bracket covers the first contiguous ✗ run, ≤ 4 lines; U+2212 in the pen font; the continuation IS the correction (no strip note, no inline bubble beside it); a footer continuation is a column; a label never echoes the verdict; the footer capped at ⅓ of the page (overflow sheet, `overflow_url_plain`, website 48b88ed9); the redraw door applies purple only for a RECEIVED re-mark. Whole paper on the bench (34 cases, 321 checks). Isabelle's copy re-inked three times, shown to Adrian, awaiting his 're-issue' |
| F18 | same paper, the READS: Q4(c)(iii) rang a sign inside the abandoned read-off route ("should be +7.85") while the answer said "should be −9"; Q6(b)(iii) three ✗ with two corrections for one wrong idea; Q1(a)(iii)'s gap said the opposite of what she did ("divides … instead of multiplying" — she multiplied); "A0:" inside a note | rule | no rule against a second correction inside a wrong route; no read-back of the gap's direction; scheme talk in prose | bot 880c7cc0 (local, deploys with F17): ONE CORRECTION PER WRONG ROUTE, THE GAP SAYS WHAT THE STUDENT DID, no scheme codes in notes | ✅ forward |
| F19 | (process) the pen bench ran only when remembered; a regression reached two students in one evening | infra | no gate, no runtime check | bot 4d93567b/f76a76d2: the bench is a HARD gate in the push hook (a red page check blocks the push); bot 042f7071: **the pen checks its own page** — the bench's 15 context-free checks run on every drawn page (`lib/ink-checks.js` shared, `lib/ink-audit.js`), the result rides `annotated_photos[].ink_audit`, a failing page is named in the delivery's 👀 watch-outs, never held; `MARKING_INK_AUDIT=off` | ✅ deployed 17 Sep (11th deploy) |

# 18 Sep 2026 — the self-check's first night

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F20 | self-check `pen-font-safe`: "−" (Sophie set 1 P2 pp. 3, 5) and "π" (Alexis Prelim Set 3 P2 p. 13) drawn as text in the handwriting font → an empty box | pen | the glyph rule lived only in the CHECK; three short-symbol channels (the notation-slip insert, the two lone-symbol fixes under a ring) pushed raw text into the SVG | bot 0e306dc2: `lib/pen-glyphs.js` is the one predicate both sides read; every marker-text channel goes through `penInk()` / `penSymbolSvg()`, which TYPESETS what the hand cannot write (π/2 → MathJax paths); 16 tests, 6 new bench pages | ✅ |
| F21 | self-check `continuation-is-a-column` ×3 (Klaire EM 2023 P1 p. 5; Alexis pp. 3, 16): "continuation neither on the page nor in the footer" | bench (false alarm) + pen | TWO of three were the CHECK: it keyed a partless part as `Q9(whole)` (F4's seam again) and did not know the overflow sheet as a home. One real drop found alongside: the overflow sheet rendered AFTER the footer committed, so a failed sheet lost a solution or a column entirely | same commit: the check canonicalises via `displayPartLabel` and reads `continuations` off the layer; the sheet is built BEFORE the footer commits, rows leave the footer only once the page that carries them exists | ✅ — note: the self-check's first-night precision on this kind was 50%; a check that cries wolf trains Adrian to ignore it |


# 22 Sep 2026 — the page reader's first two mornings (20–21 Sep), and the fixer's first pass

The reader (`/marking-review`, read-only) found 87 things on 14 papers; the fixer (`/marking-fix`,
new today, 06:45 on the worker) took the placement and symbol classes, the wording went to
proposal branches, and the READ findings below are report-only — a mark never moves by a worker's
hand. Rows F22+ are filled in by the fixer's reports as they land.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| R1 | Sophie AM 2025 P1 p9 Q10(b) and Nicole H2 2024 P2 p13 Q7(iii): a wrong final answer with a ✓ on it (run `e40b7870` photo 8; run `01c39ed9` photo 12) | the read | the marker ticked a line whose value is wrong — accuracy, not drawing | none by a worker — Adrian's call; both pages are bench candidates | 📋 reported 22 Sep, awaiting Adrian |
| R2 | Sophie AM 2025 P1 p14 Q13: the ring and ✗ sit on the CORRECT line and the wrong line below is ticked, three times on one page (run `e40b7870` photo 13) | placement OR the read — the fixer decides from the stored boxes | if the marker named the right line and the pen drew a row up → placement (F22); if the marker named the wrong line → the read | fixer pass 22 Sep | ⏳ |
| R3 | Nicole H2 2024 P2 p21: the parabola figure states 5c² + c − 6 < 0 without ever deriving it (run `01c39ed9` photo 20) | the read (a solution step skipped) | the footer's continuation asserted the inequality it was meant to show | none by a worker — a rule about "show the step you use" is Adrian's | 📋 reported 22 Sep |
| R4 | Joey (run `9ab6da10`) page 11 Q7(b)(i): the RE-MARKED page's note says the range is largest − smallest, not the scale — wrong; the original read ("the exact masses are not known", so the range can't be found from grouped data) was right. Adrian, 23 Sep: "the comment for b(I) is incorrect" | the read | a marker-read slip in the FRESH Mac page read that the desk's 🔁 Re-mark this page triggers (22 Sep 21:44Z, during the 22 Sep on-paper-layout trial, now the `MARK_RED_INK=1` red-ink mode) — NOT the layout: the layout only draws what the read says. A re-read is a new read and can regress a part the first read got right | none by a worker — Edit marking / override on the run fixes the note; the general point (a page re-mark re-reads and can lose a correct part) is a bench candidate: seed the stored read into the re-read as the prior | 📋 reported 23 Sep, Adrian's call |

**The fixer's first pass, 22 Sep 2026, 01:00–02:30 SGT** — four Opus agents in their own clones + one drafter; every fix proved on the bench in the MERGED tree (npm test 3274, pen bench 479/479 on 49 cases) and one real page redrawn and looked at; bot deploy `798ef177` live 01:41. Fix-forward: nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F22 | Sophie AM 2025 P1 (run `e40b7870`) page 15 Q13: every glyph one row too high — "the ring and ✗ sit on the CORRECT line and the wrong line below is ticked, three times on one page" | pen (placement) | ONE neutral `Sketch:` line on the page made the rows-first matcher stand aside for the whole page (it stood aside for ANY sketch line, but a neutral one carries no mark, so nothing was gained); the fallback anchored "2y = 3x + 17" on the student's "2y − 3x = 17" one row up and the column followed. 68 of 1678 pages in the fortnight lost the matcher this way | bot `17ab76e0`: `rowsFirstEligible` — stand aside only for a sketch line that carries a mark; bench `test/row-place-anchor-row.test.js` (red → green) + pen case `sophie-am2025p1-p14-q13-anchor-row`. RESIDUE: a page whose sketch line DOES carry a mark (379 in the fortnight) still uses the fallback — its own class | ✅ live 22 Sep |
| F23 | Sophie p5 Q5(b): "X and Y are already the logs" printed three times at one ✗ (label head, the correction under it, the verdict); p9 Q9 twice | pen | a concept label's head IS the rule its correction opens with (`conceptRuleName`), so head + correction repeated it by construction; the 17 Sep label-vs-verdict guard only ran on a label that also carried a fix | bot `e7484b25`: `dropRuleHead` (pure, tested) cuts the head off the correction once said; a kind-only label the verdict already says is drawn headless; new check `no-duplicate-text-per-part` (bench + runtime); 2 cases red → green | ✅ live 22 Sep |
| F24 | Sophie p6 and p15: a ✓ labelled A0, a ✗ labelled M1 (three on the paper). The reader's "✓ AND ✗A0 on one line, p8" was a misread — p8 agrees with itself | pen | `ai/line-codes.js` checked that per-line SEAB tags reconcile with the scheme, never that a code and its glyph agree | bot `6d7c5ef5`: a contradicting tag is a broken attribution → the page's codes fall back to the score box; marks untouched; `glyphs-follow-verdicts` extended; 2 cases | ✅ live 22 Sep |
| F25 | Isabelle EM 2021 P1 (run `5122be34`) pp. 4, 7: the ✓ drawn ACROSS the value she wrote on the printed "Answer ……" rule ("16"; "4x² + 12xp + 9p²") — the reader's "tick on the printed word Answer" and "red ink over her handwriting" are one bug | pen | a value written ON a printed rule is masked out of the writing layer by `ruleMask`, so the ink walk saw only the word "Answer" and stopped there, on her answer | bot `a93eca58`: `_slidePastInk` in `ai/annotate.js` — after the de-overlap nudge, a glyph steps past ink it would cover to the first clear square of its own size, off the page raster; new bench check `marks-clear-of-ink` (bench-only — needs the raster), 2 cases red → green. The reader's p5 Q12(c) "ink over her list" was a false alarm: that is the RING doing its job | ✅ live 22 Sep |
| F26 | Sophie p14: a strip note printed its maths delimiters — "$Area=$" | pen (rendering) | `explodeWideSpan` turned the bare TeX control space between two `\text{}` blocks into a lone-dollar token, which re-paired with the next `$`. Not a marker slip: no "$$" exists in the stored run | bot `798ef177`: `flushMath` drops a piece with nothing to typeset; unit test + case `sophie-am25p1-p14-strip-dollars` | ✅ live 22 Sep |
| F27 | Isabelle EM 2021 P1 p6 Q13: a ✓ dropped mid-sentence into a full-width PROSE answer | placement, but the right place is a judgement | no clear space exists anywhere on the line, so no slide helps | none — where does a ✓ go on a prose answer: end of last line / left margin / beside the part? | ✅ ruled 30 Sep 2026 (after the last word, left margin as fallback) — SHIPPED 30 Sep 2026 23:41 SGT (bot 29edbf89, red-pen-batch) |
| F28 | Sophie p14 Q12(b) and p12 Q11(b), both 0/3: the worked solution is written but EXILED to an overflow sheet while the page is seven-eighths blank | pen (placement) | a 0/n part gets no "From your line" by rule, so the solution is the only teaching; the blank-space placer needs one fully ink-free rectangle, scanner speckle (dilated) denies every window, the block falls to the footer, the footer busts `SOLUTION_OVERFLOW_FRAC`. A smaller fitting attempt was tried and reverted — the height is typeset-maths ascent, not font size | none yet — the real fix (split the block, or relax zero-ink on a near-empty page) risks writing over faint working; bench-only check `solution-stays-on-the-page` exists and fails the page | ✅ ruled 30 Sep 2026 ("yes do this") — near-blank placement SHIPPED 30 Sep 2026 23:41 SGT (bot 29edbf89, red-pen-batch) |
| F29 | Sophie p13 Q12(a)(ii) 0/3 carries four ✓ before the ✗ | rule, not a leak | `quietZeroParts` did exactly what the 12 Sep rule says: "lines BEFORE the ✗ keep their ticks — they were right on their own" | none — should a part that earned nothing carry any tick at all? | ✅ ruled 30 Sep 2026 ("keep the ticks, but explain why 0/3 — specific to the question") — SHIPPED 30 Sep 2026 23:41 SGT (bot 29edbf89, red-pen-batch) |
| F30 | Nicole H2 2024 P2 (run `01c39ed9`) p1: the ✗A0 on the printed question line, and a note box so narrow it wraps mid-phrase | pen (note placement) | not diagnosed this pass — "washed-out scan reads as blank" was tested and is wrong (the print is dark) | own class, next pass | ✅ **SHIPPED 1 Oct 2026** (bot main 4378b10a = proposal `mark-stays-in-its-part` edb4be6, + 0882f195: the "already clear" test for the nudge now uses the collision's own x reach, else two same-line ticks slid onto one spot — bench isabelle-em23p2-p4-q2ac caught it at 620/621; shipped at 621/621, tests 3651) — ring clamped to its line and part, no nudge off its own line or into the next part, a squeezed note goes to the side strip; new ink check `mark-stays-in-its-part` (bench-only) + pen case `nicole-h2-q1a-ring-stays-in-part`. Earlier: ⏳ handed to the page fixer, 30 Sep 2026 — a cloud builder narrowed it from the stored read (run 01c39ed9 photo 0): two ✗A0 on the page, line 10 "b = −2 − 2i" (row box x 551–709, y 425–448, whose top edge meets part (b)'s region at y 445 — the printed (b) question sits at y ≈ 445–534) and line 22; the matcher already drops PRINT rows (ai/row-place.js), so either the scan tagged the printed row hand/mixed or the ✗ spilled onto print from the row above. Narrow note: part (a)'s band leaves ~110 px to the page edge, so the 16-character variant wraps to ~7 lines. Needs the drawn layer `runs/01c39ed9-…/annotated/p-layer-1789857494093-62d39ef7.svg` + photo 0, or `ROW_SCAN_DUMP=… node scripts/rows-debug.cjs <run.json> 0` on a box with keys.|

**Wording proposals** — branch `proposal/2026-09-22-reader-words` on the bot (rebased on `798ef177`, npm test 3276, bench 479/479), one commit each, ship with "ship proposal reader-words N":
1. `6a8ca292` a note names the STEP, not the idea, and never opens with the student's own wrong move — "it only needed the right area and the × dx/dt" → "A = 9 + x², so dA/dt = dA/dx × dx/dt = …"; "From taking ln of the plotted values" → "the plotted values ARE ln x and ln y, so b is the gradient straight away". No meaning change.
2. `e5320f3e` the chip says "copied wrongly", not "transfer error" (SPEC-RED-PEN §3's words). Meaning change: breaks the "<kind> error" pattern of 3 Sep for one of the nine; the stored code stays `transfer`.
3. `5aa8962a` the kind goes UNDER the fix; the " · " glue is never a multiplication dot ("should be π/k · the base of the triangle is AB" read as π/k × the base). Layout, not wording; two corrections that used to be dropped now fit.
4. `1c83369f` "should be" goes only in front of a VALUE — "should be not a whole number!" → "not a whole number!" (the prompt rule is what makes it write 196).
5. `6aea20d5` "careless!" is never written over work the student got right — a verdict that is only a kind word is not drawn; the kind still rides the ✗. Meaning change: DELETES ink, Adrian's voice; alternative = draw it only level with its own first ✗.

# 23 Sep 2026 — the fixer's first scheduled run (findings of 23 Sep: Denise AM 2021 Specimen P2, Eva EM GCE 2023 P1, Joey EM O Level 2024 P2)

The reader ran 06:15–07:20 (55 min, three papers, 33 pages); the fixer took its file at 07:20. All three papers were drawn after the 22 Sep 01:41 deploy, so every repeat is residue. **What Joey's pages were:** the reader pulled them at 06:25 SGT, during the 22 Sep 21:35Z whole-paper re-mark in the in-page layout that Adrian set aside; the original marking was put back at 23:39Z and the restore dropped the run's stored placement (`annotation_debug`), so no Joey page can go on the bench. Most of the reader's Joey findings (no strip, no footer, notes on the sheet, nothing beside the working) are that layout, not the default pen. Fix-forward; nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F31 | Eva EM GCE 2023 P1 (run `5fd4dc4b`) p1: four ticks sit on the printed word "Answer" — "Answer✓ …68.5… or …111.5…", "Answer✓ …77.9…", Q3(a), "Answer k=✓ …6…"; seven on the paper (the reader's P3, F25's residue on pages drawn AFTER the 22 Sep guard) | pen (placement) | the guard (`_slidePastInk`) keeps a glyph off ink; it cannot move a glyph that already sits on clear paper. The walk that SEATS the mark reads the writing layer, and a value written ON the printed dotted rule is masked out of that layer together with the rule — so the last ink it sees is the printed word "Answer", the 1¼-line gap-stop fires on the dots, and the ✓ lands right after the print, a hand's width before her answer | bot `434bcb4`: `_answerLineInkEnd` (ai/annotate.js) reads the page's own raster across the answer line's band — ink runs, background past the paper's edge and the printed "[2]" bracket excluded — and the mark seats past the value; wired at the mark seat and at the crossed-step leader aim. New bench check `answer-mark-past-value` (raster, bench-only) + case `eva-em2023p1-p1-ticks-after-the-answer` (red 4 marks → green 5/5, looked at); 6 unit tests. F25's two Isabelle cases stay green | ✅ forward |
| F32 | Joey EM O Level 2024 P2 (run `9ab6da10`) pp. 2–3: the read has `question_number: "?"` (the number is on the previous photo) and the sheet printed "Q? –" over the notes and "Correct solution – Q?:"; the self-check keyed the continuation "?(b)" and reported it dropped while the column was on the sheet as "(b) — from your line" (`ink_audit.ok:false` on both pages, shipped as watch-outs) | pen (caption) + self-check (false alarm) | the pen captioned the raw stored '?' at four sites; `continuation-is-a-column` built its key from the raw question on the part and the object, so the two halves could never match on an unnumbered part | bot `434bcb4`: `_qCaption` — a caption names a numbered question or nothing (the chip already did this via `qTag`); the check treats '?' as no number on both sides. New check `no-unknown-question-caption` (runtime); 4 unit tests. No pen case: the only page with the defect lost its stored placement in the 23:39Z restore. RESIDUE, own class: a part with NO located box skips the side-strip chip guarantee and its score and note go to the footer (in the default layout still on the page; under the in-page experiment they went to the sheet) | ✅ forward (caption + check); ⏳ the unboxed-part chip |
| F33 | Eva p2 Q5(a), p13 Q24(b); Joey p11 Q7(b)(iii): a double caret "∧∧" with nothing written at it (the reader's P5, new) | pen (placement) — but the caret's meaning is Adrian's (5 Sep 2026: "keep going from here", the From-your-line block picks up below it) | the caret is drawn at every 'incomplete' ✗ whether or not the column it announces landed on the page; when the column went to the footer or the sheet the page shows two carets pointing at nothing | PROPOSAL `proposal/2026-09-23-caret-only-with-column` (bot `bb8b5f3`): carets stashed at the ✗ and drawn inside the column's own object only when the column lands on the page within the part's reach; check `caret-has-a-column` + case `eva-em2023p1-p2-bare-caret` (not drawn on the worker — load 25 on 2 CPUs; the Ship gate's `npm test` covers the check) | ✅ shipped 30 Sep 2026 — caret-only-with-column (bot PR #9, Adrian: "do all, and merge") |

**Report only (the read — a mark never moves by a worker's hand):** Joey p1 Q3(b) the ✗ on the answer line four rows below the M0 line (S1); ticks after the ✗ on 1/2 and 1/3 parts (S2, six pages — F29's question for the non-zero case); Eva p1 Q4(b)(i) "2 × 7² ✓" in a 0/1 part (S3); Eva Q8(c)(i) 116 for 115.75 marked B0 (the paper's own 3 s.f. rule), Q4(b)(i) 98 with 2 × 7² in the working marked 0, Q5(a) borderline, Denise Q6(c) 199.8° (S4 — in the reader's digest to Adrian); "M1ft" beside a tick (S5).

**Not worked tonight (residue, in order of the reader's counts):** P4 red ink over handwriting (8, mostly Joey under the in-page layout), P8 glyph tally vs chip (7), P6 several ✗ for one error (6 — the 17 Sep rule gives the inherited answer line its ✗ + code on purpose; the reader disagrees with SPEC §2.1 — Adrian's rule), P7 label legibility (4), P2 explanation in the strip while the space beside the working is blank (2).

**Tooling seen:** a whole-paper re-mark set aside and restored (`restored_from`) drops `annotation_debug`, so the restored pages cannot be redrawn from stored boxes or benched — a bug candidate for the restore path, not touched tonight. `npm test` and the pen bench on the Fly worker run at load 20–28 on 2 CPUs (a case takes 7 min, the unit suite would take hours); the fixer ran the two new unit files, the golden replay and 8 pen cases, and leaves the full suite to CI.

# 24 Sep 2026 — the fixer's second scheduled run (findings of 24 Sep: Alexis EM Prelim Set 3 P2 `a3b4e521`, Joey O Level 2024 P2 `9ab6da10` restored)

Both papers were drawn BEFORE the 23 Sep `434bcb4` deploy (Alexis 22–23 Sep, Joey 21 Sep), so the reader's "Answer✓" repeats are pre-fix and yesterday's classes could not be judged yet; nothing reverted. Joey's run still has no stored placement (the 23:39Z restore), so every fix below is benched on Alexis's pages. Fix-forward; nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F34 | Alexis p1: the footer column's reason "← the second fraction needs x + 2" in MathJax's serif under a hand-written neighbour; p17's strip "the 20% assembly fees, the 9% GST and the total" serif between two `$…$` spans; p7 "should be ∠AOB — the angle at the centre" wholly serif; the fix label "should be 5(x+2) · careless" the same (the reader's P7 "two fonts in one sentence", ×4). And the page-1 self-check cried wolf: `continuation-is-a-column` reported the reason LOST and the page shipped as a watch-out — the reason was there, as paths | pen (rendering) + self-check (false alarm) | `ai/pen-math.js measurePenLine` typeset any line that mixed prose with a `$…$` span WHOLE, prose inside `\text{}` — a 2026 defence against positioning paths by ESTIMATED text widths, kept after prose widths came from the vendored Patrick Hand TTF. A whole-line typeset has no `<text>` node, so the check that reads `<text>` rows saw no reason at all | DESIGNED, NEVER SHIPPED: the split per RUN — prose in the pen font, only the spans typeset; a symbol the hand cannot write (∠ π ⇒ ≅ …, `lib/pen-glyphs TEX_FOR`) becomes a tiny typeset run of its own, never "angle"; `PEN_MIXED_LINE=whole` restores the old route without a deploy. Bench cases `alexis-set3p2-p17-strip-in-hand` (`text-renders contains "assembly fees, the"`) + `alexis-set3p2-p1-footer-reason-in-hand` (`"· careless"`, `"second fraction needs"`) were drafted and are NOT in the repo. ⚠ The 24 Sep fixer recorded this row as `✅ forward` with a placeholder sha: nothing reached `main` — its clone under `/tmp` died with the worker's 25 Sep reboot before a commit (found by the 25 Sep fixer). Not re-made on 25 Sep: the worker was throttled (92 % CPU steal) and this is the largest of the three | ✅ SHIPPED 30 Sep 2026 23:41 SGT (bot 29edbf89, red-pen-batch) (30 Sep 2026): the per-run split was on main since 29 Sep; the batch closes the remaining serif spans and the continuation-is-a-column false alarm |
| F35 | Alexis p5 Q3(a)(ii): the "from your line" first step printed `$P(text{at most 2 white}) = 3left[frac{1}{2} × frac{1}{2} × frac{1}{2}right] + …` in the hand font — backslashes gone, dollar kept, a dangling "+" (the reader's P2, new) | the read (a truncated step) + pen (raw on the page) | the read's `steps_latex[0]` is an UNTERMINATED `$…` span (cut off before the ⅛ term); `splitMathRuns` treats an unclosed `$` as prose so a stray dollar can never swallow a line, and `texEscapeText` then stripped the control words | bot `e7a3895` on `proposal/2026-09-25-reship-f35-f36` (re-made 25 Sep by the fixer — the 24 Sep fixer's `✅ forward` was a phantom: its clone died with the worker's reboot before a commit): `closeUnterminatedMath` (ai/pen-math.js) — an unclosed span that is plainly TeX (a `\command` follows) is closed at the end of the line and typeset, a trailing bare operator dropped; applied in `splitMathRuns` and before `repairSolutionText` routes the line; a currency `$5` / `$x set` stays prose. `text-renders` now names stripped control words (`frac{`, `text{`, `left[`) and a delimiter `$` as raw. Case `alexis-set3p2-p5-unclosed-span` in the branch — UNRUN on the throttled worker; `test/pen-unclosed-span.test.js` (8 tests, green) pins the helper, the routing, the typeset paths and the check | ✅ shipped 30 Sep 2026 — reship-f35-f36 (bot PR #9, Adrian: "do all, and merge") |
| F36 | Alexis p17 Q9(b) 1/8: the chip lists "B1 B0 M0 M0 M0 M0" — six of the scheme's eight codes ("B1 B0 M0 M0 M0 M0 A0 B0") — so the chip reads as a part out of six (the reader's P8) | pen (chip) | `schemeCodes` cut the list at six to keep the chip narrow | bot `c3d95eb` on `proposal/2026-09-25-reship-f35-f36` (re-made 25 Sep — the 24 Sep `✅ forward` was a phantom, see F34): every code or none — `lib/scheme-codes.js` (`validSchemeCodes`, `codeRows`) is the one rule for the pen and the check; seven or more wrap over two rows inside the chip, the chip's reserved height grows with them (reserve and draw share the geometry). New check `chip-codes-complete` (bench + runtime); `test/scheme-codes.test.js` re-pinned (geometry + drawn rows). Case `alexis-set3p2-p17-chip-codes-complete` in the branch — UNRUN on the throttled worker | ✅ shipped 30 Sep 2026 — reship-f35-f36 (bot PR #9, Adrian: "do all, and merge") |

**Proposal** — `proposal/2026-09-24-costing-on-the-page` (bot `8ce52d5`): a decide-and-justify part that lost most of its marks makes its costing the continuation — every option priced, the decision checked against every limit — never only `overall_comment`. Why: the reader's two comprehension fails (Alexis Q9(b) 1/8, Joey Q9(c) 4/7) both had the numbers in the read and none on the page. ⚠️ Adrian's call.

**Report only (the read — a mark never moves by a worker's hand):** S1 Joey p2 the ✗ four rows below the M0 line; S2 ticks after the ✗ on 2/3 parts (5 pages); S3 Alexis p11 two ✓ in a 0/2 part; B1 Alexis p11 green pen counted in (ii) and not in (i) — glyphs on green lines (SPEC §4); S4 Alexis Q6(c) 0/5 wholly green, Joey Q7(b)(i), Alexis Q9(b) 1/8 (in the reader's digest); S5 "M1ft" beside a tick. P6 (two or three ✗ for one error) stays Adrian's rule; P4/P7/P8 on Joey's pages cannot be benched (no stored placement).

**Tooling seen:** the bench cannot reproduce every placement — its raster differs a little from production's, so Alexis's page-1 column seats ON the page where production put it in the footer; the p1 case therefore pins the mixed-line rendering through the fix label instead. The bench redraw of page 1 also failed its own `verdict-bracket-tight` self-check (a bracket y 0–1181 running past four ✓) that the delivered page did not — not worked tonight. A case took 12–25 min at load 23–25 on the 2-CPU worker.

# 25 Sep 2026 — the fixer's third scheduled run: no new findings, and yesterday's fixes were never shipped

No paper was delivered in the reader's window, so there was no findings file. The second guard
(§4 of the skill) then found that the 24 Sep ledger's three `✅ forward` rows above (F34–F36) had
placeholder shas and NO commit on `main`: the 24 Sep fixer's clone lived under `/tmp` and the
worker rebooted at 09:20 SGT on 25 Sep before anything was committed or pushed (the rows above
were sitting uncommitted in this checkout too). Nothing delivered was affected — the fixes were
simply not live, and the classes will recur until they are.

F35 and F36 were re-made from the ledger's own design (bot branch
`proposal/2026-09-25-reship-f35-f36`, commits `c3d95eb` F36 · `e7a3895` F35, unit tests green,
bench cases in the branch) and handed to Adrian as a proposal rather than pushed to `main`,
because **the pen bench could not run**: the worker showed 92 % CPU steal all morning (Fly's
shared-CPU throttle once the burst credit is spent — the marking and sheet slots spawn dozens of
`claude auth status` processes a minute), and the case that drew in 6 s at boot did not finish in
20 min an hour later. A pen change unproven on the bench is not shipped by a worker's hand; the
Ship tap runs CI's `npm test` (the pen bench needs the page store and is not in CI), so shipping
on that alone is Adrian's call. F34 — the largest of the three — was not re-made and stays open.

Tooling: the bench needs a box that can draw a page in seconds (a Mac), or a hand-started
GitHub Actions job with the page-store keys in the `vision-trial`-style environment — not built.

# 28 Sep 2026 — the fixer's run on the findings of 28 Sep (12 papers, 40 pages, ~79 findings)

The second guard found nothing to judge: no fixer change had shipped since 23 Sep (the 25 Sep
re-made pair still sits on `reship-f35-f36`), so every repeat of an older class is residue.
Two classes worked, most frequent first among the ones two teachers would fix the same way.
Fix-forward; nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F37 | Nicole H2 2024 P2 (run `8f41ab3d`) p7: about ten ✓ in a 0/2 part beside three ✗ — "a student sees a page of ticks and zero marks"; also Kassandra AM22 p11, Isabelle Zhonghua p7/p8 (the reader's R-b, filed under F29). And Nicole p13: ticks on two lines the stored read calls neutral, in a 1/3 part | pen (ordering) + rule scope | Adrian's 12 Sep rule (`quietZeroParts`: no tick after the ✗ in a part that scored nothing) ran only at ASSEMBLY, after every page had been drawn — the stored read said "no tick", the page kept the tick: 90 ticks on 36 pages in the fortnight to 28 Sep. Separately, the rule was page-wide: an M0 belonging to a SCORING part (Q7(a)(iii) 1/3, "M1 M0 A0") quieted the follow-through after it because two B0 parts on the same page scored 0 | bot `99e94b4`: `markPhotoDirect` quiets its own read before the code plan and the drawing (the assembly call stays, idempotent); a zero code starts the quiet only when a zero-scoring part's scheme lists it. `test/zero-part-ink.test.js` on the raw reads of that paper (`test/golden/zero-part-ink-h2-2024-p2.json`, from `paper_external_reads` + the drawn boxes): red on main 2/5, green 5/5; full `npm test` 3439/3439. No pen case: the pen bench redraws from STORED lines, which were already quieted — the gap was upstream of it | ✅ forward |
| F38 | " * " between a part's note and its study note, ~12 pages (the reader's P1): "not attempted * Start by …", "…for every burger * The two binomial …"; on Chloe EM 2023 P1 p9 it read as maths, "the overlap A ∩ B * A union takes in …" | pen (text) | the 29 Aug fold (one home per mistake) joined the two texts with a bare "  * " because Patrick Hand has no ✱ | bot `995abd3` on `proposal/2026-09-28-no-asterisk-glue`: `note-dedup foldStudyNote` — two sentences, the second never re-cased; `text-renders` now fails on a bare " * " between words. Case `chloe-em23p1-p9-no-asterisk-glue`: FAIL on main, PASS on the branch (drawn on the worker); unit tests green | ✅ shipped 30 Sep 2026 — the 29 Sep note composer (no-asterisk-glue dropped as superseded) (bot PR #9, Adrian: "do all, and merge") |

**Report only (the read):** Alessi AM 2021 Specimen P2 p2 (`c169300c` photo 1) — "should be 1.8" drawn at (b)(iii)'s ring on g = 161.9: the stored boxes put L10 "Answer: 1.6 secs" on the row where L17 "Answer: g = 161.9" is written and L17 got no box at all, so the rows matcher paired two "Answer:" lines wrongly (needs the row scan to bench — not stored); Denise EM 2025 P2 Q3(d) scored 0 from a page missing from her hand-in, and the bank's labels "d)(i" are malformed (in the reader's note to Adrian); R-c … R-h as the reader listed them.

**Not worked (residue, the reader's counts):** P4 red on handwriting (6), P2 other wrong-seat labels (5), P6 stray ticks on blank paper (6), P5 leaders across working (5), P10 the same point 3–4 times (7), P8 empty "Marker's notes:" heading (4), P7 notes clipped at a stripless page's edge (3), P9 raw TeX / caret / π spelt out (3), P11–P14.

# 29 Sep 2026 — the fixer's run on the findings of 29 Sep (8 papers, 40 pages, ~72 findings)

The second guard: F37 (bot `99e94b4`, no ✓ after the ✗ in a part that scored nothing) held on all
40 pages, every one drawn after it shipped — nothing to revert. Every page was drawn BEFORE this
morning's red-pen readability commits (`2196988`, `9bab0e2`, `79e31f1`, `48a152e`, `8f9ff8a`), so
the " * " glue, serif prose in notes and the repeated rule heads are residue to judge on tomorrow's
pages. `2196988`'s `composePartNote` rewrote the seam `no-asterisk-glue` (F38) changed, so that
proposal is marked superseded. Fix-forward; nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F39 | an EMPTY "Marker's notes:" heading at the foot of the page (Alexis EM GCE 2024 P1 p17, Denise EM 2023 P2 p20, Joey AM Prelim set 4 P1 p1; the reader's 28 Sep P8 too) while the "From your line" column went to the overflow sheet — on Denise's page the answer to "Is Zhao correct?" is only on that sheet | pen (footer) | every note that spilled was a continuation column; columns have their own footer bucket, and when the footer cap moved them to the overflow sheet the heading stayed behind in the head bucket alone | bot `0040d5d`: a heading that heads only columns comes off with them (`_dropOrphanNotesHead`); new ink check `no-empty-notes-heading` on every drawn page; the bench can set a case's pen env (`"env"`) and check the with-solutions copy (`"page"`). Case `alexis-em2024p1-p17-empty-notes-heading` (drawn with FOOTER_CAP_FRAC 0.1 — since this morning that page's column fits under the cap): FAIL on main, PASS on the fix; `denise-em2023p2-p20-…` a guard | ✅ fixed |
| F41 | the pen's own self-check flagged Alexis EM GCE 2024 P1 p17's Q27(b) column "4 reasons on 3 row(s) — a column is one to a line", a watch-out on the desk, although all four reasons sit on rows of their own | pen self-check | `continuation-is-a-column` finds a reason by its words before the first maths token; "compare coefficients of $a$" and "… of $b$" both come down to "compare coefficients of", and both found the first such row | bot `9accbb4`: a reason takes the first matching row no earlier reason has claimed; two reasons really squeezed onto one row still fail (`test/continuation-column-check.test.js`, red on main's check) | ✅ fixed |
| F40 | exponents typeset as full-size stacked fractions — "50x^{1/3}" read "50x 1/3" (Isabelle ACS(BR) Prelim 2025 P1 p6 Q7), "4e^{½x}" read "4e ½ x" (Joey AM set 4 P1 p3 Q3(b)): a power that reads as a product | pen (typesetting) | `ai/figure-tex.js upgradeFractions` sets every fraction `\dfrac` "including inside exponents" — Adrian's rule for the Learn figure labels — and the pen shares `texBlock` | bot `fad5135` on `proposal/2026-09-29-small-exponent-fractions`: the pen only asks for `scriptFractions` — a fraction inside ^{…}/_{…} keeps script size; figures unchanged | ✅ shipped 30 Sep 2026 — small-exponent-fractions (bot PR #9, Adrian: "do all, and merge") |

**Report only (the read):** Chloe EM 2023 P2 p18 Q9(c) 2/7 — the note says "divide the year by
365 days … (8.26, so 9)" and "should be 8.26", but 8.26 is HER 336-day figure; with 365 days it is
7.60 kWh ÷ 0.99936 → 8 panels (the page contradicts itself); Joey AM 2024 P2 p15 Q10(a)(ii) —
"should be 110" beside her R = 55 and "R = 110 is wrong" in the strip; the corrected ≈ 98 in the
read never reaches the page; kind "transfer" untrue; Isabelle ACS(BR) P1 p8 Q10(c) 0/1 —
shading right relative to her own bisector (does ft earn the B1?), kind "transfer" untrue;
Isabelle P1 p4 Q3(a) B1 for "every four months … 3rd quarter" (possibly generous); Alexis EM
2024 P1 p17 Q27(b) ring on the "−" with the words "equate the coefficients!" (two different
things); Denise p20 Q9(b) the note names only the walks; Joey set 4 P1 p1 Q1(b) never teaches the
"Hence" link.

**Not worked (residue or already open):** glyphs on print / handwriting (~14, the P4 class; Denise
p20 is a strip-less page); arrows ending at nothing or at the correct term (~8); leaders through
her ink (~6); a ✗ on a crossed-out line while the standing answer below is bare (Rainie AM 2023 P1
p18, `89324a6f` photo 17 — new, one page; bench candidate); stray wordless ✗ (4); labels against
the wrong table cell (Chloe p7); boxes clipped at a page edge (3); ∧∧ at nothing (F33, open on
`caret-only-with-column`); chip drops a code (F36, open on `reship-f35-f36`); a second strip note
under the bare "Q10:" (Joey 78e40f9b p14). Wording (Adrian's): one slip two kinds; "transfer
error"; " · " read as ×; a phrase-bank verdict as the only words; the same wrong final value ticked
in the working and crossed on the answer; a follow-through "should be" with no "from your
equation". Proof on the worker: `npm test` 3457/3458 (the one red was the case-shape test, fixed before the
push; the touched files re-run 60/60 on the final tree); the 15 other pen cases whose page carries a
"From your line" column redrawn on the fix, all green — the other 35 cannot change (the heading is
dropped only when every note under it is a column).

# 30 Sep 2026 — the fixer's run on the findings of 30 Sep (9 papers, 40 pages, ~74 findings)

The second guard: F39 (bot `0040d5d`, empty "Marker's notes:" heading) and F41 (`9accbb4`) are on
main and held — no empty heading on 40 pages drawn after them; today's self-check false alarm on
Sun p6 is a different shape (an all-maths reason, F44). F38's " * " glue is gone. Nothing to revert.
This morning's first two fixer runs lost their work to worker reboots (a push touching the worker
redeploys it and wipes `/tmp`); the third rebuilt it from the second run's transcript and worked on
the `/data` volume. Fix-forward; nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F42 | symbols spelt out as words in column reasons and notes (7 pages): "sub (pi/4, 1)" (Denise AM 2024 P2 p5), "from 6costheta × t = 15" (Denise AM 2025 P2 p15), "32, 8 and sqrt2" on an indices page (Beryl p1), "curved surface is 2pi(6)(15)" (Beryl p12), "∠s in same seg" as "angle s in same seg" (Shayenne p9, Denise p14), θ as "theta" (Shayenne p15), and "tan ⊥ rad" as a tofu box (Shayenne p9) | pen (text) | a pen line with no `$…$` went to `penSafe` whole, which transliterates (π→pi, θ→theta, √→sqrt, ∠→angle, ⊥ none); only a line that already had maths typeset its symbols | bot `e3110fd`: `penRunsOf` also splits a line whose words hold a symbol the hand cannot write and the typesetter can (`needsTypeset`); the symbol keeps its spacing ("∠s", "π/4"), a surd takes its operand. `text-renders` takes an `absent` list. Seven cases (`shayenne-em25p1-p9-perp-and-angle-words` …), FAIL on main, PASS on the fix | ✅ fixed |
| F43 | Alessi EM 2025 P1 p12 Q20(b) verdict "write AP as $31 – PB$ and solve" — raw dollars, read as money; the self-check passed the page | pen (text) | the pen's own `autoTexProse` wrapped "31 − PB" in `$…$`, and the currency-aware `splitMathRuns` refused it as prices and drew the delimiters | bot `9652e33`: `autoTexProse` wraps only what `looksLikeMath` accepts. Case `alessi-em25p1-p12-verdict-dollars`, FAIL on main, PASS on the fix | ✅ fixed |
| F44 | the pen self-check failed Sun EM 2024 P1 p6 "lost the reason √484 = 22 / 2 reasons on 1 row" although it sits on its own row (a false watch-out, F41's cousin) | pen self-check | `continuation-is-a-column` found a reason by the words before its first maths token; an all-maths reason has none | bot `a375ad7`: a reason is found by its hand-written words only, an all-maths reason is not counted either way, and every `<text>` on one baseline is one row (F42 draws "tan ⊥ rad" as pieces). Unit tests red on main's check; case `sun-em24p1-p6-all-maths-reason` | ✅ fixed |
| F45 | two different "should be"s on one part — Denise AM 2025 P2 p15 Q11(b): "should be 15/(6cos53.130)" (worked on her wrong angle) and "should be 3.125" (comprehension FAIL; 29 Sep saw the same class) | marker rule (wording) | the rules cover an inherited answer and a slip inside a wrong route, not a real second slip worked on an inherited value | bot `0590dec` on `proposal/2026-09-30-follow-through-fix-says-so`: fix the operation without the inherited number, or label both numbers in one sentence (Beryl p13's "$132.30 on your area; with the correct 917 cm² it is 4 tins, $75.60") | ✅ shipped 30 Sep 2026 — follow-through-fix-says-so (bot PR #9, Adrian: "do all, and merge") |

**Report only (the read):** Sun EM 2024 P1 p4 Q15 0/3 — the photo cuts off her working and no other
photo has Q15; the note says it "could not be marked" and scores 0/3 (71/90 released; worth asking
her to resend the page). Eva TKGS Prelim 2025 P1 p8 Q8(b) 0/1 "the median value of marbles" (possibly
harsh). Alessi EM 2025 P1 p10 Q16(b): the B1 tick sits on her wrong same-segment line (which line
the B1 belongs to may be the read's attribution). Shayenne St Gabriel 2025 P1 p15 Q22(b) 1/2: which
mark was withheld is never said.

**Not worked (residue, the reader's counts):** the correction-pen sentence dropped from Denise p15
Q11(c)(i) (1 page; bench candidate `1467f2da` photo 13), ✗ on a crossed-out line (Sun p4; 2nd page in
two days), glyphs on print / on her answer (~8), ✗/✓ on the wrong line (~9), notes seated at the
wrong part (4), arrows at nothing (4), leaders through her ink (~7), "underline" drawn at mid-height
(2), carets (F33), clipping at the page foot (4), a rule head said twice (Shayenne p19, after
`9bab0e2`), the same point three times at one error (~9, wording), a vague next step (Sun p6 Q23(a),
comprehension FAIL), "circular" (Shayenne p9, comprehension FAIL).

# 1 Oct 2026 — the fixer's run on the findings of 1 Oct (8 papers, 40 pages, ~70 findings)

The second guard: F42 (`e3110fd`), F43 (`9652e33`), F44 (`a375ad7`) are on main. F43/F44 not seen
again. F42 held on the channels it covered (column reasons and strip notes typeset ∠ θ π √ on pages
drawn after it); the reader's residue is on the channels it did not reach — fixed below as F46, not
a regression. Nothing to revert. Fix-forward; nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F46 | symbols spelt as words in the SHORT channels (4 pages, all drawn after F42): Eva EM 2022 P1 p8 Q15 fix label "should be vert. opp. angle s"; Isabelle AM 2021 P1 p6 Q11(a) notation note "should be angle CAB = angle CBA = theta" beside a ✓M1; Alexis AM 2021 P1 p11 reason "since k != h"; Alexis EM 2024 P2 p17 verdict "95.625 g => 96 g" | pen (text) | a label with no `$…$` span was drawn through `penInk`, which transliterates ∠ θ π; `penSafe` rewrote ≠ → "!=", → → "=>" (and ≤ ≥ ≈ ∴) although the pen's font stack draws them; the `text-renders` check read `=&gt;` and could not see "=>" | bot `a5bc4ea`: a label whose words need the typesetter takes the typeset branch; `penSafe` keeps the drawable relations; font-metrics measures them; the check reads unescaped text. Cases `eva-em22p1-p8-fix-label-angle-s`, `isabelle-am21p1-p6-notation-label-theta`, `alexis-am21p1-p11-reason-not-equal`, `alexis-em24p2-p17-verdict-arrow` | fixed |
| F47 | rendering in reasons and notes: Rainie AM 2023 P2 p6 "λ = 7.938×10⊠ ^4from (c)(i)" (self-check caught it); Alexis AM 2021 P2 p4 "factor out (2x+1)^(-3/2)" raw caret; Alexis EM 2021 P1 p7 "60--69" and "fewer aged 0 − 19"; Alexis AM 2021 P1 p4 "X + 3 = 0 gives x = −3" | pen (text) | superscripts lifted one character at a time (MathJax refused ⁻); the on-page reason row skipped `autoTexProse`; TeX's `--` inside `\text` drawn raw; `autoTexProse` read an en-dash range as a minus; `asSentence` capitalised a variable | bot `6730d8b`: one `{}^{…}` per superscript run; reasons run `autoTexProse`; `--`/`---` → –/—; a range with no operator beside it stays words; a leading variable keeps its case. Cases `rainie-am23p2-p6-reason-superscript`, `alexis-am21p2-p4-reason-caret`, `alexis-em21p1-p7-dash-range`; `test/pen-render-residue.test.js` | fixed |
| F48 | Shayenne St Gabriel 2025 EM P2 p13 Q7(b)(i), two-column working: the ✗ of the left column's "l = 5.5 + y" drawn on the right column's "242 + 22y = 286 × 2" (which has its own ✓), the next line's ✓ on "22y = 330"; her real slip had no ✗ | placement | `_rightmostInkX`'s gap-stop only arms once the line's own ink is seen; on this shadowed photo the grid read her left-column writing as background, so the walk took the right column's first stroke as the line's end | bot `ec4f5e1`: ink met first more than a gap past the box is another column's; the box edge stands. Case `shayenne-em25p2-p13-glyph-crosses-column` with the new opt-in check `mark-beside-its-line`; `test/rightmost-ink-column.test.js` | fixed |
| F49 | Isabelle AM 2021 P1 p6 Q11(a): a notation note beside a ✓ opens "should be" — the day's one comprehension FAIL ("is my line wrong or not?") | marker rule (wording) | the 10 Sep ring rule asks every notation note to open "should be", which is how a correction reads | bot `9124774` on `proposal/2026-10-01-notation-note-not-a-correction`: "write it as …" beside a ✓; "should be" stays beside a ✗. Case `isabelle-am21p1-p6-notation-write-it-as` | proposal — Adrian's call |
| F50 | Beryl EM P2 p20 Q14(ii) (the same 24-page paper as F42/F45, annotated by Adrian on the iPad 1 Oct 2026): the note "π dropped from 7π/12" has its arrow on the line BELOW the slip — the circled 7/12 is one line up; Adrian: "arrow should be pointing at 7/12?" | placement | the leader lands from the part's region words / the ✗ line's row, not the line the note is about — when the slip is one line above the ✗ (the π was dropped in the line before the one marked wrong) the arrow points at the wrong row | OPEN — the note should carry the line it is about (`from_line_index` of the slip, not of the ✗) and the leader should land there; bench case from this page; verify on the golden bench, never by re-marking her paper (pen fixes are forward-only) | open |
| F51 | Beryl EM P2 p12 Q10(i): the cylinder line "SA = π(6)²(15) − π(6)² − π(4)²" has TWO slips — π(6)²(15) is a volume (named) and the flat ring should be π(6)² − π(4)² ADDED, not both subtracted (not named); Adrian: "not just curved surface area is wrong, the area of the ring is wrong too → should add" | marker rule (wording) | the verdict names the first slip on a line and stops; F45's "two should-be's on one part" rule covers an inherited value, not a second independent slip on the same line | OPEN — a line with two independent slips names both in one sentence ("… is a volume; and the ring is added, not subtracted"); bench case from this page | open |
| F52 | XMS Chemistry 2025 P2 p18 Q10(d)(ii) (Adrian, 2 Oct 2026: "and we have rendering issues"): the fix label "use C₃H₇NO₂S –" and the column reason "← C₃H₇NO₂S, CO₂H and NH₂ on one C" drew every Unicode subscript as a tofu box with its code point | pen (text) | the hand's font has no subscript digits; `needsTypeset` and `penSafe` knew Greek, relations and superscripts (F42/F46/F47) but not ₀–₉ | bot `221db9fe`: `SUBSCRIPT` map in `ai/pen-math.js` — a run of subscripts is ONE `{}_{…}` for the typesetter; `penSafe` writes a stray one as its plain character. Case `xms-chem25p2-p18-formula-subscripts`, FAIL on main, PASS on the fix | fixed |
| F53 | same page: the fix is said twice — the label "use C₃H₇NO₂S –" ends on a dangling dash, and the next line repeats "use C₃H₇NO₂S: HS–CH₂–CH(NH₂)–CO₂H" | marker rule (wording) / pen | `fix_short` and the line's `correction` both open with the same words and the pen draws both | FIXED 2 Oct 2026 (bot 9192298f). The label was a CONCEPT label, not a fix: its head is the rule lifted from the correction ("use C₃H₇NO₂S"), and the existing rule-head trim (`lib/pen-labels dropRuleHead`) could not read a head that holds a formula — typed subscripts in the plain copy, maths between two `\text` runs in the typeset copy. It reads both now; the page draws "use C₃H₇NO₂S – HS–CH₂–CH(NH₂)–CO₂H" once. Unit test in `test/pen-render-residue.test.js`; redrawn on bench case `xms-chem25p2-p18-formula-subscripts` | fixed |
| F54 | XMS Chemistry 2025 P2 p16 Q9(c) 2/3 (Adrian, 2 Oct 2026: "arrow not pointing at error itself? but pointing at marks"): the note "Link the weak acid to 0.250 vs 1.10 and agree" has its arrow on the printed "[3]", and the ✗ sits beside "[Total: 10]" | placement | the lost mark is an OMISSION — no line is wrong, so there is no ink to point at; the leader falls back to the part's bottom-right corner, which is where the paper prints its marks. Cousin of F50 (arrow on the ✗ row, not the slip's line) | OPEN — an omission note takes no arrow (or points at the END of the student's last written line), and the ✗ for a missing point seats after the last line of the answer, never on printed marks; bench case from this page. **FIXED 2 Oct 2026 (bot c1447364)** after a first attempt was reverted (the carets landed on the label's own leader, then on the printed "[Total: 10]"). The pen already drew a double caret for an `incomplete` line, but always UNDER the line's end — on this page that seat is the paper's print, and the ink walk had run on into "[3]". The seat is now checked against the page raster: when it is taken, or the walk overshot the line's own end, the carets stand ON the line straight after the last word (`_answerLineInkEnd`), a little smaller, drawn with the label that says what is missing; that label takes no arrow (from under the line it would cross the printed marks). Bench case `xms-chem25p2-p16-caret-on-line`, new check `line-caret-with-label`; only this page changed across the bench. Still open from this row: the ✗ itself stays beside the bracket near the printed marks | fixed |
| F55 | Isabelle O-Level 2020 EM P1 (run `d9660967`) p11 Q21 — MISLEADS: (a)(i) scored 2/2 (102°, right) carried a ✗, a red underline and "should be 96° misread question", all (a)(ii)'s; the strip's worked solution was captioned "Q21(a)(i):" | placement | (a)(ii)'s wrong line "Angle BCD = 18°" went unmatched by the row scan, and `answerLineGuard` (a wrong last line never goes bare) re-pointed the ✓ of "the line above" into its ✗ — but the read's lines carry no part, and that line was (a)(i)'s last, in a part at full marks. The self-check passed it: `glyphs-follow-verdicts` judged the ✗ by its (wrong) line and only checked full-marks parts on single-part questions | bot `5f1c837`: the guard never re-points a tick whose box lies only inside full-marks part regions (the lost part keeps its part-level ✗ in its own region); `glyphs-follow-verdicts` now fails a ✗ whose centre lies only in full-marks parts' regions. Case `isabelle-em20p1-p11-cross-in-full-marks-part` | fixed |
| F56 | Isabelle O-Level 2020 EM P1 p5 Q8(b) 0/2 and p14 Q24(b)(ii) 0/3, both written wholly in purple: a red ✗ drawn anyway — on the printed "Answer", and on a purple line (SPEC §4: nothing is drawn for second-pen work) | placement | the ✗ was `fillMissingPartGlyphs`' part-level fallback ("no line of theirs was placed"): a second-pen line is never placed, so a purple part always looked like a lost one | bot `ec880aa`: on a question with second-pen lines, a 0-mark part's fallback ✗ needs an unplaced wrong line of its own (by the read's `part` label when it gives one, else of the question); `glyphs-follow-verdicts` fails a part ✗ with nothing to stand for. Cases `isabelle-em20p1-p5-no-cross-on-purple-part`, `isabelle-em20p1-p14-no-cross-on-purple-part`. Report-only beside it: the second look read both parts' answer lines as blue/black and correct (Q8(b) "60", Q24(b)(ii) m = 3/4, k = 3) and disagreed with the 0 | fixed |
| F57 | Sophie ACS Prelim 2025 EM P1 (run `d1d11b46`) p6 Q7: ∛ drawn as a tofu box in the strip note "⊠(8x) = 2⊠x" and the column reasons "⊠8 = 2", "divide by 2⊠x" (the runtime self-check caught it, `pen-font-safe`) | pen (text) | `handRuns` lifted √ into `\sqrt{…}` but had no route for ∛/∜, and `TEX_FOR` had no entry, so the character stayed in the hand's text run | bot `b121e38`: ∛x / ∛(8x) typeset as `\sqrt[3]{…}` (∜ as `[4]`), a bare ∛ as a radical with its index. Case `sophie-acs25p1-p6-cube-root` | fixed |
| F58 | Sophie ACS Prelim 2025 EM P1 p8 Q10(c) B1ft: the shaded region (a construction) carried the follow-through note "your method is right, using your wrong number" — a comprehension FAIL, there is no number | marker rule (wording) | `lib/follow-through.js` has one sentence for every follow-through tick | bot `4c6a9e2` on `proposal/2026-10-02-follow-through-words`: a follow-through tick on a sketch/construction/region line, or a line with no digit, says "right, following on from your earlier answer" | proposal — Adrian's call |
| F59 | Chloe EM TYS 2025 P1 (run `dcd68b7f`) p2 Q2(b)(i): the verdict note read "33/11 sets makes 26 scones, not 24" — the read wrote "3 3/11 sets"; 33/11 is 3, so the note misleads (comprehension FAIL) | pen (text) | `autoTexProse` read "3 3/11" as plain-typed maths and wrapped it in `$…$`; TeX drops the space inside maths | bot `94c0b0e`: a whole number, one space, then a proper fraction is a mixed number — in words it stays in the hand with its gap widened (the "1 part" rule; a stacked fraction made the bubble taller and pushed it beside part (ii)), inside maths it is set as `3\tfrac{3}{11}`. Case `chloe-em25p1-p2-mixed-number` + unit pins | fixed |
| F60 | Eva O-Level 2020 EM P2 (run `bbc79554`) p21 Q10(b): the strip note printed raw TeX — "Add all weekly costs (\pounds 374), then 52 × 374 + 12 × 56.90 = \pounds 20130.80 a year" (cousin of the pinned `\euro`) | pen (text) | MathJax has no `\pounds` (a text-package macro); with `noundefined` dropped the span errors and falls back to prose with its source | bot `ee3e2bf`: `\pounds` → `\text{£}` in figure-tex's PEN_MACROS beside `\euro`. Case `eva-em20p2-p21-pounds` (FAIL on main, PASS on the fix) | fixed |
| F61 | Strip notes wrapped one token a line — Chloe AM TYS 2024 P2 (run `ce95490d`) p17 Q11(a) "give the reason: e^(−2x) / > 0 for all x / and sin x / > 0 for 0 / < x / < π, / so y > 0."; Lakshanya H2 TYS 2022 P2 (`d21a4aed`) p19 Q11(c) and p16 Q10(d); Eva `503cc8cb` p6 Q3(d)(i) — the open "maths broken mid-expression" residue | pen (wrap) | `stackWideMath` split every too-wide span at its relations as if it were an equation chain; a correction written as ONE `$\text{…} … \text{…}$` sentence holds relations too | bot `0cfe846`: a span with words after its first relation and more maths after them is a sentence (`isSentenceSpan`) and is word-wrapped; a short maths piece between two `\text{}` blocks stays one token, so "0 < x < π" never breaks; chains still stack. Cases `chloe-am24p2-p17-strip-one-token-a-line` (new check `note-lines-filled`, FAIL on main, PASS on the fix), `lakshanya-h2-22p2-p19-strip-one-token-a-line`; both draw on the stored 1280 px copy (`"space": "stored"` — the bench's 1600 px copy fit the note on one line) | fixed |
| F62 | "From your line:" heading a fresh solution — Eva O-Level 2020 EM P2 Q3(d)(iii) on both copies (`bbc79554` p7, `503cc8cb` p7: "From your line: A = −11.8 (estimate)" then curve = line from scratch to A = −12) and Isabelle `c617eeca` p7 Q4(b) (sine rule in a triangle she never used) — comprehension FAIL | marker rule (wording) | the continuation rule REQUIRES a column on every attempted part that lost marks, so a method that cannot be repaired gets a fresh solution under her name | bot `6fdd427` on `proposal/2026-10-03-fresh-method-not-from-your-line`: a continuation never changes method part-way; when her method cannot reach the answer from any line she wrote, continuation is null and the full solution answers the part | proposal — Adrian's call |
| F63 | A ✓ on the printed "Answer" / "n =" / "k =" again (F25/F31), four pages of Isabelle's 2026 EM Prelim Practice Set 5 P1 (run `7feb3d7c`): p9 Q14(a) "n = 9" ticked through the printed "n ="; p7 Q12(c) the ✓ of "588 = 2²×3×7²" at the end of the purple sentence beside it and the ✓ of "630 = …" on "k ="; p7 Q12(d) three ✓ stacked at the answer; p2 Q4(a) the ✓ on the word "Answer" | placement | two causes. (1) `_rightmostInkX`: past the line's own box the walk only stopped at a blank of 5 % of the page (45 px), so a 41 px blank between her working and the printed answer rule on the same row was walked through. (2) `_answerLineInkEnd`: "Answer (m²+5)(m+6) …… [2]" is one unbroken run to the end of the scan and wider than three lines, so it was dropped as "the table past the paper's edge" and the ✓ fell back to the writing-layer walk, which stops after the printed word | bot `2dd4dba`: past its own box a line ends at a blank as wide as the line is tall (never wider than the 5 % stop); a run is background only when its tail is SOLID top to bottom. Cases `isabelle-set5p1-p9-tick-on-n-equals`, `isabelle-set5p1-p7-tick-runs-past-its-line` (both FAIL on main, PASS on the fix), `isabelle-set5p1-p2-tick-on-answer-word` (the bench draws it right either way; pinned by `test/marking-fix-1004.test.js`) |
| F64 | Isabelle Set 5 P1 p9 Q15: the inserted reason "(base ∠s of isos △)" written on top of her next line "∠PAD = ∠PBC = 90 + θ" — neither can be read (the reader's worst overlap of the day; the runtime self-check missed it) | placement | the caret insertion writes the addition under the caret without looking at the page there | bot `bec9d12`: the addition is measured first; where the page raster holds writing in its box nothing is written there and the fix becomes the ordinary label on clear paper ("(base ∠s of isos △), incomplete answer"), no ring. New bench check `pen-clear-of-page-ink` (pixels of an object's ink landing on the page's own writing — 11 % on main, 0 % on the fix) |
| F65 | Rainie O-Level A Math 2025 P1 (run `4d1de7ae`) p7 Q7(b): "should be —" with nothing after it (comprehension FAIL), and a missing minus typeset the size of a hyphen under a caret | pen (symbols) | the fix arrived as "$-$"; the lone-symbol rule (draw a missing sign in at the gap, write a wrong sign's replacement at the ring) tests the bare character, saw the dollars and never fired | bot `bec9d12` (same commit as F64 — both are "what the pen writes in at the slip"): `bareSymbolFix` unwraps a one-sign fix; the missing "−" is drawn in level with the line; a replacement sign goes under the ring where the paper is blank, above it when the next line is in the way, and with neither clear becomes a label that names it ("should be a minus sign"). Case `rainie-am25p1-p7-lone-minus-fix` (FAIL on main, PASS on the fix) |

**Report only (the read):** Isabelle AM GCE 2021 P1 `1cceb10e` — the paper library attached the
Specimen Paper 1 (For 2021) as `gce 2021 am p1`'s questions file, and page 1's footer printed the
marker's own grounding note to her ("the held Q2 scheme belongs to the specimen paper") — re-file
the library row. Alexis AM 2021 P2 p10 Q6(c) 2/3 (A0 withheld on a correct follow-through, possibly
harsh); Eva EM 2022 P1 p8 Q14(a) 2/2 (possibly generous); Rainie AM 2023 P2 p3 Q2(a) 4/4 (possibly
generous). **Bench candidates not worked:** Shayenne p13's ✓ on "= 121 + 121 + 22y" slid ~150 px by
`_slidePastInk` on grey paper (the same page's `marks-clear-of-ink` reads the paper as ink); Isabelle
p6 score chip "Q12(a) 4/4" over a solution block (no-overlap, fails on main); arrows to the wrong
line (5 pages); glyphs on print / crossed-out work (~9); maths broken mid-expression in strip notes
(3); the same point three or four times at one error (~10 pages — a wording question for Adrian).
Proof on the worker: pen bench 643/643 checks over 79 cases on the final tree (each new case FAIL on
main, PASS on the fix); touched-module unit tests 396/396; the three commits' tree is byte-identical
to the benched one. Full `npm test` left to CI.

**2 Oct 2026 — report only (the read):** Isabelle O-Level 2020 P1 `d9660967` Q3 1/2 (24° right; a
mark docked for no "(alt ∠s)" though the question asks only "Find angle OAB"); Q17(b) 827 for
827.0075 → A0 (possibly harsh); Q8(b) and Q24(b)(ii) marked 0 as all-purple while the second look
read their answer lines as blue/black and correct. Sophie ACS P1 `d1d11b46` Q3(a) B0 on an answer that
names quarterly compounding (possibly harsh). **Bench candidates not worked:** Alessi `67c27c1c` p20
Q9(c) ✗ + strike on the correct cost line one row below "= 9 hours" (the line pass's Gemini boxes slid
a row; no stored boxes, so no bench redraw); "should be" labels level with the correct line above the ✗
(Isabelle p9 Q19(b), Alessi p4 Q2(c)); glyphs on printed text (7+ pages); notes clipped at the right
edge of a stripless page (Sophie p18, Alessi p10); ✓ beside a ringed value (Sophie p9, p17; Alessi p1);
the same point three times at one error (~9 pages, wording); Alessi p10 Q5(c) blank part with a hint
and no worked solution; Sophie p6/p7/p8 self-check failures other than ∛.

**3 Oct 2026 — report only (the read):** Eva (portal) handed "olevel 2020 paper 2" in twice 4½
minutes apart (`bbc79554`, `503cc8cb`); both were marked on the Mac lane and both auto-released, 79/100
and 81/100, eight parts apart on the same script (Q2(d), Q2(e), Q2(f), Q3(d)(iii), Q4(b), Q5(b)(ii),
Q10(a)(i), Q10(b)) — she holds two marked PDFs that disagree, and the one-paper-a-day cap did not stop
the second hand-in while the first was queued. Q2(e) "$2312" is 1/1 on one copy, 0/1 on the other and
on Isabelle `c617eeca`. Chloe EM 2025 P1 `dcd68b7f` Q2(b)(ii) B0 on a correct follow-through, Q25(a)(i)
77.1 → B0 (possibly harsh); Eva Q8(c)(ii) B0 on a correct follow-through (both copies); error kinds not
true of the line ("misread question" ×3, "transfer", "sign error"); Chloe AM 2024 P1 `08175bfa` Q11(c)
L11 `correct` carrying A0 (a tick where the mark was lost). **Bench candidates not worked:** ✗ on the
crossed-out line with the live wrong line bare (`dcd68b7f` photo 12); wrong answer lines left bare on
Isabelle's grey pages (`c617eeca` photos 3, 9) and a ✓ through the printed "Answer" (F25 again);
the "+c" caret under the wrong end and struck by the underline (`08175bfa` photo 2, F54 new shape) and
the notation-slip label's raw "^½" (F47 residue, `text_plain` used though `text_latex` exists);
the underline through its own "should be" label (`ce95490d` photo 4); edge clipping on stripless pages
(`89accaac` photos 8, 14); glyphs on handwriting (`89accaac` photo 18); a note captioned with the wrong
part (`503cc8cb` photo 5); leaders through another part's answer or four lines of working (`503cc8cb`
photo 17, `d21a4aed` photo 16); the same point three or four times at one error (~11 pages, wording).
Proof on the worker: pen bench 658/658 checks over the 85 earlier cases on the final tree, the four new
cases pass (pounds and Chloe's wrap FAIL on main); touched-module unit tests 971/971 (90 files).

**4 Oct 2026 — report only (the read / assembly):** Rainie `4d1de7ae` holds 2025 P1 and P2 in one
hand-in; reconciliation treated the same question number in the two papers as one question read twice
and kept the best — 134/155 on a 180-mark hand-in, about 25 marks of real questions missing from her
total (P2 Q11(a) carries a ✓B1 and no chip). Adrian told by the reader; his call on a recount. Rainie P1
Q7(a) 3/4 as follow-through with every coefficient wrong (possibly generous); P2 Q7 5/7 with the ln term
lost; P1 Q7(b) a ✗ on "a(290a − 23) = 0", which follows from her own line. Isabelle `7feb3d7c` Q12(c)
B1 withheld as purple though "k = 2 × 7 = 14" looks blue; Q15 "AD = BC (opp. sides of a triangle)"
ticked; Q2 kind "misread question" not true of the line. **Bench candidates not worked:** a leader drawn
through her writing like a strike-out (6 pages — `4d1de7ae` photos 1, 14; `7feb3d7c` photos 2, 5, 6, 15);
a ring on the wrong "2" with "should be 4" (`4d1de7ae` photo 13, the token box is the read's); ✗ and
underline on the correct line with "= 45" bare (`7feb3d7c` photo 12); ticks and a ✗ on purple lines of a
part that is part blue, part purple, and the "purple not counted" sentence dropped (`7feb3d7c` photos 5,
6 — F56 new shape); "careless" cut off at the page foot (`4d1de7ae` photo 9); "½" in the hand font reads
as "%" (`4d1de7ae` photo 21); a ring AND a ✓ on one value (3 pages); labels breaking mid-expression
("base ∠ / s of isos"); the same point three or four times at one error (11 pages, wording — still
Adrian's question); F62's fresh-method column again (`7feb3d7c` photo 7, the pending proposal).
Proof on the worker: pen bench 678/678 checks over 93 cases on the final tree (the four new cases included; three of them FAIL on main); touched-module unit tests 594/594 (74 files); the two commits' tree is byte-identical to the benched one. Full `npm test` left to CI.


# 6 Oct 2026 — the fixer's run on the findings of 6 Oct (9 papers, 39 pages, ~75 findings)

Chloe AM TYS 2021 P1/P2 and 2023 P1/P2 (`0a042a51`, `d0e6e804`, `8f13c052`, `1ac9283f`), Alexis EM GCE 2021 P2
(`94e37005`), Isabelle Prelim Set 5 P1 (`4770c66d`), Rainie TKGS 2025 AM P2 (`c6d20db0`), Denise TYS 2021 EM P2
(`c3731813`), Eva O-Level 2020 EM P1 (`241e8b56`). Second guard: F63 (`2dd4dba`) was SEEN AGAIN on pages drawn after
it — a different cause (F66 below), fixed again, nothing reverted.

| # | What the page showed | Layer | Cause | Fix |
|---|---|---|---|---|
| F66 | A ✓ on the printed "Answer" again (F63/F25), on a page drawn AFTER F63's fix — Eva O-Level 2020 EM P1 p2 Q1: the ✓ of "≈ −1.46" drawn on the printed word; and p4 Q7(b): the ✓ of "75 − 6 = 69" hanging under its line, level with nothing (the reader's "ticks at nothing") | pen (placement) | her two lines stand 17–20 px apart, so the second ✓ "touched" the first and was nudged DOWN a step, off its own line; on p2 that landed level with the print underneath and the slide-past-ink guard then carried it along the word | bot `bfe2843`: a bare ✓/✗ (no scheme code) whose step down would leave its own line stays where it is when the two glyphs only brush (one under the other, each at the end of its line), else steps RIGHT of the glyph it touches, level with its line, when that square is clear. A mark with a code ("✗ A0") keeps the nudge it had. Cases `eva-ol20p1-p2-tick-nudged-onto-answer`, `eva-ol20p1-p4-tick-on-minutes-in-shadow` (both FAIL on main, PASS on the fix); new `tolY` on `mark-beside-its-line` |
| F67 | Eva p4 Q7(b): the B1 ✓ drawn through the printed word "minutes" — the foot of the photo is in shadow | pen (placement) | the three "is there writing in this square?" guards call a pixel ink when it is darker than 150; in the shadow the PAPER is darker than that, every square "held ink", no clear square was ever found and the guard stood down (the 1 Oct note on Shayenne p13, "reads the paper as ink", is the same thing) | bot `c7d08db`: `lib/shadow-flat.js` — ink is judged against the paper around it (block-wise 80th-percentile brightness, borrowed from the brightest neighbour); bright paper (≥ 185) is returned to the pixel, shadowed paper counts a pixel as ink only under 0.78 of it. The guards read that raster (`occ.lit`); the scans that tell paper from the table keep the bare one. The bench's page raster is flattened the same way, so it stops calling shadowed paper "writing". Case `eva-ol20p1-p4-tick-on-minutes-in-shadow`; `eva-ol20p1-p8-u-is-in-b` pins the same paper's p8 |
| F68 | Chloe AM TYS 2023 P2 p15 Q8(b): the note box "θ = 45° is right, but the maximum area 3/2 r² was never stated." drawn across the side strip's dashed rule, its own arrow inside the box through its words | pen (placement) | the placement grid's last column is a part-cell wide, so a spot that fits the grid could be drawn up to a cell past the paper's edge (box at x 730, 140 px wide, page 863 px); and a note seated ON the place it is about still drew its arrow | bot `8bcaa14`: a spot whose drawn box would pass the paper's right edge is refused (the note went to the side strip here, under "Q8(b):"); an arrow whose head is inside its own note is not drawn. New check `notes-on-their-side-of-the-rule`. Case `chloe-am23p2-p15-note-across-the-rule` (FAIL on main, PASS on the fix) |
| F69 | Raw caret in a notation label again (F47) — Chloe AM TYS 2023 P2 p6 Q3(c)(ii): "missing minus: Tf = 86e^(-0.00079380t)" as typed, broken after the caret | pen (symbols) | the note beside a ✓ (`notation_slip`) went to the label as plain text; only `$…$` took the typeset branch | bot `5a2a5a2`: a notation note that carries a typed power or subscript is run through `autoTexProse` first, so the label is typeset on one line. Case `chloe-am23p2-p6-caret-in-notation-label` (FAIL on main, PASS on the fix). **Not fixed on the same line:** the drawn-in "−" still sits on the label's first letter (the reader's P13) |
| F70 | Rendering, six small ones: "BF = ½BA, BA = ¾p − q" and "synthetic division by −½" (the hand's ½ reads as "%" — 4 Oct residue); "$ 2063" with a gap (Denise p4); "1 st hour … 5 th hour" (Rainie p8 Q3(d)); "cm/s" set as italic maths (Chloe 2021 P1 p19); "dy/dx = 1 − x − 6x² - 6x² + x − 1 = 0 was the rearranged equation" — a dash between two expressions written as the hand's hyphen and read as a minus (Chloe 2023 P1 p10, comprehension FAIL); "U is in B" for the element u (Eva p8) | pen (symbols) | ½ ¼ ¾ are Latin-1, so the hand wrote them itself; a joint space was seated after a currency "$"; `1\text{st hour}` typeset the digit apart from its word; "cm/s" matched the plain-maths token rule; the pen writes every dash as a hyphen; `asSentence` capitalised a lone letter | bot `c51e7ce` (`ai/pen-math.js`, `lib/pen-labels.js`): typed fraction characters are typeset (and join a plain-maths run); no space between "$" and its number; an ordinal's digit rides with its word; unit rates (cm/s, m/s², km/h) stay words; a lone dash between two typeset expressions is written "; "; a lone letter other than "a"/"i" opening a note keeps its case. Cases `alexis-em21p2-p17-half-reads-as-percent`, `rainie-tkgs25p2-p8-ordinals-split`, `chloe-am23p1-p10-dash-read-as-minus`, `eva-ol20p1-p8-u-is-in-b` (each FAIL on main, PASS on the fix); `test/marking-fix-1006.test.js` |
| F71 | Rainie TKGS 2025 AM P2 p11 Q7 footer: "4f(x) = 3sin4x + 2cos4x + 4" set as the italic letters s·i·n with no space, and "still has a −4 that should have cancelled" read as the subtraction a − 4 | pen (symbols) | the function-name pass looked for a word boundary, and none falls between a digit and a letter; a lone "a" after a word and before a signed number was taken as a variable and joined the number's maths run | bot `2c5bd35`: a function name is matched with no letter on either side (`FUNC_NAME` in `ai/pen-math.js`), and "a" after a word and before a signed number is the article. Case `rainie-tkgs25p2-p11-sin4x-as-functions` + `test/marking-fix-1006.test.js` |
| F72 | Chloe AM TYS 2023 P2 p6 Q3(c)(ii): the drawn-in "−" landed on the first letter of its own note "missing minus: …", and red brackets went round the exponent | pen (placement) | an inserted symbol is written after the span; there it met the ✓, stepped clear of it and onto the note; the bracket branch then ran as well | bot `77a6d23`: a missing sign is written at the span's left edge (where the ✗'s lone missing symbol goes) and a span with a sign drawn in gets no brackets. Case `chloe-am23p2-p6-minus-drawn-in-front`, new check `drawn-in-symbol-clear-of-notes` |
| F73 | Maths inside a note box set far smaller than its words — Isabelle Prelim Set 5 P1 p4 Q3(b) "The 2 marks are for" over "tan(180° − (A+B)) = −tan(A+B)" at the floor size; also Chloe `1ac9283f` p9, Rainie `c6d20db0` p8 (6 pages that morning) | pen (rendering) | the wrap shrinks the one line whose unbreakable expression overflows the box | bot `32c729c`: a note box stacks the expression at its "=" at the asked size (`wrapPenLineUnshrunk`); a shape too narrow even for that is passed over where the side strip can take the note. Case `isabelle-set5p1-p4-note-maths-full-size` + `test/marking-fix-1006.test.js` |
| F74 | Chloe AM TYS 2023 P2 p9 Q5(a): two ✓ drawn over "+34 sin 3x" — both lines run to the edge of the paper | pen (placement) | the guard that slides a mark past ink has nowhere to go when the line ends at the paper's edge, so the original spot stood, on her writing | bot `605b471`: the mark takes the first clear square just above the end of its line, else just under it, inside its own part and clear of the other marks; no clear square → as before. Case `chloe-am23p2-p9-ticks-on-line-to-the-edge`. Not reached: Rainie `c6d20db0` p8 Q3(c) ✗ A0 on "0.21428" (no clear square within reach — stays on the remaining list) |
| F75 | Eva O-Level 2020 EM P1 p10 Q21 strip note: "int ∠ s, AE//CD" — a gap between the angle sign and its plural | pen (symbols) | the marker typed the sign as its own maths span ("int $\angle$s"); the wrap split sign and "s" into two tokens and joined them with a space, and the joint rule kept it | bot `d43b925`: a lone `$\angle$` / `$\triangle$` is the same lifted sign as a typed ∠, and its "s" rides on it through the wrap (`penRunsOf`, `wrapPenLine`). Case `eva-ol20p1-p10-int-angles-one-word`, new check `sign-plural-one-word` |
| F76 | Alexis EM GCE 2021 P2 p16 Q8(a)(i)(a): the ✗ beside the printed "[1]", her answer 180 px to the left, the strip note's arrow on the bracket (F63's class, F54's arrow) | pen (placement) | the answer row has no dotted rule and no line box, so the part's own ✗ walked the whole row on the writing layer and stopped after its last ink — the bracket | bot `c89fb82`: for a part's own mark the raster walk that knows a printed bracket (`_answerLineInkEnd`) has the last word when it ends clearly short of the layer walk; the note's arrow takes the same seat. Case `alexis-em21p2-p16-cross-past-the-bracket`, new bench-only check `mark-before-printed-bracket`. Not reached: p10 Q5(b) ✗ A0 right of "[3]" (remaining list) |

**Proposed (Adrian's call):** `carried-value-words` — the note beside a follow-through ✓ ("incorrect from previous
line", his words of 30 Sep) read as a tick that says incorrect on seven lines of five papers, and "previous line" was
untrue on two → "right method, wrong value from earlier" (branch `proposal/2026-10-06-carried-value-words`).

**Report only (the read):** Chloe `d0e6e804` Q7(a) 0/4 — correct pencil working (not over anything) treated as a
correction pen, 4 marks, possibly harsh; Isabelle `4770c66d` Q3(a) 1/3 — the blue "cos(A+B) = 3/4 − 1/12 = 2/3" line
not credited as exam working; Eva `241e8b56` Q17(b) 2/2 with 827 on the answer line and a "do not round" box beside
it (Isabelle got A0 for the same 827 on 2 Oct); Denise `c3731813` Q4(b) 3/6 ("17.3672 → 17.4" crossed though the
rounding is right for her line); Chloe `8f13c052` Q1 "c = 3/4" ✗ with no "should be"; Isabelle Q7(b) 0/2 for one
swap; error kinds ("copied wrongly" for a sign flipped while rearranging).

**Not worked — first in line next run** (`remaining` in the fixer's file): the ring cuts through the number, 6 pages
(the token box is the vision model's; ink profiles show no gap rule that tells the next digit from the next word —
needs a design, e.g. snap to ink runs by the token's character count); ✗ and ring on scribbled-out working with the
live line bare, Chloe `8f13c052` p10 (the vision boxes sat on the scribbled-out copies of the same text; a change to
the placement ask cannot be proven from stored boxes and costs API calls — Adrian's call); leaders through her ink or the printed question (5); glyphs on her writing outside
shadow (5); ✗ beside the printed "[1]" off her answer (2); a note or box seated at the wrong part (2); labels over
print (2); only the first of two slips ringed (F51 class, Denise p10); a zero part with a hint and no worked solution
(3). Words not proposed tonight: one point said
three to five times (14 pages, F23/F17); strip notes over 25 words; "should be" on a value right for her line; ring
and ✓ on one value; a wrong final answer with ✗ and no word; a part at 0 or 1 with only ticks.
Proof on the worker: pen bench 697/697 checks over 103 cases on the final tree (the eight new cases included, each FAIL on main); touched-module unit tests 900 (the one red, a check name missing from the well-formed list, fixed and re-run green); the six commits' tree is byte-identical to the benched one. Full `npm test` left to CI.

# 6 Oct 2026 — Adrian's own screenshots (pen_reports 1–6, 8, 11, 15), worked by a session

Alexis AM TKGS P1/P2 (`c1c3f68c`, `91f86a39`), Alexis AM Set 1 P1 (`649bcbdd`), Rainie TKGS 2025 AM P2 (`c6d20db0`),
Eva O-Level 2020 EM P1 (`241e8b56`). Shipped to bot `main` 6 Oct on his "ship all" / "both".

| # | What the page showed | Layer | Cause | Fix |
|---|---|---|---|---|
| F77 | A strip note printed `\"the coordinates of B \"` with the backslashes (Alexis Set 1 Q4(b)) | pen (symbols) | the marker's text arrived escaped twice; the wrap made the closing quote its own word | bot `396e940`: quotes unescaped before the split; live check `no-raw-markup-as-text` |
| F78 | Marker's notes: each grey "←" reason on the row BELOW its step, steps indented unevenly (Q5(b)/(c), the tan θ page) — "still not on the same line" | pen (layout) | the footer column drew every reason as its own row; same-row layout existed only for the on-page box | bot `f3cd06d`: the reason sits on its step's row, drops below only when it cannot fit; live check `reason-on-its-step-row` |
| F79 | Arrow pointing at nothing — `repeat ×3` (C1, F10, F50, F54, F76): strip arrows ending in blank paper (Q10(a), Q2(a)(ii)), a box arrow left of "Answer" (Eva Q16(a)(ii)), arrows ending on a ✗ (Q12(e), Q4(b)), the brown arrow straight down (Alexis P1 Q2) | pen (placement) | each caller aimed its own way — the middle of a part's edge, the ✗, the printed "Answer" | bot `717e2e5`: **general check — replaces the patches**. One gate every arrow passes (`lib/leader-gate.js`): the head lands on a ring, a named feature or real writing of its own question, or the arrow is not drawn (the note stays). A note about something never written has no arrow (Adrian: "yes, no arrow for that"). Live check `leader-lands-on-its-line` |
| F80 | Arrow through the ✗ ("should be 17/24", Alexis P2 p15; the tan θ page) | pen (placement) | the pen's own ticks, crosses, codes and rings were never obstacles to an arrow | bot `1ea66bc`: same gate — a shaft crossing a mark is arced round or relaunched, else not drawn; live check `leaders-clear-of-marks` |

On 84 stored pages the gated pen drew 48 arrows as before, re-aimed 16, withheld 4. **Design changes shipped the same day
(his "both")**: a red circled number beside the line a correction starts from and the box headed "From line ①"
(`PEN_LINE_NUMBERS=0` turns it off; the number goes after the line's ✓ when the paper on its left is written on — his
"yes do it"), bot `a3b7ef5`; a part's note seated in clear paper LEFT of its line with a short arrow before the side
strip is tried, at the smaller on-page size (`PEN_NOTE_LEFT=0`), bot `9e109cf`. The page check before release
(SPEC-RED-PEN.md, `PAGE_GATE=watch`) went in with them.


# 7 Oct 2026 — marking-fix (Adrian's own reports first: pen_reports 7, 9, 10, 14, 16, 22; then the reader's third return of F66)

Two sessions (a worker restart at 08:32 cut the first). Bench pages: Alessi AM 2025 P1 (`5d88b1ed`), Rainie TKGS 2025 AM P2
(`c6d20db0`), Khoo EM 2025 P1 (`f23ad3cc`), Alexis AM TKGS P1 (`c1c3f68c`), Eva O-Level 2020 EM P1 (`241e8b56`),
Isabelle EM 2021 P2 (`d4792e5a`).

| # | What the page showed | Layer | Cause | Fix |
|---|---|---|---|---|
| F81 | The score chip read "M1 M1 M0 M0 A0" but only some ticks carried a code — "isn't really helpful? because the M1 M0 isn't all shown at the ticks" (pen_reports 7, his decision: keep the row, code every line) | pen (symbols) | a code was drawn only where the marker tagged the line and the seat was free | bot `af4531f`: every line that earns or loses a mark shows its code beside its ✓ or ✗; the chip keeps its row. Cases `rainie-tkgs25p2-p4-codes-on-lines-partial`, `alessi-am25p1-p1-half-cross-and-codes`; live check `codes-beside-their-lines` |
| F82 | A plain ✓ on a line that is right method on a wrong carried value (pen_reports 14, his decision: "option A – but make more parallel") | pen (symbols) | no glyph for "half right" | bot `af4531f`: the HALF-CROSS — a tick with one short stroke across its long arm, parallel to its short arm — on the first line that uses the wrong earlier value; marks unchanged. Cases `alessi-am25p1-p1-half-cross-and-codes`, `khoo-em25p1-p13-half-cross`; live check `carried-tick-is-half-cross` |
| F83 | Long brown notes written on a slant — "why are the brown annotations slanted?" (pen_reports 10, his decision: slight or straight for long lines) | pen (layout) | every margin note took up to ±2.5° whatever its length | bot `af4531f`: lean scaled to length — ±2.5° short, ±1° medium, ±0.4° long or stacked. Live check `long-note-nearly-straight` |
| F62 (rebuilt) | A column headed "From your line" that started a fresh method (pen_reports 22, "ship all" — the 3 Oct proposal had no branch) | pen rule | the rule was never on a branch | bot `5e4d155`: the column always carries on from something she wrote; when her method could not get there the page shows the full solution instead. `test/marking-fix-1007.test.js` |
| F84 | A red underline and a nearly level red arrow side by side under one line — "ugly"; a second arrow from "incorrect from previous line" across the next line (pen_reports 9) | pen (placement) | the underline and the label's leader were decided separately | bot `4a86651`: one red line at a slip, not two — no long level arrow beside an underlined line; a carried-value note with no ring has no arrow. Case `alexis-tkgs-p1-p4-underline-or-arrow`; live check `underline-or-arrow` |
| — | The ✗ and "should be 1586" 270 px from the ringed slip (pen_reports 16) | pen (placement) | fixed already by F74/F76 and the 6 Oct evening seats | no code change; pinned by case `eva-ol20p1-p12-cross-just-after-the-ring` (`cross-beside-its-ring`), bot `4a86651` |
| F85 | ✓ on the printed word "Answer" — `repeat ×3` (F25, F63, F66): her last working line "≈ 28.5 %" ends just before the printed "Answer" of the same row and its ✓ is drawn on the "r" (Isabelle EM 2021 P2 p2 Q2(b); Khoo EM 2025 P1 p5 Q9 — both drawn AFTER F66) | pen (placement) | three causes so far (answer-rule mask, a nudge onto print, a slide along print); this time the small italic print never fills a quarter of a column, so the ink guard called the square clear | bot `1a3ce41`: **general check — replaces the patches F25, F63, F66**. The pen tests each ✓/✗ it is about to draw: when the square just past the line's OWN end already held ink, a mark moved past it no longer stands beside its line → tucked against its own line when that is clear paper, else a bare ✓ on a row whose Answer line is marked is not drawn, else kept and COUNTED. Live check `mark-beside-its-own-line` (fails when a mark is kept past foreign ink; detail counts tucked / left out); `PEN_MARK_GATE=0` turns it off. Cases `isabelle-em21p2-p2-tick-on-answer-third-time`, `khoo-em25p1-p5-tick-on-answer-third-time` (bench check `no-mark-on-print`) |
| F86 | A short red arrow from "should be Stage 5" back along the red underline beneath her "Stage 4", running under the ✗ (science style, chem Cedar 2025 P2 bench page E-p5; pen_reports 24) — second member of F84 | pen (placement) | F84 only asked about arrows a quarter of the page long; a 75 px one beside the ✗ is the same second red line | bot `0026bec`: any nearly level arrow to its own underlined line is not drawn, long or short; `underline-or-arrow` asks at any length. The bench's `marks-clear-of-ink` had counted a ✗'s own underline as a mark on her writing (false alarm on E-p2 / E-p5) — corrected, and the check is back on both pages. Bench: `chem-cedar25p2-E-p5-science-style`, `chem-cedar25p2-E-p2-science-style` |
| F87 | Raw caret in a note — `repeat ×3` (F47, F69): the side note "x − 1.8 × 10¹⁰ on top, then 0.939x = 1.8 × 10¹⁰" drawn "10^1⁰" (Isabelle EM 2021 P2 p2 Q2(d), the reader 7 Oct) | pen (symbols) | two patches, one path each (a reason row, a notation label); the cause is shared — a run of typed superscripts read one character at a time (¹ is in the hand's font, ⁰ is not), and "10¹⁰" was not a maths word so the typeset span stopped before it | bot `5b72286`: **general check — replaces the patches F47, F69**. A run of two or more typed superscripts is ONE power on every path (prose-to-TeX, the text escape, the hand's own runs); a caret still in the hand's words with its exponent after it is raised, never drawn; and the page's own check `no-raw-markup-as-text` now counts a raw caret, so one that gets through shows in the 🖊 watch-outs. Bench: `isabelle-em21p2-p2-tick-on-answer-third-time` (fails on the old drawing, and on no other of the 139 pages) |
| F88 | The fix said twice at one ✗ — `repeat ×3` (F23, F53): "simple interest is I = PRT/100 –" and under it the whole sentence again (Khoo EM 2025 P1 p2 Q3 — the page's own check caught it and the page went out anyway); "1st quadrant gives θ = α –" then the sentence again (Rainie AM Set 1 P1 p5 Q5(c)) | pen (labels) | a concept label's head is the rule its correction opens with; each earlier fix taught the trim one more spelling of the head (prose, a `\text` run, a formula between runs) — a head holding a relation or a fraction got past all of them | bot `c76503d`: **general check — replaces the patches F23, F53**. The correction is cut at the first colon before which it SAYS what the head says, whatever it is written in (`lib/pen-labels saidWords`); and it fails closed — what is about to be drawn under the head is read back, and if it still opens with the head's words the head is not drawn, counted on the page's audit (`saidOnce`). `no-duplicate-text-per-part` compares the same way (it had skipped Rainie's: "θ = α" vs `$\theta = \alpha$`). A head that ends in maths is joined with a colon, not a dash ("θ = α – θ = 0" read as a subtraction). Bench: `khoo-em25p1-p2-fix-said-twice-third-time`, `rainie-set1p1-p5-fix-said-twice-third-time` |
| F89 | ✓ and ✗ on one Answer line (F85 family, the general check extended — not a new patch): the ✓ of her "= 55.50798°" drawn at the start of the answer rule beside the answer's own ✗ A0, and the M1 of the line above nudged down beside that row's "[3]" (Sophie EM 2025 P2 p10 Q5(b)) | pen (marks) | her line ends a word-gap before the printed "Answer" of the same row, so the line's ink was read as running on through the print; F85's check asks "is the seat past ink that is not the line's" and the seat was clear paper | bot `baf6a2b`: `mark-beside-its-own-line` now also covers a working line whose row carries the marked Answer to the right of its box when the ink run goes far past the box — the mark goes on the first clear square just past her box, else down F85's ladder (left out when bare, counted when kept). A coded mark nudged to the foot of its box is raised level with its own line when there is room for it and its code. NOT closed by this: Isabelle EM 2021 P2 p1 Q1(b)(ii) (✗ on the printed "k =") — there the page-reading step put the answer's box on the working line and the working line's box on the answer row; a reading miss, reported. Bench: `sophie-em25p2-p10-tick-at-start-of-answer-rule` |
| F90 | An answer's mark against the print of its own rule: ✓ hard against the printed "y =" of a two-blank rule with its B1 written over her 3 (Khoo EM 2025 P1 p5 Q10(a)); ✓ across the printed "[2]" when her answer fills the rule (Sophie EM 2025 P2 p5 Q2(d)(ii)) | pen (marks) | the slide past ink sees only what fills a quarter of a column, which small print never does; and nothing tested where the code would be written | bot `f407317`: the mark gate now covers ANSWER lines too — the glyph is tested with a finer look that sets the rule itself aside (`_squareHasPrint`) and with room on its left, the code at its own seat, and a mark that fails steps along the rule to the first square clear by all of it (past her last value, or past the bracket); none → it stays and is counted in the 🖊 watch-outs. Bench: `khoo-em25p1-p5-answer-tick-against-print`, `sophie-em25p2-p5-answer-tick-on-bracket` |

**Not a failed fix:** the reader saw F74 (ticks on a line that runs to the paper's edge) again on Alexis TKGS P2 p13, p5 and
TKGS P1 p7 — all three drawn 11:20–11:30 on 6 Oct, BEFORE F74's 12:14 push.

**Opened as proposals (his wording reports 12, 13, 18 and the layout report 17):** `false-rule-not-equals`,
`asked-for-not-the-number`, `blank-in-exam-write-something`, `no-hint-beside-the-solution` (with before/after pictures) —
bot `docs/PROPOSALS.md`.

**Needs his decision (pen_reports 19):** the ✓ B1 beside a crossed-out scribble at the foot of Xinmin Chem p7 is Q3(d)'s
third tick, boxed there by the page-reading step — a reading miss of WHERE the line is, not pen code.

**Left for the next run** (the reader's 7 Oct list, causes as the reader wrote them): a ✗ label drawn twice, the first copy
cut off (Khoo EM p2 Q3, Rainie Set 1 p5 Q5(c)); arrows through her writing (7 pages — the arrow gate checks marks, not her
ink); ✓ and ✗ on one Answer line (Sophie P2 p10, Isabelle p1); marks on print or inside her line (Khoo EM p5 "y =", Isabelle
p2 "% increase ✓ ="); joint spaces after a typeset letter ("y -intercept", "A 's", "n th"); raw caret "10ˆ1⁰" in a strip
note; strip note one token a line (Nicole P2 p8); clipped text (Sophie p8 reason, Nicole P1 p6 footer under the credit);
figure label over the axis label (Rainie p14); pen_reports 23 and 24 (science style — their bench cases are not on `main` yet).


# 8 Oct 2026 — marking-fix (the reader's findings of 8 Oct: 8 papers, 39 pages, ~80 findings; no new pen_reports)

Bench pages: Eva O-Level 2024 EM P1 (`17ce34cc`), Alexis EM Zhonghua P1 (`acb6e5c5`), Isabelle AM Prelim Set 5 P2
(`aef649b9`), Rainie AM Set 1 P2 (`b869223d` — the only paper drawn after every 7 Oct fix), Nicole H2 2025 P2 (`814aa318`).

| # | What the page showed | Layer | Cause | Fix |
|---|---|---|---|---|
| F91 | A Venn that read INVERTED: shade "both" + "neither", but on Eva's grey, shadowed photo the unshaded crescents showed the dark photo and looked shaded, the light-grey shaded regions looked blank — the opposite of its caption (Eva O-Level 2024 P1 p10 Q17(a)) | pen (figures) | every margin figure was drawn straight onto the photo, nothing behind its unshaded regions | bot `4b54d75`: a figure seated on the photo sits on its own white panel (every family, both seats). New live check `figure-on-paper`. Case `eva-ol24p1-p10-venn-on-paper` (FAIL before, PASS after) |
| F92 | A note's last line one short token alone — "…giving 120" over "g." (Alexis EM Zhonghua P1 p11 Q17(b), SPEC §2.6); maths broken beside a relation — "(and at t =" over "0, v = 1 − 1 = 0)" (Isabelle AM Prelim Set 5 P2 p15 Q8(c); F61's class) | pen (wrap) | the greedy wrap filled each line and broke wherever the next token did not fit | bot `c1bd59e`: no break beside a relation (or an operator inside maths, or a true minus) — the tail of the line goes down with it; a lone short last token takes the word before it along. `test/marking-fix-1008.test.js` (fails before, passes after); pins `alexis-emzh-p1-p11-unit-alone-on-last-line`, `isabelle-amset5p2-p15-maths-broken-at-equals` |
| F93 | "Q9(c)(ii) – from line ①" on the copy she received, and no ① anywhere on the page (Rainie AM Set 1 P2 p15 — drawn after every 7 Oct fix; Sophie EM 2025 P2 p5 the day before) | pen (line numbers) | the line's number was cached ON the shared annotation by the bare page's draw; the with-solutions draw found it there and skipped drawing the badge | bot `9355ee5`: the number is kept per draw. Case `rainie-amset1p2-p15-from-line-1-without-1` (FAIL before, PASS after). Sophie p5 and Nicole P1 p11 have no with-solutions copy — another cause, still open |
| F94 | A dash beside maths read as a minus — "p(1) = 19(1) − 28 = −9 - you never equated" read "−9 −" (Rainie AM Set 1 P2 p2); "incomplete answer – c = 1 or c = 3/5 – the line …" (Nicole H2 P2 p3); units as italic maths run onto the number — "1cm² : 0.16km²", "0.4km = 40000cm" (Alexis EM Zhonghua P1 p4) | pen (symbols) | F70 handled a dash BETWEEN two expressions only; autoTexProse pulled a dash next to maths INTO the span, and the wrap could part the dash from its maths; a unit with a power matched the maths-token rule | bot `a60d758`: after maths a lone dash is "; ", before maths (after a word) ": " — on the whole line before autoTex, at the wrap's tokens and in the runs; a two-letter unit (cm, km, kg…) with or without its power is a word, apart from its number ("2m", "12m²", "m²" stay maths). Cases `rainie-amset1p2-p2-dash-after-maths`, `nicole-h2-25p2-p3-dash-beside-maths`, `alexis-emzh-p1-p4-units-as-italic-maths` (each FAIL before, PASS after); F70's own case and test kept green |
| F95 | Q5(b)'s number line "(k−2)(k+2) < 0 gives −2 < k < 2" drawn up in Q5(a)'s space beside the printed question, far from (b) and its note (Rainie AM Set 1 P2 p7 — drawn after every 7 Oct fix) | pen (figures) | the marker's diagram names its question only, and the figure was seated from the top of the whole question — the full-marks (a) | bot `dbf427c`: a figure is a correction — it seats in the band of its question's parts that lost marks. Case `rainie-amset1p2-p7-figure-in-the-wrong-part` (FAIL before, PASS after; check `figure-in-its-part`) |
| F96 | A part's "From line" box drawn in the NEXT row of her answer table, reading as the next part's working: 3(b)(iii)'s box under 3(c)'s working (Nicole H2 2025 P2 p4); 11(c)(iii)'s beside 11(d)'s hint (Nicole H2 2025 P1 p16) | pen (placement) | answer-table rows abut ((b)(iii) ends at y 458 where (c) begins) and the next-part bound was a strict ">", so the next row never bounded the seat | bot `a8ad672`: abutting parts bound the continuation's seat and the lost part's solution band; no room in its own row ⇒ the footer, its number staying on her line. Cases `nicole-h2-25p2-p4-from-line-box-in-next-row`, `nicole-h2-25p1-p16-from-line-box-in-next-row` (check `solution-in-its-part`) |
| F97 | Q5(a)'s note seated in the margin beside the printed "(b)", in (b)'s space, its arrow crossing (b)'s question back up to (a) (Isabelle EM Prelim Set 5 P2 p8) | pen (placement) | the note's band allowed six lines (eight, wide) below its part whatever came next; the other-part guard tested overlap with a part's box, never the margin beside it | bot `b9ef806`: both bands stop at the next part's top; no room above it ⇒ the strip, level with its part. Case `isabelle-emset5p2-p8-note-beside-the-next-part` |
| F98 | "✓✓" at the end of "12m² + 7m − 12 = 0" — the second ✓ was the one for "eqn of circle: (x − 7)² + (y − 7)² = 25", which ends 33 px before that line starts on the same row (Rainie AM Set 1 P2 p15 — drawn after every 7 Oct fix) — second member of F48 | pen (placement) | too close for F48's gap-stop, the walk to the line's end ran on through the next line | bot `b30967f`: a stored line that starts past this line's box on its row, with a gap a mark can sit in, ends the walk at this line's box; the mark is tucked into the gap (a sentence boxed hard against a maths column keeps the old end — Isabelle EM 2020 P1 p14 stays green). Case `rainie-amset1p2-p15-tick-carried-past-the-next-line` (FAIL before, PASS after) |
| F99 | A mark's code written on her writing or on print — `repeat ×3` (F30, F90): "A1" over her "S=" (Isabelle AM Prelim Set 5 P2 p15), "A1" on her word "equidistance" (Eva O-Level 2024 P1 p8), "M0" over the printed "Answer" (Isabelle EM Set 5 P2 p8), "B1" on the printed "of" (chem Beatty P2 p19) | pen (marks) | F30 kept a code out of another part, F90 tested it on answer lines only; nothing tested the raised seat right of every other glyph | bot `250a1d2`: **general check — every code** is tested where it is about to be written; on ink or print it tries level with the glyph, above it, then left — the first clear seat in its part, off the other marks — else it stays and is counted with the mark gate (`PEN_CODE_GATE=0` off). New check `codes-clear-of-ink`. Cases `isabelle-amset5p2-p15-code-over-her-writing`, `eva-ol24p1-p8-code-on-her-word` (each FAIL before, PASS after). Not reached: Isabelle AM p12 Q6(c), where the ✓ itself sits inside her answer |
| — | Reader's pull gap: `parts[].model_answer` and `corrections` not copied, so "the read wrote none" could not be told from "the pen dropped it" (W7) | reader tooling | — | bot `059aa3e` |

**No longer reproduces on today's pen (stored placement redrawn 8 Oct, no fix):** chem Beatty 2026 P2 p13 "…form insoluble
silv." (the box now reads in full and (d)(ii) names the missing point); Eva O-Level 2024 P1 p17's ① box cut at the bottom;
Isabelle EM Prelim Set 5 P2 p15 (e)'s box in (f)'s row and chem p2 (b)'s box in (c)'s row (each now inside its own part).

**Not failed fixes:** F88 "head said twice" on Alexis p4 and F90's code over "390" on Eva p9 were drawn before those pushes.
F74 (marks at the paper's edge) seen again on Rainie AM Set 1 P2 p7/p15 after its fix — residue, carried in the marks-at-
nothing class below, not reverted (its cases hold).

**Opened as proposals (8 Oct):** `step-not-where-the-marks-are` (W1 — a note opens with the step, never "The marks are for";
the why-0 rule's own 30 Sep examples taught that opening), `corrections-in-plain-words` (W5 — "purple = your corrections:
checked, but no marks", never "exam-ink" / "marked, not counted"), and the layout `tick-before-the-line` (P4 / F74 `repeat` —
a mark with no clear paper at its line's end stands just before the line starts, level with it, instead of F74's seat above or
below the end; sent with pictures) — **Adrian dropped it the same morning: F74's seat stands; do not re-propose the left seat.** Later the same morning: `right-for-your-value` (W4, third day — an answer
right for her own earlier wrong value keeps its ✗ and lost mark, but no bare "should be"; the note says "right for your k = …").

**Reported, the read (no change):** Isabelle AM Prelim Set 5 P2 p12 Q6(c) 7/7 with "(x+2)³" in her final answer where her
working has (x+2)² — likely 1 mark, Adrian's call; Eva O-Level 2024 P1 p8 Q13(a) 2/2 with "equal chord equidistance" as the
reason for OB = OA; Rainie AM Set 1 P2 p15 (i)'s B1 B1 credited on (ii)'s CA/CB lines; Rainie p1 the two A1 on "log₃x = 4"
/ "log₃x = −1" with her answers bare; Nicole H2 P1 p6 ✓ beside struck-out lines (seen again on the redraw).

**Left for the next run:** the ① orphans with another cause (Sophie EM P2 p5 — no with-solutions copy; Nicole H2 P1 p11 — box
on the overflow sheet); marks on print / on her writing on pages drawn before F89/F90 (re-check on new pages); two ✗ for one
lost mark (the slip's ✗ and the answer's ✗ A0 — a design question); "not attempted" chip on a part with a line of ink; W2
said three times, W3 long strips, W6 a lost sketch shown in words, W7 science model answer.
