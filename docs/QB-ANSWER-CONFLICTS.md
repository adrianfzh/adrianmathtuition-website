# Question-bank answer conflicts — 2026-08-12

Rows where a stored `parts[].answer` disagrees with its own sibling `parts[].solution`.
Where the wrong value reached the row-level `answer` column it is a **live grading key**:
a student who answers correctly is marked wrong today.

## Status — 2026-08-12: sections 1 and 2 are FIXED in the database

**25 defects across 24 rows were re-verified and written** (cloud session). Every value was
recomputed from the question stem before writing — not taken from this file and not taken from
the row's own solution. Verification notes are in the tables below. Two items were deliberately
**not** written and remain open (see ⚠ markers): `aecc4cca` needs the part rewritten rather than a
key swapped, and `75aa1a77` cannot be settled without reading its graph.

Three rows needed more than the key: `4ec01079`, `9433bdff` and `10a7d4ec` carried the wrong value
in the *solution* too, and a corrected key sitting next to a contradicting solution would still
mis-grade — the grading prompt (`src/lib/practice-grade.ts`) emits both. Their solutions were
corrected to match.

Note for future sweeps: `parts[]` carries its own `solution` field alongside `answer`, and
`collectScheme()` emits both into the grading prompt. Fixing `answer` at row and part level is not
enough — `parts[].solution` has to be swept too (it caught `4ec01079` and `9433bdff` here).

Sections 3-6 are untouched and remain a work list.

## Method

`qb_answer_conflicts` (a view in the math Supabase, `nempslbewxtlikfzachi`) flags parts
where a 3+ character number in the answer cannot be justified from the part's own solution.
It uses bidirectional correct-rounding match, strips LaTeX exponents before tokenizing, and
skips answers carrying `accept` / `\pm` / `±`. Re-runnable after any future ingest.

387 parts across 351 rows were flagged. The 211 whose mismatch falls on the answer's **final**
numeric token were adjudicated by three independent agents, each recomputing rather than
eyeballing — summing data points, back-substituting roots, re-deriving regressions, and using
sibling parts as corroboration.

| slice | parts | defects | rate |
|---|---|---|---|
| 0 | 72 | 20 | 27.8% |
| 1 | 64 | 23 | 36% |
| 2 | 75 | 24 | 32% |
| **total** | **211** | **67** | **32%** |

**26 are live in the row-level key.** The three slices were disjoint and never compared notes;
their rates agreeing within a few points is the main reason to trust the number.

---

## 1. LIVE and high severity — ✅ WRITTEN 2026-08-12

The stored value is wrong, it is in the row-level `answer`, and it changes the graded result.
Every row below was written at **both** row level and part level. Each was recomputed from the
stem before writing and the recomputation agreed with the "how it was settled" column in every
case — including the two that needed a full reconstruction rather than arithmetic
(`32d528d2`, `e9526bff`; notes in those rows).

| id | level | part | stored | correct | how it was settled |
|---|---|---|---|---|---|
| `3a51d7f4` | AM | a | `2319` | **`23819`** | 2319 is below the 2015 starting population of 15,000 — impossible for a growth model |
| `253df722` | EM | a | `1 : 5000` | **`1 : 50000`** | sibling (b) gives 3.28 cm; at 1:5000 the road is 32.8 cm on the map |
| `25cd9d0a` | JC2 | iii | `k = 0.00941` | **`0.0941`** | 1.5 × Φ⁻¹(0.525) = 0.09406; factor of 10 |
| `fb2569dc` | JC2 | iv | `0.0328` | **`0.00328`** | W~B(16, 0.0999), P(W≥6) = 0.0032794; 0.0328 unreachable at any boundary |
| `bcd94504` | JC2 | i | `48437999` | **`484379999`** | ²⁶C₄·¹⁰C₂·6! − 1; a digit was dropped |
| `e9526bff` | JC2 | iii | `304818200` | **`304819200`** | gap method, independent of the solution: 7!·5!·504, where 504 = compositions of 5 into 8 gaps with each ≤ 2 |
| `31613b34` | JC2 | a | `s² = 36.268` | **`39.7`** | summed the 8 data points: Σ(x−x̄)² = 277.875, /7 = 39.696 |
| `9af3178c` | EM | c | `4.56 min` | **`4.65`** | ordered all 20 stem-and-leaf values; corroborated by parts (a) and (e) |
| `32d528d2` | EM | d | `∠JAG = 11.8°` | **`19.8°`** | solid reconstructed: A=(0,0,0), G=(15,8,10), J=(15,4,10+√48) gives AJ = 22.9688 (the part-(c) show-that target) and JG = exactly 8 |
| `b04c9098` | EM | a | `108.2°` | **`100.2°`** | PR = 37 by Pythagoras; 108.2° would need PR = 38.85 |
| `23bef0e1` | EM_NA | b | `115°` | **`121°`** | alternate angles; sibling (c)'s 71° requires 121° − 50° |
| `75aa1a77` | EM_NA | c | `d < 1500` | **`d < 1800`** | ⚠ **NOT WRITTEN** — see below |
| `72e1230a` | EM_NA | b | `15.2 cm` | **`15.1`** | 12 × ∛2 = 15.119 |
| `a208c058` | EM | a | `$21,490.54` | **`$21,490.79`** | 20000 × 1.003²⁴ |

