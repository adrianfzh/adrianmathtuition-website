# Sec 1 or Sec 2? — the split of today's lower-secondary maths syllabus

> The one list any job uses to decide whether a question, twin or sub-skill is Sec 1 work
> or Sec 2 work (the twin writer, the extraction reader, the sub-skill filer, practice).
> Written 15 Oct 2026 for the Sec 1 bank clean-up (SPEC-TWINS.md §12). Source: MOE's
> 2020 lower-secondary syllabus (G3), the one schools teach now.

## Why this list exists

Many real Sec 1 school papers in the bank use Sec 2 work: schools that teach ahead
(NYGH, CHS IP, VS, MGS …) and papers set before the 2020 syllabus. Filed as Sec 1, those
questions go to Sec 1 students in practice, and the twin writer copies them into new
Sec 1 twins. The level of a question follows **today's** syllabus, not the paper's cover.

## Sec 1 work (today)

- **Numbers** — primes, prime factorisation, HCF / LCM, squares, cubes and their roots,
  negative numbers, integers, rationals, reals, the number line, ordering, the four
  operations, calculator work, rounding to d.p. / s.f., estimation.
- **Ratio** — simplifying, combining, sharing in a ratio, before/after problems.
- **Percentage** — conversions, increase / decrease, reverse percentage, successive changes.
- **Rate and speed** — rates, unit cost, average rate, speed, average speed, unit conversion.
- **Problems in real-world contexts** — everyday life and household money: simple and
  compound interest, tax, GST, instalments (hire purchase), bills, money exchange.
- **Algebra** — letters for numbers, substitution, writing expressions from words, number
  patterns, simplifying linear expressions (including fractional coefficients like
  2x/3 − 3(x − 5)/2), expanding ONE bracket (and brackets inside brackets), taking out a
  common factor (including a common bracket).
- **Equations** — linear equations in one unknown, including fractions with number
  denominators and simple ones like 3/(x − 2) = 6; forming an equation from words.
- **Graphs** — coordinates, linear functions y = ax + b, plotting and reading straight-line
  graphs, gradient as rise over run, linear graphs in real life.
- **Geometry** — angles, parallel lines, triangles, special quadrilaterals, polygons
  (interior / exterior angle sums), constructions (triangles, quadrilaterals, bisectors).
- **Mensuration** — perimeter and area of plane shapes and composite shapes (including
  circles, semicircles and quarter circles), volume and surface area of cubes, cuboids,
  prisms and cylinders.
- **Statistics** — collecting and showing data: tables, pictograms, bar graphs, pie charts,
  line graphs, and judging whether a graph is fair or misleading.

## Sec 2 work (today) — NOT Sec 1

- **Expansion** — two brackets, (a ± b)², (a + b)(a − b).
- **Factorisation** — quadratics, difference of two squares, grouping four terms.
- **Algebraic fractions** — multiplying and dividing them; adding / subtracting with a
  letter in the denominator.
- **Changing the subject of a formula.**
- **Inequalities** — solving linear inequalities, integer solutions, greatest / least values
  from ranges, forming inequalities from words.
- **Simultaneous equations.**
- **Quadratic equations and graphs.**
- **Direct and inverse proportion.**
- **Map scales** (distance and area).
- **Congruence and similarity, Pythagoras' theorem, trigonometry.**
- **Pyramids, cones and spheres** (volume and surface area).
- **Statistics** — dot diagrams, stem-and-leaf diagrams, histograms, mean / median / mode.
- **Probability.**

## Sec 3 and later

Arc length and sector area for a general angle θ, set notation, matrices, bounds of
accuracy in formulas, fractional and negative indices beyond simple cases.
(A quarter or half circle is NOT arc length — it is part of a circle, Sec 1.)

## The Sec 1 sub-skill tree, checked against this list (15 Oct 2026)

167 Sec 1 sub-skills. **13 are Sec 2 work as a whole** — retired from Sec 1 (`subgroups.
visibility = 'hidden'`), their school questions moved to Sec 2:

