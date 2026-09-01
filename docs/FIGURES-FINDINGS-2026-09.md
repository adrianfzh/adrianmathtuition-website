# Figure-repair findings — batches 6–9 (2026-09-02)

Defects found **while repairing figures** that are NOT figure defects: wrong
stored answers, leaked or scrambled question text, wrong/orphaned images,
and upstream damage classes worth a bank-wide sweep.

They are recorded here because they are the part of this work that cannot be
regenerated — the figures can always be redrawn, but nobody will re-derive
these by accident. Agents found them by cross-checking each recovered figure
against the question's own stated values and its marking scheme.

**Status: all of the below are UNAPPLIED.** Batch 6's figure repairs are applied;
batches 7–9 are drawn and awaiting Adrian's review. Nothing in this file has
been written to the bank.

Working copies of the drawn figures, originals and per-figure dossiers:
`~/Desktop/AdrianMath/figure-repair-2026-09-02/` (not in git — ~244MB of images).

---

## Wrong stored answers
- **ASRJC 2021 JC2 P2 Q4 (b)(iii)** — part-level answer `x = ±√(π/6)` drops the
  `x = 0` root. g increasing ⇒ g(x)=g⁻¹(x) ⟺ 2x·sin(x²)=x, true at 0. Top-level
  answer is right; the `parts` jsonb is not. [batch 6]
- **ACS (Barker Road) 2023 EM_NA P2 Q12** — stored mean/SD `148.375 / 11.4` is
  arithmetically impossible for the source table (12/10/13/5, n=40), which forces
  mean = 135 + 0.25k. Correct: **mean 147.75, SD 10.2**. [batch 7]
- **Bendemeer 2022 EM_NA P2 Q8 (c)** — stored `44.5 m²`; segments give
  36.6655 + 7.9333 = 44.5988 → **44.6**. Looks like truncation, not rounding.
  (a) and (b) check out. [batch 7]
- **Gan Eng Seng 2025 EM P2 Q5** — the given table's y at x=2 reads `−0.42`;
  x²/7 + 2/x − 2 = −0.428571 → **−0.43**. Every other tabulated value and every
  answer checks exactly. [batch 7]
- **Yuying 2024 S2 EOY P1 Q14 (c)(ii)** — stored `4.55 s`; 12x² − 48x − 28 = 0
  gives **4.517 ≈ 4.52 s**. The paper's own table already has (4.5, 1). [batch 7]