### Special cases in this tier

⚠ **`aecc4cca` · EM · (c) — STILL OPEN, deliberately not written.** Stored `56.5°`, solution
`59.5°`, correct **≈ 76.9°**. The perpendicular from C to BD is fixed by the area alone:
2 × 1300 / 139.9635 = 18.576, corroborated by BC·sin∠CBD = 48·sin 23.1° = 18.83 — the solution's
47.15 is not a distance in this figure. Elevation = arctan(80/18.576) = 76.9°.
**Not written because the stored `question_text` is incomplete** — it carries neither the 1300 m²
area nor the 80 m tower height that (c) depends on, so swapping the key leaves a question a student
still cannot answer. Needs the stem restored first, then the part rewritten.

✅ **`4ec01079` · S1 · (b) — WRITTEN.** The *part-level* answer already read `2.43%`; only the
row-level key carried the solution's `1.94%`. Hire purchase with a 20% deposit finances $2,000,
not $2,500: 145.60/(2000×3)×100 = 2.4267%. Row key and both copies of the solution (row-level and
`parts[1].solution`) corrected to 2.43% with the 2000/60r derivation.

✅ **`9433bdff` · EM_NA · (c) — WRITTEN.** Same shape: the part already read `0.8 or 4.7`, the row
key carried `5.2`. 2x² − 11x + 8 = 0 gives 0.86255 and 4.63746; x = 5.2 substitutes to 11.94, not
11. Row key and both solution copies now read `0.8 or 4.7`, matching the part.
*Open nuance for Adrian:* the true root is 0.863, which reads nearer 0.9 than 0.8 off a graph. The
stored `0.8` was kept for consistency with the part-level value rather than widened — worth one
look if graph-reading tolerance matters here.

---

## 2. LIVE, lower severity — ✅ WRITTEN 2026-08-12

| id | level | part | stored | correct | note |
|---|---|---|---|---|---|
| `b04c9098` | EM | c | `$31,680` | `$11,680` | 73/hr × 160 = 11,680; A 8,640 / B 11,200 / C 11,680, so "System C" survives |
| `d09cdc4b` | EM_NA | b | `$4003.88` | `$4006.04` | monthly rate transposed; "disagree" conclusion holds |
| `6f29d9df` | S2 | e | `16.87 cm` | `16.8` | altitude = 28×21/35 exactly; no rounding gives 16.87 |
| `d9ef7996` | JC2 | iii | `480 or 510` | `480` | 510 is part (ii) leaking in — key wrongly *accepts* a wrong answer |
| `a8d04edb` | JC2 | ii | `67.595 ≈ 67.5` | `67.6` | the answer mis-rounds its own stated value |
| `93229bdd` | EM | a | `98.4°` | `98.3°` | 1 d.p. boundary; most schemes accept both |
| `e0cda9f7` | JC1 | c | `0.987 m` | `0.985` | h = 0.4r exactly |
| `cdcd3762` | EM_NA | b | `$740.32` | `$740.31` | one cent |
| `522e9dfe` | S1 | b | `$120.39` | `$120.38` | 120.375 at an exact .5 boundary |

---

## 3. Needs your eye — graph-dependent, an agent cannot settle it

Both branches are internally consistent; they are two incompatible readings of the same
figure, and `has_image = true`. Reading the curve once fixes a whole branch.