| Sec 1 sub-skill (id) | Sec 2 home |
|---|---|
| Expanding perfect squares and binomials (488) | Algebra (Expansion) 1363 / 1364 / 1365 |
| Making the subject of a formula (418) | Algebra (Subject of Formula) 1383–1388 |
| Factorising by grouping (459) | Algebra (Factorization) 1335 |
| Fractions with a variable denominator (442) | Algebra (Fractions) 1307 / 1308 / 1310 |
| Algebraic fraction multiplication or division (443) | Algebra (Fractions) 1306 |
| Solving Linear Inequalities (350) | Algebra (Inequalities) 1370 / 1371 |
| Integer Solutions of Inequalities (351) | 1373 |
| Extremes from Variable Ranges (352) | 1375 |
| Largest and Smallest Values With Negatives (353) | 1375 |
| Real-World Range / Bound Check (354) | 1374 / 1375 |
| Forming Inequalities from Context (355) | 1374 |
| Scale Drawings & Maps (424) | Map Scales 1389–1395 |
| Frequency Tables, Stem-and-Leaf and Averages (475) | Statistics 531 / 533 / 535 |

A question in one of these that is really Sec 1 work (e.g. a plain frequency table) is
re-filed under a Sec 1 sub-skill instead of moving.

**Mixed sub-skills — kept, but some of their questions are Sec 2 work** (read one by one):
Expansion & Simplification (413), Algebraic Fractions (414), Algebraic Fraction Combination
(484), Solving Linear Equations & Inequalities (417), Using factorisation to calculate
cleverly (460), Equations With Algebraic Fractions (444), Multi-step 'hence' fraction
questions (445), Expanding Nested Brackets (483), Proportion, Rate & Real-World Percentage
(425), the 3D mensuration sub-skills (371–374, 376: cones, pyramids, spheres), Linear AP /
patterns (quadratic nth term). The other 140-odd sub-skills are Sec 1 work.

## Done — the Sec 1 bank clean-up (15 Oct 2026, Adrian: "yes")