## Question text that leaks its own answer
- **ACS (Barker Road) 2023 EM_NA P2 Q12 (a)** — the stored text ends with an
  invented sentence ("The box plot extends from approximately 30 to 75, with
  median around 50") that is not in the paper and answers (a)(i)(a) and (b).
  Delete now the figure is attached. [batch 7]

## Images that should be removed, not repaired
- **ASRJC 2021 JC2 P2 Q4** — both `image_url` entries were the marking scheme's
  answer sketches for (b)(ii) and (b)(iv). **APPLIED in batch 6** (removed).
- **MJC 2017 JC1 P1 Q11** — the flagged stem image duplicates the clean scan
  already attached (unflagged) at part (iii) `c4171edf-…`. The stem needs no
  figure; deleting may beat replacing. Adrian's call. [batch 7]

## Questions still incomplete after their figure is fixed
- **Anglican High 2023 EM P1 Q24** — a second image (the female box plot,
  `b0aa6b01-…jpg`) is not in any batch; parts (a)/(b) are unanswerable without
  it. [batch 6]
- **Nan Chiau 2021 AM P2 Q10 part (a)** — its image `1a48d2a4-…` (unflagged, not
  in any batch) has reverse-side bleed-through across the top. [batch 7]

## Systemic suspicions worth a sweep
- **Cedar Girls 2022 EM P2 Q10** — the stored PNG is far more damaged than the
  identical-size copy in the source DOCX. Suggests a processing pass (binarise/
  clean) ate the ink, which would mean OTHER figures were hit the same way.
  Worth a bank-wide check. [batch 6]

## Watermark traps
- **Pierce 2021 EM_NA MYE P1 Q13** — source PDF footer carries
  `www.KiasuExamPaper.com`, far outside the crop. Do not widen that crop
  downward. [batch 7]
- **Clementi Town 2018 S2 P1 Q12** — genuine `www.KiasuExamPaper.com` stamped
  across the number line; source DOCX carries the same watermarked crop, so no
  clean scan exists. Fixed by redraw. [batch 7]

## Wrong / orphaned figures attached to the wrong question  [batch 7 g2]
- **TJC 2021 JC2 P1 Q7** — the attached image is a "Left road / Right road"
  optimisation diagram from a DIFFERENT paper. Source DOCX confirms Q7 is a
  parametric-curve question with **no figure**. Fix is removal. Two notes: the
  source's only Q7 image is the marking scheme's ANSWER sketch (blue
  construction line, all four coordinates labelled) so do NOT re-extract; and
  the orphaned roads figure probably belongs to another bank question that is
  now missing its diagram — worth re-homing rather than deleting outright.
  (This is the same question as batch 6 #40, released unworked and re-claimed.)
- **Nan Hua 2024 AM P2 Q11** — a machine-drawn composite of both parts'
  diagrams, and **both halves are mislabelled**: (a) puts D between A and E
  though the question says DEA, never draws that secant, and omits chord EC;
  (b) has CB produced meeting the tangent at X, not Y, so the triangles named
  in (b)(i) do not exist in the drawing. The source has two correct figures,
  one per part, and the parts already have their slots. Fix is removal —
  **confirm the two part-level images render before deleting.**
  ⚠ Whatever pass generated this composite may have made the same class of
  error on other circle-geometry redraws. Worth a targeted sweep.

## Defects that live in Adrian's own source  [batch 7 g2]
- **Crescent Girls 2022 EM P1 Q14** — line A→Y has faded to nothing over its top
  third, and that is the exact triangle AYX part (b) asks you to prove congruent.
  The DOCX in Dropbox embeds the same broken picture, so re-extraction can never
  fix it — redraw is the only route.

## Figures attached at the wrong level  [batch 7 g2]
- **Hua Yi 2024 EM_NA P1 Q18** — figure belongs to part (b) but is attached at
  stem level, above a part (a) that has no diagram.
- Stipple shading on that one: no pixel clean should ever run over it.

## Paper-level data flaws (stored answers unaffected)  [batch 7 g7]
- **St Gabriel 2023 EM_NA P1 Q19** — the question over-determines the triangle:
  angles 44/60/76 with BC = 3 cm force PQ = 4.19 cm by the sine rule, but the
  paper states PQ = 3.8 cm; conversely SAS on (3.8, 60°, 3) gives angle P = 48.5°,
  not 44°. Both stored answers follow the intended route and are correct — a
  student would never notice — but the numbers cannot all be true at once.

## Do NOT "clean" these later  [batch 7 g7]
- **CHIJ Katong Convent 2021 EM_NA P1 Q17** — the boxes drawn around the
  P/Q/R/5/x labels are the school's own typesetting, identical in the source PDF.
  Not artefacts.
- **Sembawang 2021 EM_NA P1 Q19** — "square" ACFG is drawn as a rectangle in the
  paper itself. Faithfully reproduced; harmless to the answer.

## Upstream damage classes worth a sweep  [batch 7 g5]
- **Mathpix auto-crop.** TKGS 2023 AM P1 Q9's stored JPEG is byte-identical to
  `word/media/image3.jpeg` in the source DOCX — the SCHOOL's own Mathpix
  conversion sliced the bottoms off the `A(−4,−3)` brackets. The DOCX route is a
  dead end for these; only the school's vector PDF fixes it. **Other
  Mathpix-sourced papers likely carry the same class of crop damage.**

## Ambiguous question wording (not a figure problem)  [batch 7 g5]
- **Bukit View 2024 S3_EM_NA P2 Q12 (d)** — "reduces his air-con consumption to
  10%" reads two ways. As *air-con becomes 10% of the total* → 86% → 373.20 kWh,
  Chua incorrect (the stored answer). As *air-con falls to 10% of its current
  level* → 78.4% → 340.2 kWh and Chua would be **correct**. Will bite a student.

## More NULL-watermark blockers found  [batch 7 g5]
- **GCE 2022 EM P2 Q3** — needs ONLY the field flip; no art change at all.
- **Bukit View 2024 S3_EM_NA P2 Q12** — the art fix is worthless without it.
  Both hunted for a school watermark (205–255 tone stretch); none found.

## Scrambled question text (data bug, renders wrong even with a perfect figure)
- **Kent Ridge 2024 AM P2 Q3** — the diagram caption sits in part (a), while part
  (a)'s real wording ("Find x_b") and part (b)(ii)'s wording are both stranded in
  the stem. [batch 8 g1]

## Sloppy in the original — deliberately NOT "fixed"  [batch 8 g1]
- **Assumption English 2025 S1 P2 Q9** — the frame is drawn at aspect 1.20
  against the stated 26.5/15 = 1.77, so a student counting rows off the picture
  gets ~8 instead of 13. The paper's own drawing.
- **Springfield 2022 S2 P2 Q8** — the left "300 mm" arrow stops ~20px short of
  its dashed line. The paper's own drawing.

## Leads for a later pass (unflagged images noticed in passing)
- **Assumption English 2025 S1 P2 Q9** sibling `ad08929d` (the sticker itself) is
  noticeably fainter and raggeder than the flagged figure. [batch 8 g1]

## The SCHOOL's marking scheme is wrong and the bank is right  [batch 7 g6]
- **Unknown Practice 2017 S2 P1 Q17(b)** — the school's MS totals **2080.575**;
  it says "flat area + pyramid 4 faces" but adds only ONE 60 cm² face. The bank
  stores **2260.58**, which is correct: 240 + 675π − 100 = 2260.575.
  ⚠ **Do NOT "correct" the bank to match the school.** Recorded because the next
  person to compare them will assume the bank is the one that is wrong.

## Figures stored at stem level that belong to a part  [batch 7 g6]
- **DHS 2018 JC2 P1 Q11** and **Orchid Park 2023 EM_NA P2 Q11** both store a
  part-level figure at stem `image_url[0]`. These are `parts[]` relocation
  candidates (cf. the 2026-08-30 placement pass), not repairs.

## "EMPTY STEM" warnings that were false alarms  [batch 7 g6]
- DHS 2018 JC2 Q11, Orchid Park 2023 EM_NA Q11, Unknown Practice 2017 S2 Q17 —
  all three genuinely start at part (a)/(i) in their source papers. The empty
  stem is faithful, NOT the duplicate-row defect. (Kranji 2018 S2 Q13 in batch 6
  was the same.) Verify against the source before assuming the defect.

## Figure contradicted its own markings  [batch 7 g6]
- **Canberra 2023 S1 P1 Q8** — the two lines marked parallel were drawn 4° apart
  (DF 45°, EG 48.8°). Redrawn with true parallelism; verified against x=11, y=147.

## Wrong CONTENT stored (question was unanswerable)  [batch 8 g3]
- **Woodgrove 2022 EM_NA P1 Q10** — the stored image was the (i)–(vi) equation
  TABLE, which the stem already carries as text. The three graphs the student
  must match were never captured, so the question could not be attempted at all.
  Re-extracted graphs (a)/(b)/(c) from source PDF p.8. The table is deliberately
  NOT in the new image — say if it should be.

## Crop sliced across a PAGE BREAK  [batch 8 g3]
- **Geylang Methodist 2021 EM_NA P1 Q23** — the stored crop cut the question
  across pages 14/15: a parabola's left branch halved, the bottom row's two
  answer rules missing entirely, and page furniture (rule fragments, "14"/"134",
  `www.KiasuExamPaper.com`, "Over") baked over the sketches. Fixed by stitching
  both pages at true spacing. **New failure mode — worth looking for elsewhere.**
  Note: the red/blue curves there are the school's own paper, NOT an answer overlay.

## A processing pass made the stored copy WORSE than the source  [batch 8 g3]
- **Gan Eng Seng 2022 AM P2 Q8** — the CD edge (the side the whole question hangs
  on) is merely *faint* in the source DOCX but *broken into dashes* in the stored
  copy. A threshold pass did that. Second instance of this class after Cedar
  Girls 2022 EM P2 Q10 — strengthens the case for a bank-wide check.

## More incomplete part-level answers  [batch 8 g3]
- **Gan Eng Seng 2022 AM P2 Q8 (iv)** — part-level answer gives only θ = 1.34 rad;
  the question-level answer correctly gives both roots, 1.34 AND 0.228 rad
  (P = 60 verified at both). Same shape as ASRJC (b)(iii). **The `parts[].answer`
  field dropping a root is now a repeat pattern — worth a systematic check.**

## More NULL-watermark blockers  [batch 8 g3]
- **Raffles Girls 2013 S2 P1 Q9** — had a REAL tiled RGS watermark; the redraw
  removes it, so it can now be set clean.
- **Pasir Ris Crest 2018 S1 P1 Q5** — no watermark, no art work needed at all;
  the NULL field is the only thing keeping it dark. Its empty stem is also
  faithful to the paper — do not "restore" one.

## A source file that is actually the MARKING SCHEME  [batch 8 g4]
- **`EM S4 PRELIM (NA) 2023 Bukit View (Paper 1 Only).pdf`** — every page carries
  red M1/A1 annotations; there is no clean question-paper copy in it. Bukit View
  2023 EM_NA P1 Q9's figure is unaffected (working sits below the diagram), but
  **any other figure sourced from that file needs an answer-leak check.**

## Wrong source_file recorded  [batch 8 g4]
- **Bukit Merah 2023 S2 P2 Q13** — `source_file` says
  `S2 EOY 2023 Bukit Merah.docx`; the real file is Dropbox
  `EM S2 SA2 2023 Bukit Merah.docx`.

## Missing part-level figures recovered  [batch 8 g4]
- **Ahmad Ibrahim 2021 EM_NA P2 Q13** — part (b)'s bearings diagram was missing
  from the bank entirely. Recovered; must attach to part (b), NOT replace
  `image_url[0]`. Its empty stem is faithful (that paper puts the wording under
  each part's own figure and has no shared stem).

## More NULL-watermark blockers  [batch 8 g4]
- **Peicai 2018 S2 P1 Q6** and **Crescent Girls 2016 S2 P2 Q5** — no watermark on
  either figure (the KiasuExamPaper stamps sit in page footers, outside the
  crops). Both need only the field flip.

## Wrong stored answers  [batch 8 g2]
- **DHS 2024 JC2 P1 Q5(c)** — badly wrong. The school's own marking sketch gives
  max (−2,−2), min (1.5,−1), intercepts (1,0) and (2.5,0), asymptotes x=0, y=3
  AND y=x+3. The bank stores flipped signs, a non-existent intercept (−2.2,0),
  omits (1,0), omits the oblique asymptote, and calls it a sketch of y=|f(x)|.
  Parts (a), (b), (d) are fine. **Also: that paper's running header says DHS 2025,
  not 2024** — the stored `year` may be wrong.
- **EJC 2020 JC2 P1 Q11(b)(i)** — stored solution ends `y = x(1+2R/x)^{-1/2}`;
  the exponent should be `+1/2`. (Q11 genuinely has no stem — not the
  duplicate-row defect.)

## Judgment call: figure contradicts its own question  [batch 8 g2]
- **St Gabriel 2022 EM P2 Q10** — the school drew the circle at ~0.11 m radius
  and off-centre, contradicting both the stated 0.2 m and its own answer π/25.
  The agent drew the STATED geometry rather than mirroring the paper. Same shape
  as batch 6 #39 (CHIJ axis scale) — Adrian rules whether the bank mirrors the
  paper or corrects it. Also redrawn in COLOUR: the question is entirely about
  coloured areas and the stored copy was a greyscale halftone.

## Cleared answer-leak suspect  [batch 8 g2]
- **DHS 2024 JC2 P1 Q5** — the two dashed lines are printed in the genuine
  question paper (f's oblique asymptote y=x+3 and its reflection). Not a leak.