- **`4ff8ba5b` · EM** — median mass `360 g` vs `370 g`; probability `0.201` vs `0.0616`.
  The split runs through four parts. The solution branch is favoured (its readings are
  monotone and mutually consistent) but that is inference, not proof.
- **`9dbf8b0d` · EM** — distance `167.5 m` vs `199 m`. Part (a)(iii)'s solution is itself
  self-contradictory: it computes 135, then declares 167.5.
- **`b5185d0d` · EM_NA · a(i)** — `$51.36` vs `$82.56`, unsettled without the fare table.
  Not flagged by the sweep; found in passing.
- **`75aa1a77` · EM_NA · (c)** — moved here from section 1 on 2026-08-12. Stored `d < 1500`,
  solution `d < 1800`. The row's own parts give the gradient (400/4000 = 1/10, so y = 50, x = 2)
  but not the crossover, and the stem is just "The graph shows the charges of two taxi companies";
  every route to 1800 runs through reading the figure. The 1800 branch is the likelier of the two
  (it is what the solution derives, and it yields round tariff rates) but that is inference, so the
  key was left alone rather than written on a guess. One look at the graph settles it.

---

## 4. Part-level defects — ✅ WRITTEN 2026-08-12

> ⚠ **This section's original framing was wrong and cost it priority it should have had.**
> It read "nothing student-facing is wrong, but the part data is." In fact
> `collectScheme()` in `src/lib/practice-grade.ts` emits **every** `parts[].answer` and
> `parts[].solution` into the grading prompt, exactly like the row-level fields. A wrong
> part answer fails a correct student just as hard as a wrong row-level key. These were
> live all along.

18 defects across 16 rows, each recomputed from the stem by an independent verifier and
then re-checked before writing. In every one the damage was confined to `parts[].answer`
— the row-level fields and `parts[].solution` were already right, which is why they
survived earlier review, and which gives a cheap detector for the next sweep: flag any
part whose stored answer contradicts the value its own solution derives.

`affcfa5e` AM (b) roots `15°,75°,90°,195°,255°` → `30°,90°,150°` (the stored set solves
sin 2x = ½; a brute-force scan of the real equation returns exactly 30/90/150) · `4a9d08e0` JC2 (ii),(iii) part answers shifted one part late · `2e93f44a` EM (b)
`$3402` → `$3042` · `8a822552` AM (b) `13.3` → `15.3` min · `9e445cf6` EM (b) `$1071.71` →
`$1074.71` · `cd282a12` AM (b) `137/394` → `137/384` · ⚠ `44c7edf3` EM (b) `$6.70` → `$5.60` — **NOT WRITTEN**, see below ·
`05658b01` JC2 (iii) `0.184` → `0.183` · `99b2cea6` EM (a) `259.2°` → `250.2°`, (b) `36.7°` →
`26.2°` · `849953c9` JC2 (a) `0.389` → `0.379` · `0f39ba5a` EM (e) `689 m` → `675` ·
`496246ba` EM_NA (a) `√97` → `√80` · ⚠ `ba82cf34` JC2 (iii) — **this file's proposed `0.718` was itself wrong**; see below ·
`88c84298` JC2 (iv) `1565 mm` → `1216` · `458c441e` EM (a) `2145` → `214.5` ·
`16052364` JC2 (i) `0.192` → `0.182` · `c98d0a4f` AM (b) answers shifted one part ·
`ff0a9d4b` JC2 (i) `μ = 500` → `50` · `1086925c` JC2 (ii) — **fix `question_text`**, it has a
typo that makes a 5-mark question trivial · `7124ff0f` AM (b) and `7677438c` AM (a),(b) and
`1d4077d0` AM (ii),(iii) — all four trace to corrupted `question_text`, fix the stem first ·
`5941deef` JC2 — all five part answers belong to a different question

### Section 4 exceptions

