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

| F11 | (Lakshanya, H2 VJC 2024 P2, run `b60a84cb`) the footer's Correct solution Q6(d) sentence ran off the page — "sentence is cut off sometimes" | pen | the solver set the whole sentence as ONE `$…$` span of `\text{}` pieces; `wrapPenLine` cannot break inside a span, shrank it to the 11 px floor and it still overflowed | bot b09d72b: a span wider than the line that carries `\text{}` is exploded into words + its maths (`explodeWideSpan`), so it wraps at full size; pure-maths wide spans keep the old path (test in `pen-math.test.js`) | ✅ forward |
| F12 | same paper Q8(a): "probability of one speaker being faulty is independent of the probability that another is faulty" ticked B1; "constant" without "for every speaker" ticked with no note | rule | no rule on the wording of binomial/Poisson assumptions | bot b09d72b: BINOMIAL / POISSON ASSUMPTIONS ARE STATEMENTS ABOUT EVENTS — the probability line is wrong (concept, B0, correction "independence is between events: …"); the missing quantifier is a note beside the tick | ✅ forward (Override on the desk for the released paper) |
| F13 | a student on Q9(a) ("Show that y is always increasing if a² < 3b"): "Teacher i dont really understand 9a" — the strip note was a paragraph; Adrian's own red pen was a column of steps with a reason beside each | pen + rule | phase 2's "From your line" continuation was never switched on (`MARKING_PEN_V2` unset), so the only teaching was the strip paragraph; and the continuation had no place for reasons | bot 1719421b: `step_reasons[]` parallel to the steps (validated ≤ 40 chars, drawn "← reason" under each step, "(shown)" closes a show-that); `MARKING_PEN_V2=1` staged + deployed | ✅ forward |
| F14 | Isabelle EM 2023 TYS P2 (run `cc4eb0e4`) "seems double marked" — 36 pages, every question inked twice | infra + pen | the 18 files were uploaded TWICE (36 distinct URLs, byte-identical pairs, two covers). Reconciliation kept one read per part so 74/90 was right, but both copies stayed in the PDF and the losing copy was inked without chips | bot 4be17b06: `lib/photo-dedupe.js` drops byte-identical photos and renumbers the run's source before the Mac claim and the API lane read (`source.dropped_duplicates`); Isabelle's run re-queued as a whole re-mark → 18 pages, re-issued on release | ✅ re-marked 17 Sep 18:18 SGT: 18 pages read (18 duplicates dropped at the claim), 74/90 unchanged, copy re-issued at 18:21 |
| F15 | Sijia EM 2023 P1 (run `bb025b41`, drawn 17 Sep 17:27 SGT with fc74bb0): Q2(a)/Q6(a)/Q8(c)(i) carry the same note two or three times in the strip; the new red strip text is plain (tofu superscripts, one continuous line); Q5(b)/Q6(a) answer-line fixes point at the ✗ (no ring on an answer line); Q17(b)'s "should be …" label crosses into the strip; Q21(c) B1 drawn nowhere | pen (regression) | fc74bb0 routed every wrong line's correction AND the answer chain to the strip beside the part note that already says it, drew them as plain text, and lengthened labels without re-measuring; answer-line tokens never ring; a two-row matrix line gets no tick | Opus agent `pen-strip`: one typeset note per part (`saysTheSame`), sentence-per-line, ring/arrow on the answer's ink, labels clipped to their column, the matrix tick; bench cases on pages 0/1/2/3/6/8/11 | ✅ bot dfd88ea7: `chooseStripNote` (one typeset note per part), answer-line ring at full width + shared `_slipAnchor`, label re-set whole → kind on its own line → no kind → strip, `fillMissingPartGlyphs`; 8 Sijia bench cases + 4 check kinds (81/81); deployed with 0224ad64 (brand line + student-voice rule) |
| F16 | Sijia Q14 footer "Correct solution": the last three equation lines are not aligned at "=" (prose-prefixed lines break the aligned group) | pen | `groupAlignedTex` aligns only consecutive equation-only lines | open — align the equation tail even after a prose line | ⏳ open |
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

**The fixer's first pass, 22 Sep 2026, 01:00–02:30 SGT** — four Opus agents in their own clones + one drafter; every fix proved on the bench in the MERGED tree (npm test 3274, pen bench 479/479 on 49 cases) and one real page redrawn and looked at; bot deploy `798ef177` live 01:41. Fix-forward: nothing delivered was re-inked.

