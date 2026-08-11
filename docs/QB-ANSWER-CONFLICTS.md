# Question-bank answer conflicts — 2026-08-12

Rows where a stored `parts[].answer` disagrees with its own sibling `parts[].solution`.
Where the wrong value reached the row-level `answer` column it is a **live grading key**:
a student who answers correctly is marked wrong today.

Nothing in this file has been changed in the database. It is a work list.

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

## 1. LIVE and high severity — fix first

The stored value is wrong, it is in the row-level `answer`, and it changes the graded result.

| id | level | part | stored | correct | how it was settled |
|---|---|---|---|---|---|
| `3a51d7f4` | AM | a | `2319` | **`23819`** | 2319 is below the 2015 starting population of 15,000 — impossible for a growth model |
| `253df722` | EM | a | `1 : 5000` | **`1 : 50000`** | sibling (b) gives 3.28 cm; at 1:5000 the road is 32.8 cm on the map |
| `25cd9d0a` | JC2 | iii | `k = 0.00941` | **`0.0941`** | 1.5 × Φ⁻¹(0.525) = 0.09406; factor of 10 |
| `fb2569dc` | JC2 | iv | `0.0328` | **`0.00328`** | W~B(16, 0.0999), P(W≥6) = 0.0032794; 0.0328 unreachable at any boundary |
| `bcd94504` | JC2 | i | `48437999` | **`484379999`** | ²⁶C₄·¹⁰C₂·6! − 1; a digit was dropped |
| `e9526bff` | JC2 | iii | `304818200` | **`304819200`** | re-derived by the gap method, independent of the solution |
| `31613b34` | JC2 | a | `s² = 36.268` | **`39.7`** | summed the 8 data points: Σ(x−x̄)² = 277.875, /7 = 39.696 |
| `9af3178c` | EM | c | `4.56 min` | **`4.65`** | ordered all 20 stem-and-leaf values; corroborated by parts (a) and (e) |
| `32d528d2` | EM | d | `∠JAG = 11.8°` | **`19.8°`** | solid reconstructed from the part-(c) show-that target, which it reproduces exactly |
| `b04c9098` | EM | a | `108.2°` | **`100.2°`** | PR = 37 by Pythagoras; 108.2° would need PR = 38.85 |
| `23bef0e1` | EM_NA | b | `115°` | **`121°`** | alternate angles; sibling (c)'s 71° requires 121° − 50° |
| `75aa1a77` | EM_NA | c | `d < 1500` | **`d < 1800`** | reconstructed both tariffs; only the 1800 branch gives round rates |
| `72e1230a` | EM_NA | b | `15.2 cm` | **`15.1`** | 12 × ∛2 = 15.119 |
| `a208c058` | EM | a | `$21,490.54` | **`$21,490.79`** | 20000 × 1.003²⁴ |

### Special cases in this tier

**`aecc4cca` · EM · (c) — both sides are wrong.** Stored `56.5°`, solution `59.5°`, correct
**≈ 76.9°**. The area constraint fixes it independently of the diagram: h = 2 × 1300 / 139.966
= 18.576, elevation = arctan(80/18.576). Needs the part rewritten, not a key swap.

**`4ec01079` · S1 · (b) — the solution is wrong, the answer is right.** Row-level carries the
solution's `1.94%`; correct is **`2.43%`**. Hire purchase with a 20% deposit finances $2,000,
not $2,500. Confirmed independently by two adjudicators.

**`9433bdff` · EM_NA · (c) — same shape.** Row-level carries `5.2`; correct is **`0.8 or 4.7`**.
2x² − 11x + 8 = 0 gives 0.8625 and 4.6375; x = 5.2 substitutes to 11.94, not 11. A student
reading 4.6–4.7 off their graph is marked wrong today.

---

## 2. LIVE, lower severity

| id | level | part | stored | correct | note |
|---|---|---|---|---|---|
| `b04c9098` | EM | c | `$31,680` | `$11,680` | graded decision (System C wins) survives; the figure doesn't |
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

---

## 4. Part-level only — row-level answer is already correct

Lower priority: nothing student-facing is wrong, but the part data is.

`affcfa5e` AM (b) roots `15°,75°,90°,195°,255°` → `30°,90°,150°` (the stored set solves
sin 2x = ½) · `4a9d08e0` JC2 (ii),(iii) part answers shifted one part late · `2e93f44a` EM (b)
`$3402` → `$3042` · `8a822552` AM (b) `13.3` → `15.3` min · `9e445cf6` EM (b) `$1071.71` →
`$1074.71` · `cd282a12` AM (b) `137/394` → `137/384` · `44c7edf3` EM (b) `$6.70` → `$5.60` ·
`05658b01` JC2 (iii) `0.184` → `0.183` · `99b2cea6` EM (a) `259.2°` → `250.2°`, (b) `36.7°` →
`26.2°` · `849953c9` JC2 (a) `0.389` → `0.379` · `0f39ba5a` EM (e) `689 m` → `675` ·
`496246ba` EM_NA (a) `√97` → `√80` · `ba82cf34` JC2 (iii) `0.178 rad` → `0.718` ·
`88c84298` JC2 (iv) `1565 mm` → `1216` · `458c441e` EM (a) `2145` → `214.5` ·
`16052364` JC2 (i) `0.192` → `0.182` · `c98d0a4f` AM (b) answers shifted one part ·
`ff0a9d4b` JC2 (i) `μ = 500` → `50` · `1086925c` JC2 (ii) — **fix `question_text`**, it has a
typo that makes a 5-mark question trivial · `7124ff0f` AM (b) and `7677438c` AM (a),(b) and
`1d4077d0` AM (ii),(iii) — all four trace to corrupted `question_text`, fix the stem first ·
`5941deef` JC2 — all five part answers belong to a different question

---

## 5. Reverse cases — the solution is wrong, the key is right

Fix the worked solution; a student following it lands on the wrong value.

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
x = −0.4). Live at row level.

**Non-numeric conflicts.** Two rows have correct values reached by invalid reasoning
(`ccf6858e`, `efde1ba5`) — right answer, wrong justification.

**The 176 unadjudicated parts** whose mismatch is in an intermediate rather than the final
numeric token. Expected to be mostly artifacts, but unmeasured.

## Corrupted source text found in passing

`a309965d` stem-and-leaf renders 21 leaves for 20 days · `79d862ff` stem says 857,700 where
every part uses 857,900 · `d63ae88a` question_text OCR damage (`16sZ2` for `16s^2`) ·
`70f7f912` unterminated `$` delimiter · `2c821938` question_text is only the calculator rubric