⚠ **`ba82cf34` · JC2 · (iii) — the proposed fix was wrong; corrected to a third value.**
Stored `41.1° / 0.178 rad`, this file proposed `0.718 rad`. Both are wrong. Part (iii) gives
the line's own equation — `x − 6 = (y−15)/3 = −(z+3)/3`, direction `(1, 3, −3)` — and asks for
the inclination of **EF**; the stored solution instead used `DF = (1, 3, 2)`, and D is not on
EF. With n = (1,1,8): sin θ = 20/(√66·√19) = 20/√1254, **θ = 34.4° (1 d.p.) or 0.600 rad**.
The row corroborates this twice over: part (iv) derives direction `(1,3,−3)` from the same
equation, and part (v)'s answer is `√19 km` = |EF| (|DF| would be √14). Answer and solution
both rewritten to use EF. **The coincidence that made this invisible: n·DF and n·EF both
equal 20**, so only the magnitude differs and the working looks clean.

⚠ **`44c7edf3` · EM · (b) — NOT WRITTEN.** Stored `$6.70`, the row's own solution says `$5.60`.
`$5.60` could not be confirmed: the parcel weight/dimension limits and the postage price table
are image-only (no extracted text anywhere in the row), and the stored working charges the
18 kg rate for a parcel its own book count puts at 19.5 kg, then reverse-engineers the count
("*900 − 6×128 = 132 mm? Actually … the marking scheme uses 260*"). Both `$5.60` and `$6.70`
are reachable from plausible table values. Needs the figure read before either is written.

⚠ **`4a9d08e0` · JC2 · (i) — left alone deliberately.** The one-part-late shift also stripped
part (i)'s probability, leaving it with the assumption text only. Restoring `0.380` is the
obvious move, but part (i)'s stem reads "at most 3" while the solution, the row-level answer
and part (iv) all require "fewer than 3" — under "at most 3" the correct value is 0.618 and
parts (i) and (ii) would be identical. A missing key grades weakly; a wrong key fails correct
students, so it stays missing until the stem is checked against the original paper.

---

## 5. Reverse cases — ✅ WRITTEN 2026-08-12

All eight verified and repaired in both the row-level `solution` and the `parts[].solution`
copy. Every stored answer was confirmed correct first — the premise "only the solution is
wrong" was itself tested, not assumed.

`f0e8d95a` AM a(iii) — solution solves for 48.75 mg where the question says 40 · `32d528d2`
EM (a) — solution computes the base diagonal AC and labels it BE · `0850ef8e` S2 (c) —
solution states *where* the maximum occurs, not its value · `73d8953d` AM (b),(c) — author
pasted R's value into α (`21.54°` for `tan⁻¹0.4 = 21.8°`), error propagates to (c) ·
`f1f5a554` JC2 (i) — solution quotes its own numerator as the answer · `7cd65ab3` JC2 (d) —
correct expression, wrong number attached · `d63ae88a` EM (c) — evaluates at the wrong
variable · `20ff3073` S2 (b) — computes PQ and stops; the question asks for PT ·
`20683738` AM (b) — `2035` vs `2036`, convention-dependent, worth an eyeball

---

## 6. What this check cannot catch

**Agreed-upon errors.** The sweep finds disagreements between answer and solution. Where both
sides agree *and are both wrong*, it is blind by construction. One confirmed instance:
`10a7d4ec` (d) stores gradient `−0.72` with the solution accepting `[−0.8, −0.6]`, but
differentiating `y = x(x−2)(x+1)` at `x = −0.2` gives **`−1.48`** (−0.72 is the gradient at
x = −0.4). ✅ **WRITTEN 2026-08-12** — key set to −1.48 and the accept band re-cut to
`[−1.7, −1.3]`, since the old band would itself have failed a correct student.
This class is the argument for a sweep that recomputes rather than cross-checks.

**Wrong-vector / wrong-object errors.** `ba82cf34` (section 4) is the sharpest example: the
solution computed a real quantity correctly, just for the wrong segment, and the dot product
happened to agree. Numeric cross-checks pass; only re-reading what the question asks catches it.

**Non-numeric conflicts.** Two rows have correct values reached by invalid reasoning
(`ccf6858e`, `efde1ba5`) — right answer, wrong justification.

**The 176 unadjudicated parts** whose mismatch is in an intermediate rather than the final
numeric token. Expected to be mostly artifacts, but unmeasured.

## Corrupted source text found in passing

`a309965d` stem-and-leaf renders 21 leaves for 20 days · `79d862ff` stem says 857,700 where
every part uses 857,900 · `d63ae88a` question_text OCR damage (`16sZ2` for `16s^2`) ·
`70f7f912` unterminated `$` delimiter · `2c821938` question_text is only the calculator rubric