| # | complaint | bin | root cause | fix | status |
|---|---|---|---|---|---|
| F22 | Sophie AM 2025 P1 (run `e40b7870`) page 15 Q13: every glyph one row too high — "the ring and ✗ sit on the CORRECT line and the wrong line below is ticked, three times on one page" | pen (placement) | ONE neutral `Sketch:` line on the page made the rows-first matcher stand aside for the whole page (it stood aside for ANY sketch line, but a neutral one carries no mark, so nothing was gained); the fallback anchored "2y = 3x + 17" on the student's "2y − 3x = 17" one row up and the column followed. 68 of 1678 pages in the fortnight lost the matcher this way | bot `17ab76e0`: `rowsFirstEligible` — stand aside only for a sketch line that carries a mark; bench `test/row-place-anchor-row.test.js` (red → green) + pen case `sophie-am2025p1-p14-q13-anchor-row`. RESIDUE: a page whose sketch line DOES carry a mark (379 in the fortnight) still uses the fallback — its own class | ✅ live 22 Sep |
| F23 | Sophie p5 Q5(b): "X and Y are already the logs" printed three times at one ✗ (label head, the correction under it, the verdict); p9 Q9 twice | pen | a concept label's head IS the rule its correction opens with (`conceptRuleName`), so head + correction repeated it by construction; the 17 Sep label-vs-verdict guard only ran on a label that also carried a fix | bot `e7484b25`: `dropRuleHead` (pure, tested) cuts the head off the correction once said; a kind-only label the verdict already says is drawn headless; new check `no-duplicate-text-per-part` (bench + runtime); 2 cases red → green | ✅ live 22 Sep |
| F24 | Sophie p6 and p15: a ✓ labelled A0, a ✗ labelled M1 (three on the paper). The reader's "✓ AND ✗A0 on one line, p8" was a misread — p8 agrees with itself | pen | `ai/line-codes.js` checked that per-line SEAB tags reconcile with the scheme, never that a code and its glyph agree | bot `6d7c5ef5`: a contradicting tag is a broken attribution → the page's codes fall back to the score box; marks untouched; `glyphs-follow-verdicts` extended; 2 cases | ✅ live 22 Sep |
| F25 | Isabelle EM 2021 P1 (run `5122be34`) pp. 4, 7: the ✓ drawn ACROSS the value she wrote on the printed "Answer ……" rule ("16"; "4x² + 12xp + 9p²") — the reader's "tick on the printed word Answer" and "red ink over her handwriting" are one bug | pen | a value written ON a printed rule is masked out of the writing layer by `ruleMask`, so the ink walk saw only the word "Answer" and stopped there, on her answer | bot `a93eca58`: `_slidePastInk` in `ai/annotate.js` — after the de-overlap nudge, a glyph steps past ink it would cover to the first clear square of its own size, off the page raster; new bench check `marks-clear-of-ink` (bench-only — needs the raster), 2 cases red → green. The reader's p5 Q12(c) "ink over her list" was a false alarm: that is the RING doing its job | ✅ live 22 Sep |
| F26 | Sophie p14: a strip note printed its maths delimiters — "$Area=$" | pen (rendering) | `explodeWideSpan` turned the bare TeX control space between two `\text{}` blocks into a lone-dollar token, which re-paired with the next `$`. Not a marker slip: no "$$" exists in the stored run | bot `798ef177`: `flushMath` drops a piece with nothing to typeset; unit test + case `sophie-am25p1-p14-strip-dollars` | ✅ live 22 Sep |
| F27 | Isabelle EM 2021 P1 p6 Q13: a ✓ dropped mid-sentence into a full-width PROSE answer | placement, but the right place is a judgement | no clear space exists anywhere on the line, so no slide helps | none — where does a ✓ go on a prose answer: end of last line / left margin / beside the part? | ⚠️ Adrian's call |
| F28 | Sophie p14 Q12(b) and p12 Q11(b), both 0/3: the worked solution is written but EXILED to an overflow sheet while the page is seven-eighths blank | pen (placement) | a 0/n part gets no "From your line" by rule, so the solution is the only teaching; the blank-space placer needs one fully ink-free rectangle, scanner speckle (dilated) denies every window, the block falls to the footer, the footer busts `SOLUTION_OVERFLOW_FRAC`. A smaller fitting attempt was tried and reverted — the height is typeset-maths ascent, not font size | none yet — the real fix (split the block, or relax zero-ink on a near-empty page) risks writing over faint working; bench-only check `solution-stays-on-the-page` exists and fails the page | ⚠️ Adrian's call: allow the placer to use near-empty space? |
| F29 | Sophie p13 Q12(a)(ii) 0/3 carries four ✓ before the ✗ | rule, not a leak | `quietZeroParts` did exactly what the 12 Sep rule says: "lines BEFORE the ✗ keep their ticks — they were right on their own" | none — should a part that earned nothing carry any tick at all? | ⚠️ Adrian's call |
| F30 | Nicole H2 2024 P2 (run `01c39ed9`) p1: the ✗A0 on the printed question line, and a note box so narrow it wraps mid-phrase | pen (note placement) | not diagnosed this pass — "washed-out scan reads as blank" was tested and is wrong (the print is dark) | own class, next pass | ⏳ |

**Wording proposals** — branch `proposal/2026-09-22-reader-words` on the bot (rebased on `798ef177`, npm test 3276, bench 479/479), one commit each, ship with "ship proposal reader-words N":
1. `6a8ca292` a note names the STEP, not the idea, and never opens with the student's own wrong move — "it only needed the right area and the × dx/dt" → "A = 9 + x², so dA/dt = dA/dx × dx/dt = …"; "From taking ln of the plotted values" → "the plotted values ARE ln x and ln y, so b is the gradient straight away". No meaning change.
2. `e5320f3e` the chip says "copied wrongly", not "transfer error" (SPEC-RED-PEN §3's words). Meaning change: breaks the "<kind> error" pattern of 3 Sep for one of the nine; the stored code stays `transfer`.
3. `5aa8962a` the kind goes UNDER the fix; the " · " glue is never a multiplication dot ("should be π/k · the base of the triangle is AB" read as π/k × the base). Layout, not wording; two corrections that used to be dropped now fit.
4. `1c83369f` "should be" goes only in front of a VALUE — "should be not a whole number!" → "not a whole number!" (the prompt rule is what makes it write 196).
5. `6aea20d5` "careless!" is never written over work the student got right — a verdict that is only a kind word is not drawn; the kind still rides the ✗. Meaning change: DELETES ink, Adrian's voice; alternative = draw it only level with its own first ✗.
