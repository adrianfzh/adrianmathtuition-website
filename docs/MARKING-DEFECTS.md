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
| F7 | Q17: the lines built on the wrong 35° are unmarked; Adrian wants to SEE the error propagate to the answer | rule + pen | inherited lines are `neutral` by design (the ✗ goes where the error is made) | design choice for Adrian: a light "↓ carried" mark on each inherited line, or the answer-line note stating "wrong because of line 1". Correction text with the chain (`∠OQR = 55°, ∠PRQ = 25° … so ∠OQP = 65°`) already exists in the read and was not drawn — ✅ bot fc74bb0: the chain now reaches the side strip (or footer); bench case `alessi-q17-answer-chain`. The "↓ carried" mark on each inherited line stays a design choice for Adrian, not built |
| F8 | Q18(b): "It represents…" — should open "The elements represent…" | rule | no wording note on a full-marks explain part | ✅ rule (78ff795: AN EXPLANATION THAT OPENS WITH "IT" IS A WORDING NOTE — the one prose exception to the notation-slip rule) |
| F9 | Q21: "+6 · careless" should read "should be +6" | pen | fix label = `${fix_short} · ${kind}` | ✅ bot fc74bb0: `lib/pen-labels.js` — "should be +6 · careless"; bench case `alessi-q21-should-be` |
| F10 | Q25(c): arrow points at the ✗, not at 2000 | rule (+ pen) | `slip_token` null on a "misread" line where one wrong given IS the token | rule: a misread that uses the wrong given sets `slip_token` to that value; pen: when the token appears twice on the line ring the one in the working, not the answer | ✅ rule (78ff795: A MISREAD THAT USES THE WRONG GIVEN RINGS THAT VALUE); pen ring of the first occurrence already existed |

Model split (Adrian, 17 Sep): Opus 5 agents for the pen bugs, verified on
`scripts/golden-pen.cjs` / `pen-dryrun.cjs`; the rule rewrites in this session.

**Shipped 17 Sep 2026 evening:** bot 78ff795 · 7d46482 · b901798 · fc74bb0 (one deploy, `npm test` 3027 green, pen bench 33/33). Fix-forward: Alessi's released paper is not re-inked.

**Same sheet, the Practice Again (job `584dddc6`):** Practice 1 = bank questions Montfort 2023 P1 Q22 + TKGS 2024 P1 Q13; Practice 3 already pairs HCF (Dunman 2024 P1 Q2) with LCM (Swiss Cottage 2024 P1 Q6, the 120 cm cube). Sub-parts sat in the number's column because the worker called `ws.parts()` under a numbered `ws.Q()`: `worksheet_lib.parts()` is now a no-op until the next `para()` stem (website, ADRIAN-STYLE §5).