Adrian also settled: **compound interest and quarter / half circles are Sec 1** (household
money problems are in today's Sec 1 syllabus; a quarter circle is part of a circle).

20 Sonnet readers read every Sec 1 school question (3,560) plus the 6 twins in the 13
retired sub-skills, against this list (brief: the judgement rules above, Sec 2 only when a
named Sec 2 step is needed). Result, 316 flagged:
- **207 moved to Sec 2** (202 school questions, 5 twins): `level` → S2, filed under one Sec 2
  sub-skill (`question_subgroups.source = 'level-move-2026-10-15b'`, reason "moved from Sec 1: …"),
  every Sec 1 filing removed. Most common: inequalities (58), statistics (32), grouping (17),
  simultaneous equations (17), cones / pyramids / spheres (15), algebraic fractions × ÷ and letter denominators (13), map scales (11).
- **61 could not move**: the same school, year, paper and question number already exists at
  Sec 2 (that school's own Sec 2 paper — the bank allows one row per number per level). They
  stay Sec 1 with `legacy_syllabus = true`: hidden from Sec 1 practice, the twin queue and the
  filer; an IP student with IP content still gets them (their schools teach ahead).
- **20 re-filed inside Sec 1**: rows in a retired sub-skill that were Sec 1 work after all
  (plain frequency tables → bar-chart / pie-chart sub-skills, etc.).
- **28 flagged Sec 3+, not moved** (laws of indices with letters, standard form, sector arcs at
  a general angle). 22 of them sit only in retired sub-skills, so Sec 1 practice no longer
  serves them. List below — Adrian to decide.
- The 13 sub-skills: `subgroups.visibility = 'hidden'` (the value JC already uses).

**Checked after:** moved rows in `practice_pool('S1')` 0, in `practice_pool('S2')` all;
legacy rows in `practice_pool('S1')` 0 (IP too); `math_twin_units(['S1'])` rows for the 13
sub-skills 0 (Sec 1 writable twin slots 44 → 29); `twin_queue` Sec 1 rows in the 13 or
from a legacy row 0. Pool sizes: Sec 1 643 → 633, Sec 2 4,468 → 4,661. Three Sec 1 twins
copied from seeds now at Sec 2 were left alone (the 15 Oct twin read judged them Sec 1).
Backup (every Sec 1 row's level + every filing + the 61 flags):
`_backups/s1-bank-level-move-before-2026-10-15.json`.

**Closed 15 Oct 2026 (bot 42d0b2e3) — new Sec 2 work cannot come back into the Sec 1 bank.**
The machine copy of this list is bot `extraction/lower_sec_split.json` (step codes + the rules
above) — change both together.
- **The sub-skill filer** already skipped hidden sub-skills (since 9 Oct). A Sec 1 bucket's
  readers now get a fourth outcome, *needs later work* (`sec2_work`, a step code), which beats
  filing and "fits none". When BOTH readers say so the question gets `legacy_syllabus = true`
  (out of Sec 1 practice, twins and the filer, like the 61 above). One reader only, or the
  readers disagree → held. A **Sec 3+** step is always held, never applied: those wait for
  Adrian (the list below). Shown as `⤴` lines and `sec2_work` in the job stamp's `set_aside`.
- **Extraction**: every row of a Sec 1 payload must carry `sec2_step` (null, or the step its
  marks need). `bank_insert.py` refuses a payload without it, banks a flagged row at S1 with
  `legacy_syllabus = true` (the paper stays whole at one level, as the house rules require) and
  prints `SEC2 WORK: Qn (step)` into the finish notes. A re-sent row keeps a flag it already
  has. The rule is on `/admin/extraction-rules` as `xr-sec1-syllabus-check`.
- Not done: such a row is flagged, not moved to Sec 2 — Sec 2 students do not get it. Moving
  needs a Sec 2 sub-skill filing and splits the paper across levels.

### The 28 flagged Sec 3+
- `08d6c327-17aa-4725-b244-fced3daa9218` Catholic High (IP) 2013 — Laws of indices with negative indices
- `1381c7f0-a9c9-4d55-b8ca-2b60a72b488c` Catholic High (IP) 2013 — (a) expand (2x+3)^2 and two brackets; (b) laws of indices with letters
- `1b13fbec-06a2-49c2-bd85-b550d7a9b1dd` AdrianMath 2026 — Fractional index (64a^6)^(1/3), powers of fractions; algebraic fraction division
- `2bed7e31-322b-4cb0-b508-2c3bcc36928b` Catholic High (IP) 2010 — Sets: universal set, intersection, complement, n(A'∪C), set notation.
- `2c38bf53-265b-4aec-a48f-174940150b8a` Nanyang Girls 2015 — Algebraic fraction division plus square root and cube with letter indices.
- `432e00ad-9107-459d-95ce-cf16fcbf3961` RI 2022 — Arc length of reflex angle 242 degrees, segment area, sector work
- `5f425d90-f8d5-4ec1-8171-0b969777884d` Raffles Girls 2021 — Perimeter needs arc length of sector for general angle (53.13 degrees)
- `63e7a2ce-1981-4a3f-8dc0-28f720dbc72c` Raffles Girls 2015 — Pigeonhole-style proof about 9 points and triangle areas; beyond Sec 2.
- `64150593-0fdf-4afb-8ac1-75f86e95f0ed` Kranji 2018 — Part (i) needs standard form with negative powers of 10.
- `6e1c3cd0-5890-43e2-9b65-8796fcf3e306` Temasek Junior College (IP) 2021 — Index laws with letters: cube root of p^a q^b r^c products.
- `72ad0082-4e09-47bc-b1c6-081eaa239a81` Nanyang Girls 2014 — (b) laws of indices with letters, power of algebraic fraction, root of letters
- `8c6492a9-53a3-4671-a098-e8aca3549f00` Bukit Merah 2015 — (b) square root of 49x^4 needs index laws with letters
- `9a7514a5-bb23-4733-9aed-763fcd92cc7e` Catholic High (IP) 2011 — Divide algebraic fractions using laws of indices with letters
- `a0230e73-3fb3-4481-8201-51e797d97d56` Nanyang Girls 2016 — (a) Powers of letters, squared fraction and cube root with letters; indices laws
- `a575e3be-b82d-4f35-a5cf-5e85e4386ec4` RI 2020 — Square root of x^6y^4 terms: laws of indices with letters
- `ad63b1d3-9b1a-4357-83c9-191ce9758e22` Catholic High (IP) 2012 — Laws of indices with letters and fractional index (81y^4)^(1/2)
- `b9b9d53e-5b94-4561-aa08-0ceb6077733d` Anglo Chinese School (Barker Road) 2018 — Arc length and sector area of general angle; cone
- `bae4fb50-d0d5-4aeb-8c7f-9c820a934667` Geylang Methodist 2018 — (a) indices with letters, root of powers, divide fractions
- `bc0eb077-3b4f-4b83-9430-d7760c602621` Temasek Junior College (IP) 2021 — (b) doubling sequence, nth term with n in the index
- `cd67633e-2b38-4f09-bddb-ed5154725009` Presbyterian High 2016 — Laws of indices with letters, n/4n^2 and (-2/q)^3.
- `d0117dcf-fefc-4b67-bb01-bffaeb10b4b8` St Anthony Canossian 2017 — (b)(i) square root of 144m^6/n^2 needs laws of indices with letters.
- `d238759b-534c-46fb-87c5-6b209017158c` Nanyang Girls 2014 — Letter denominator 2a-3; (b) indices with letters, cube root, algebraic fraction division.
- `d50bafdf-edd0-4869-8883-689288695227` Fajar 2021 — 0.72^(2/3) is a fractional index.
- `f46f7b23-bf16-491a-b4a2-cffcf760b3be` RI 2022 — Laws of indices with letters, algebraic fraction division
- `f6aca864-687c-402b-9ecb-16e07094d0bc` Nanyang Girls 2015 — (c) laws of indices with letters and powers of fractions
- `f713d637-c93c-4fe5-b92f-365715ffa307` RI 2020 — Sector area/perimeter for 75 degree angle
- `fcb7961b-92c0-43c9-a730-82f70d215a5b` Bowen 2015 — (a) t^4 divided by t, indices with letters
- `fdd78261-fecc-446b-accb-669766da99cf` RI 2021 — Sector area/arc for 60 degrees, plus Pythagoras

## Sec 2 questions may use the Sec 1 skill list (21 Oct 2026, Adrian)
Adrian: *"for sec 2, they will also share sec 1 skill list > because sec 2 will test sec 1 sometimes"*.
- **Part labels: yes, safe.** A part of a Sec 2 question that tests Sec 1 work may be labelled with a Sec 1 sub-skill. Nothing that serves students or counts twins reads `question_part_subgroups`.
- **Main filing — Adrian said yes (21 Oct 2026), narrowly:** only under topics with no Sec 2 list (Speed, Integers, Real Numbers, Exchange Rate, Interest …), via the filer's S1 tree (bot 847b17c5); 27 Sec 2 questions filed so, served in Sec 1 practice. `twin_queue` takes the main skill from the question's own level, so Sec 2 twin counts do not move. Shared topics keep Sec 2 rows in the S2 tree. Background (why narrow): `practice_pool` serves a question by its sub-skill's tree and never checks the question's level, so a Sec 2 question filed (main, `question_subgroups`) under a Sec 1 sub-skill would be served to Sec 1 students — undoing part of the 15 Oct Sec 1 clean-up — and would enter the Sec 1 twins seeds. Done the narrow way above once Adrian agreed (21 Oct 2026, bot 847b17c5).

**Taught-early check (21 Oct 2026):** of the 67 Sec 1 rows marked `legacy_syllabus` on 15 Oct, only 14 have `ip_syllabus = true`; the other 53 are served to no student (the note above says IP students still get them). And a row moved to another level is never seen by a lower level's students: Sec 2 practice reads only Sec 2 rows (`practice_qlevels`).

## The hidden Sec 1 questions, re-checked (21 Oct 2026)
Adrian, 21 Oct 2026: *"isn't linear equations, algebraic fractions, ratio, mensuration, patterns, integers,
percentages, rate, and algebraic expressions all sec 1 topics? yes, some factorization are in sec 2, for example
factorization of 2 by 2. yes solving inequalities is now in sect 2"*.
- **The 53** Sec 1 rows with `legacy_syllabus` and no `ip_syllabus` (Inequalities 23, Expressions 7, Factorisation 6,
  Linear Equations 4, Fractions 3, Mensuration 2, Ratio 2, one each Expansion, Patterns, Integers, Percentages, Rate,
  Statistics) were read again against this list (one Opus reader; a part is out only if it cannot be done without
  the later step). **5 were genuine Sec 1** (cuboid, statistics, number patterns, a cone with the formula given,
  percentages) → **un-hidden 21 Oct 2026** (backup `_backups/s1-legacy-rows-before-recheck-2026-10-21.json`).
  Sec 1 serves no school rows today (every topic serves our twins), so they come back as twin seeds and filer work.
- **19 have one Sec 2 part** (dividing algebraic fractions, forming/solving an inequality, factorising by grouping, one
  Pythagoras height). They are the part-marks case (`lib/part-syllabus.ts`), but that route is not switched on yet
  (SPEC-PART-SYLLABUS: the two migrations are still open; the bot side was done 9 Oct, bot 684ede17), so they stay hidden.
- **29 are Sec 2 work all through** (inequalities 21, factorisation 2, expressions 2, ratio 2, fractions 1, expansion 1).
  51 of the 53 cannot simply change level: the bank allows one row per school, year, paper, number, level and exam type
  (`idx_questions_dedup`), and that school's own Sec 2 paper already has the same number.
- **Done 21 Oct 2026 (see "Done 21 Oct 2026" below):** the 21 inequality rows → un-hide and file under the Sec 2 Inequalities sub-skills. Sec 2
  serves school rows for Inequalities, so Sec 2 students get them; Sec 1 has no open Inequalities list, so Sec 1 does
  not; `twin_queue` (own-level main skill) keeps them out of both levels' twin counts. The other 8 sit in topics Sec 1
  also teaches, where un-hiding would reach Sec 1 too — they need a "taught at" level separate from the paper's level.

## Done 21 Oct 2026 (Adrian, typed in the session: "yes to all 4")
1. **21 inequality rows on Sec 1 papers** → un-hidden and filed under the Sec 2 Inequalities sub-skills (`source 'level-recheck-2026-10-21'`), parts labelled (20). Checked: all 21 in `practice_pool('S2')`, none in Sec 1 (IP included). One old filing under an open Sec 1 sub-skill removed so it is no Sec 1 twin seed. Backup `_backups/inequality-unhide-before-2026-10-21.json`.
2. **64 Sec 2 rows of Sec 3 work** (Indices, Sets, Standard Form, Circle Properties, Matrices) → level `S3_EM`. No clash with the one-row-per-number rule. The filer then files them in the E Math tree.
3. **35 Sec 3 E Math rows that are A Math** (logarithms, discriminant …) → level `S3_AM`, topics set to the A Math topics a reader chose. 4 more could not move: the same school / year / paper / number already exists at Sec 3 A Math. Backup for 2 and 3: `_backups/level-moves-before-2026-10-21.json`.
4. **Two new sub-skills:** Sec 2 Geometrical Constructions "Perpendicular and angle bisectors" (id 1562); Sec 1 Math In Real World Context "Reading bills, price tables and budgets" (id 1563). The questions set aside as "no skill fits" in those two topics were released to the filer (16 entries).

## Not maths — Sec 1–2 History, Geography, English (21 Oct 2026)

This file is the maths split. The lower-sec humanities and English levels (`S1_HIST`, `S2_HIST`, `S1_GEOG`,
`S2_GEOG`, `S1_EL`, `S2_EL`) and their topic lists live in `SPEC-HUMANITIES.md` §4b and
`docs/EXTRACTION-QUEUE.md` §4f.
