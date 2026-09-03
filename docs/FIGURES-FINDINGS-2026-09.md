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

## Wrong stored answer  [batch 9 g21]
- **Ahmad Ibrahim 2024 EM_NA P2 Q2** — the tally from the question's own table is
  `0→2, 1→6, 2→3, 3→4, 4→3, 5→2` (sums to 20 matches). The stored answer says
  `2→2`, which sums to only 19. Parts (b) and (c) are correct and unaffected.

## Page-break slicing — now confirmed as a repeat class  [batch 9 g21]
- **Bowen 2022 EM_NA P2 Q13** — stored a page slab with question text, a
  sliced-off part (a) diagram, and NO part (c) diagram at all: it was on the next
  page. Second confirmed instance after Geylang Methodist 2021 EM_NA P1 Q23.
- **Broadrick 2023 EM_NA P2 Q3** — lost the entire bottom label row including the
  `3 cm` that part (b) cannot be answered without.
- **Northbrooks 2021 EM_NA P2 Q3** — stem baked in, bottom of the circle cut off.
- **Ahmad Ibrahim 2024 EM_NA P2 Q2** — stored strip missed the dot diagram
  entirely, capturing only the caption plus part (b)'s text.

## More NULL-watermark blockers  [batch 9 g21]
- **Woodgrove 2025 S2 P1 Q12** — no watermark found on a contrast-stretched scan,
  only speckle. Needs the field flip.

## Stored answer contradicts its own parts[]  [batch 8 g21]
- **Riverside 2023 EM P2 Q7 (a)(iii)** — the stored `answer` and `solution` both
  read **"14.9 cm"** where it should be **14.9 m**; `parts[]` already says "m", so
  the row contradicts itself. The school's own key carries the same typo.
  (Q7's empty stem is faithful — the DOCX opens on part (a).)

## Figure out of scale in the paper itself  [batch 8 g21]
- **Crescent Girls 2016 S2 P2 Q5, Figure 2** — the school's frustum drawing is
  stretched ~1.5x horizontally against its own vertical scale, and the hemisphere
  is drawn at 0.66 of the base diameter instead of the true 0.40. The redraw
  corrects both to the question's own numbers (large cone 25.5, removed cone 5.1,
  top radius 1.5, hemisphere radius 3). NULL watermark — a redraw carries no
  school mark, so it can be set clean.

## Figures that are SUPPOSED to be empty — never "restore" them  [batch 8 g20]
- **Tanjong Katong 2022 S1 P2 Q4** — a plotting grid with three given points;
  part (a) asks the STUDENT to plot and draw the line. Byte-identical to the DOCX
  artwork and complete. A later pass must not draw the line on.
  (Same class: Naval Base 2022 AM P2 Q7, Chung Cheng Main 2022 AM P1 Q11,
  Queensway 2024 S2 P2 Q11, Gan Eng Seng 2025 EM P2 Q5 — all blank by design.)

## Scan skew that contradicts the question  [batch 8 g20]
- **Northbrooks 2022 S3_EM_NA P2 Q6** — the art was undamaged but the scan sat
  0.75 deg off level, so the constant-speed plateau visibly RISES, contradicting
  part (a)'s own answer. Deskewed; no strokes redrawn. New failure class: skew
  can make a correct figure state something false.

## A dirty scan produced a FALSE finding — then self-corrected  [batch 8 g20]
- **West Spring 2022 EM P2 Q2** — an agent first read the ogives off the dirty
  stored crop and concluded the stored IQR was wrong. After sourcing an
  independent CamScanner scan from Dropbox, all five stored answers verify
  (Maths median 55; Science Q1 48, Q3 67 -> IQR 19 vs stored 18, in tolerance).
  **The question was never broken, only unreadable.** Worth remembering before
  trusting any "the stored answer is wrong" claim that came off a bad scan.

## Not-to-scale warnings (school's own drawing, left untouched)  [batch 8 g20]
- **Beatty 2021 EM_NA P1 Q12** — angle at O drawn ~66 deg and the arc bulge ~60%
  too deep, so the shaded segment looks far bigger than the true 3.98 cm2.

## ⚠ PDFs that over-paint their own text with white patches  [batch 9 g23]
- **Geylang Methodist 2021 EM_NA P1 Q13** — the source PDF draws the labels P, Q
  and the "14" on a dimension arrow as REAL DARK TEXT, then over-paints each with
  a white glyph-sized image patch. Poppler AND pdftocairo both render them
  invisible, while `pdftotext` still extracts them. The agent restored them at
  the exact baselines and point size recorded in the PDF's own text operators.
  **Any other figure re-extracted from this Geylang 2021 PDF may be silently
  missing labels the same way — check the text layer against the render.** This
  may also affect other papers from the same source/scanner pipeline.

## Missing part-level figure + a solution typo  [batch 9 g23]
- **CHIJ Katong Convent 2021 EM_NA P2 Q13** — the stored circle diagram had B and
  P sliced off, AND part (b)'s P/Q/R/X triangle was missing from the question
  entirely (recovered from source p.42). Without it (b)(i)/(b)(ii) are
  unanswerable. Separately the stored SOLUTION for (b)(ii) ends at 55.6 deg where
  arctan(54/32) = 59.4 deg — the stored ANSWER (59.4) is right, the solution's
  last line is a typo.

## Don't "improve" these  [batch 9 g23]
- **Hua Yi 2024 S3_EM P1 Q9** — the grey line colour is the school's own style,
  not fading. Do not darken it. (Also carries 13 stray blue anchor dots from the
  school's drawing tool — theirs, not damage.)

## ⚠⚠ THE BIG ONE: 3,098 questions are dark on watermark status alone
Measured 2026-09-02 with the exact `figureServable()` predicate
(`!has_image || figure_url || image_watermark_status = 'clean'`):

| gated because | questions |
|---|---|
| `image_watermark_status IS NULL` | **3,009** |
| status = `'no_image'` but the question HAS an image | 88 |
| status = `'flagged'` | 1 |
| **total held out of serving by this field** | **3,098** |

These are questions with `has_image = true` and no `figure_url`. **This is roughly
five times the entire figure_flags queue** (569) and has nothing to do with figure
quality — the watermark backfill simply never covered them, and the gate fails
closed. Every batch in this run has hit it: a repaired figure whose flag closes
still does not reach a student.

The 88 rows marked `'no_image'` while carrying an `image_url` are simply
mislabelled (spotted on PJC 2018 JC1 MY P1 Q7).

**Worth its own project, and probably a bigger unlock than the flag queue.** It
needs a watermark scan pass over those 3,009, not eyeball review — most will be
clean, and the ones that are not are exactly the school-branded scans that must
never reach a student.

## Whole figures missing from a question  [batch 9 g20]
- **DHS 2021 JC1 MY P1 Q10** — the question carries only Fig. 1, but parts (ii)
  and (iii) explicitly say "see Fig. 2" / "see Fig. 3". **6 of 12 marks are
  unanswerable.** Both recovered from the source DOCX. These are ADDITIONS —
  the existing image is Fig. 1 and is defect-free, so `image_url` must become
  three figures in order. Do NOT repoint `image_url[0]`.
- (Running tally of questions found unanswerable as served: Kranji 2024 EM P2 Q10,
  Ahmad Ibrahim 2021 EM_NA P2 Q13, Woodgrove 2022 EM_NA P1 Q10, Bendemeer 2022
  EM_NA P2 Q8, Bowen 2022 EM_NA P2 Q13, Broadrick 2023 EM_NA P2 Q3, CHIJ Katong
  Convent 2021 EM_NA P2 Q13, DHS 2021 JC1 P1 Q10.)

## A watermark can be deleted at the PDF content-stream level  [batch 9 g20]
- **Raffles Girls 2015 S1 SA2 P1 Q9** — the tiled RGS watermark lives in an
  `/Artifact /Watermark` block in the PDF content stream. Deleting that block and
  re-rendering gives clean vector art at any dpi — far better than pixel-clipping
  the raster. Worth trying first on any RGS/branded PDF.
- **Dunearn 2014 S1 SA1 P2 Q8** — the marking scheme (p.23) carries the same graph
  with the ANSWER CONSTRUCTION drawn on it. Never source that figure from there.

## Adrian's own handwriting leaked into a served figure  [batch 9 g25]
- **Marsiling 2023 AM P1 Q11** — the serving image carried ORANGE HANDWRITTEN
  annotation reading `−π + c = a`, which is verbatim the answer to part (a)(ii)
  ("express a in terms of c"). The graph beneath is the genuine question diagram,
  so the fix was to colour-separate the orange, whiten it while protecting every
  black pixel, and repaint the 18-row notch the ink had cut out of the y-axis.
  Verified against the school's clean paper (Dropbox, p.18).
- **Route of contamination:** the orange is baked into `image3.jpeg` inside
  ADRIAN'S OWN annotated compilation DOCX
  (`/1 ONLINE LESSONS/3 Exam Papers/AM S4/AM Prelim 2023/AM PRELIM 2023 Marsiling.docx`).
  Figures harvested from his annotated compilations can carry his answers into
  the bank. The other 7 figures in that DOCX were checked and are clean.

### How big is this class? Measured, and the answer is "not by colour"
Two detector passes over the live bank, both **100% false positive**:
1. *Any saturated ink* — 13/60 sampled figures (21.7%) flagged. On inspection all
   13 are legitimate school-authored colour: blue vector line art, coloured bar
   charts, red curves, product photos, a green-field vector diagram.
2. *Pen signature* (sparse warm ink on an otherwise greyscale scan) — 2/200
   (1.0%). Both false: a drive-in-cinema photograph, and a chart's own dark-red
   data markers.

**So: no evidence of a widespread problem — zero confirmed annotations in 200
sampled figures.** Colour is the wrong discriminator; schools print in colour
constantly. If this is to be sized properly, do it **by source**: enumerate the
questions whose `source_file` is one of Adrian's annotated compilation DOCXs and
check only those. That is a targeted check, not a bank-wide sweep.

## Stem text defects that make a question unanswerable  [batch 10 g2]
- **ACS (Barker Road) 2021 EM_NA P2 Q10** — the bank stem OMITS the sentence
  "It can be taken that it will cost $3 per 1GB over the given data plan and 20
  cents per minute for additional talk time" and the 2-year contract note.
  Without them the question cannot be answered at all. The agent kept both
  sentences inside the re-extracted image as a stopgap; if the STEM is fixed
  instead, re-crop the image to end at "Taken from Singtel website."
  Separately the stem says "would not send more than 100 SMS" where the paper
  says "would not use any SMS" — that invents an 80-SMS shortfall on VIVIFI Lite
  with no rate to price it.

## The dossier "source NOT FOUND on disk" line is unreliable for batches 10+
Two of this group's sources were in `~/Desktop/AdrianMath/papers/processed/` all
along — one under a different capitalisation (`EM Prelim 2022 CHIJ St Nicholas.docx`,
lowercase "Prelim"). The disk index for batches 10+ was seeded from batches 7-9
only (69 papers), so it under-reports. Agents are told not to trust it.

## NEW defect class: the stored "figure" is a different QUESTION  [batch 9 g24]
- **Greendale 2022 EM_NA P1 Q20(b)** — the stored image was a screenshot of the
  NEXT question's text (Q21). The parallelogram ABCD (158 deg at A, (3x+5) deg at
  C) was never captured at all. Recovered at 600 dpi; confirms x = 51.
  Distinct from "wrong content" (a table instead of graphs) — here the crop
  landed on an entirely different question.

## Duplicate figures: the student sees every diagram twice  [batch 9 g24]
- **Anglican High 2024 AM P1 Q11** — `image_url[0]` is a composite that duplicates
  the school's own three part-level figures (all three fetched and verified
  correct). Adrian may prefer to DROP `image_url[0]` outright rather than repair
  it. The composite also had panel (c)'s curve labels SWAPPED (3y = x on the
  cubic) — i.e. the duplicate was also wrong. `image_watermark_status` is
  `no_image`, so the question fails the serving gate regardless of the art.

## Missing figure  [batch 9 g24]
- **Hua Yi 2020 EM_NA P2 Q13** — the box-and-whisker plot for parts (e)/(f) was
  missing entirely; the question carried only the CF graph, so (e) and (f) were
  unanswerable. Recovered from source p.14. ADDITION, not a swap.

## The one MEDIUM-confidence result so far  [batch 9 g24]
- **Ahmad Ibrahim 2025 S1 P2 Q12(b)** — an LTA fare table screenshotted,
  photocopied, then scanned to 1-bit CCITT: every fare digit is dither speckle
  and four cleaning approaches failed. Retyped as vector. Every number the
  QUESTION uses is confirmed three ways (stored answers; early-train column =
  card − 50 throughout; Express = Trunk Card + 30 throughout). **But the six
  "Cash" cells (85/95/95/95/115/115) are a best pixel-level reading, not
  certain** — nothing in the question uses them. The Tamil/Chinese/Malay heading
  lines are unreadable and were left out rather than guessed.

## ⚠ A stored answer that is a FABRICATED PLACEHOLDER  [batch 10 g3]
- **Broadrick 2024 EM P1 Q16(a)** — the stored answer reads
  `"e.g. y = x^2 - 2x - 8, min (1,-9)"`. The **"e.g." is the tell**: it is a
  made-up example, not this paper's answer. The question's own sibling image for
  part (b) clearly shows roots -4 and 1.5, giving `y = x^2 + 2.5x - 6` and
  minimum `(-1.25, -7.5625)`. Stem is also empty.
  **This is a different failure from "wrong answer" — it is an invented one.**
  Worth grepping `questions.answer` for `e.g.` and similar placeholder markers
  across the bank; if a generation pass ever filled blanks with examples, there
  will be more.

## Threshold damage — now THREE confirmed, plus a whole paper at risk  [batch 10 g3]
- **NJC 2018 JC2 P1 Q4** — the bucket copy is measurably worse than the source:
  hard-thresholded at grey ~160, leaving ~100 px above 160 where the DOCX artwork
  has ~30,000. Third instance after Cedar Girls 2022 EM P2 Q10 and Gan Eng Seng
  2022 AM P2 Q8.
- **Canberra 2024 EM P1 Q23** — the entire speed-time graph AND both axes were
  missing; only dashed guides and labels survived. The school draws axes at grey
  ~223, so the conversion's threshold erased them outright.
  ⚠ **Other figures from this Canberra 2024 paper are likely damaged identically.**

## Unflagged siblings with the same defect  [batch 10 g3]
- **Fuhua 2021 EM_NA P2 Q10 part (a)** (`7dab03a0…`, not flagged) has the same
  baked-in-text/truncation defect as the flagged part (b) image; re-crop from p.36
  of the same source PDF.

## Don't crop a PDF by page guess  [batch 10 g3]
- **Canberra 2024 AM P2** holds the full MARKING SCHEME on pp.43-76 (Q7's worked
  solution with M1/A1 is on p.68). The question page is p.34. Never page-guess in
  a file like this.

## SECOND annotation case — and it is BLUE, not orange  [batch 10 g6]
- **St Patrick 2021 AM P2 Q5** — the stored photocopy carries **blue pen
  annotations**: crosses inked over P and Q, ticks at both roots, and a vertical
  strip drawn from R down to the curve, which hints at the integration method.
  The pen crosses sit ON the curve, so erasing would hole the line art — the
  agent redrew instead, at the scan's own measured scales.

### This corrects the earlier sizing note above
The "annotation" class is **not orange-specific**, so the warm-hue detector was
looking for the wrong thing, and the any-colour detector drowns in legitimate
school colour. Two confirmed cases now (Marsiling orange, St Patrick blue), both
found by **agents reading the figure**, not by any pixel test — roughly 2 in the
~200 figures agents have actually examined.

Conclusion stands but for a better reason: **do not try to detect these by
colour.** Either check by source (Adrian's annotated compilation DOCXs) or accept
that a human/agent reading the figure is the only reliable detector. Do NOT
report "no evidence of a problem" on the strength of the pixel sweeps — they
missed both known cases.

## Crop removed most of the question's data  [batch 10 g6]
- **Greendale 2022 EM_NA P2 Q10** — the stored crop sliced off all nine country
  names AND the entire second chart (the Singapore household pie), leaving parts
  (a), (b) and (c)(ii) unanswerable. Both charts re-extracted in colour.
  ⚠ **Colour is content here** — the pie legend maps slices by colour, so this
  must never be greyscaled. The replacement is portrait, not landscape.

## Answer-wording inconsistency  [batch 10 g6]
- **Anglican High 2022 EM P2 Q14 (c)** — the stored answer text says petrol is
  about $160 while its own total implies about $116.

## THIRD annotation case — and it was INVISIBLE in the stored image  [batch 10 g4]
- **Seng Kang 2020 EM_NA P1 Q8** — the stored image is MONOCHROME, so somebody's
  blue ballpoint working was baked in as plain black and looks like part of the
  printed figure. The agent only found it by colour-keying the SOURCE scan
  (1109 blue px vs 3769 black px). What the pen adds is a "60" written inside the
  triangle plus angle arcs at the common vertex — **exactly the reasoning the
  4-mark question asks for**. Even the "equal-side tick marks" are pen; the
  printed figure carries no labels at all. A plain re-extract would not fix it
  (the pen crosses the printed lines), so the outline was redrawn.

### FINAL correction to the sizing question
Three confirmed cases now — Marsiling (orange), St Patrick (blue), Seng Kang
(blue, **rendered mono in the bank**). The third kills the detector idea outright:
**if the stored image is greyscale, no colour test on the bank can ever find the
annotation**, because the pen is black by the time it reaches us. The only
reliable detectors are (a) an agent/human reading the figure and asking "does
this ink answer the question?", or (b) colour-keying the ORIGINAL source scan,
which means going paper by paper.
My two pixel sweeps over the bank found 0 of these 3. Treat their "no evidence of
a problem" result as **uninformative**, not reassuring.

## More paper-level drawing errors corrected  [batch 10 g4]
- **North Vista 2022 AM P1 Q12** — the school drew the curve's y-intercept R at
  about y = 5.8 instead of 7 (tangent and rest of curve accurate). Redraw puts R
  at the true value, so the shaded region is taller than in the scan.
- **Seng Kang 2020 EM_NA P1 Q8** — the school drew the two polygon stubs at ~135
  deg instead of 150; the redraw is correct, so one runs horizontally and one
  vertically.

## Another unflagged sibling with the same defect  [batch 10 g4]
- **Fuhua 2021 EM_NA P2 Q10 part (b)** (`55286854-…png`) — identical
  baked-in-and-truncated-text defect; re-extract from p.36 of the Fuhua PDF.
  (Part (a)'s sibling was already noted from batch 10 g3 — so BOTH siblings of
  that question need it.)

## Colour that is the SCHOOL's styling, not pen  [batch 12 g42]
- **St Joseph Institute 2024 EM P1 Q22** — the dot-plot dots are GREEN, but that
  is the school's own marker styling, not annotation and not a leak. Do not run a
  mono clean over it. (Blob count confirms 25 dots and every stored statistic.)
  A useful counter-example to the pen-annotation hunt: colour alone means nothing.

## Answer-carrying sibling files to avoid  [batch 12 g42]
- **Bukit Batok 2024 AM P2** — `AM PRELIM 2024 Bukit Batok.pdf` is the
  WITH-ANSWERS copy carrying the marking scheme. The clean one is
  `AM PRELIM 2024 Bukit Batok (Without Answers).pdf`. Never re-extract from the
  former.

## Judgment call: the scan is not the shape the question says it is  [batch 12 g42]
- **Cedar Girls 2021 EM P1 Q11** — the question states a rhombus; the scan's sides
  measure 410/402/416/398 px, a 4% spread, and the axes sit ~0.5 deg off
  perpendicular. The redraw makes it exact, which moved A and D right by 10-14 px.
  Flag if the scan's proportions should be kept instead. The redraw also
  reproduces the scan's x-axis running off the canvas edge with no arrowhead
  rather than inventing one.

## Empty top-level answer despite every part having one  [batch 12 g44]
- **Beatty 2025 S3_AM P1 Q13** — `questions.answer` is empty while each entry in
  `parts[]` carries its answer. (Also NULL watermark with no watermark present,
  so the field flip is what actually unblocks it.)

## Not-to-scale correction worth Adrian's eye  [batch 12 g44]
- **Bukit Merah 2025 EM P1 Q23** — the scan draws arc DE at roughly 40 deg when
  the geometry gives 20 deg. The redraw computes the configuration exactly from
  the stem (angle BAG = 40, AB = BG, OG perpendicular to the tangent) and
  reproduces all three stored answers — but D and E now sit visibly closer
  together than in the paper.

## Do NOT "repair" this  [batch 13 g42]
- **VJC 2017 JC2 P1 Q2** — the `???` in the August water row of the utility bill
  is DELIBERATE: part (ii) exists precisely because that figure is unreadable on
  the bill. Anyone tidying it would delete the question.

## Stale flag paths may mean "already fixed"  [batch 13 g42]
- Several flags in the queue point at image paths no longer referenced, and in at
  least three cases (VJC 2017 JC2 Q2, Yishun 2024 EM_NA P1 Q16, CHIJ St Nicholas
  2023 EM P2 Q9) the CURRENT image is already a good replacement — the flag is
  simply stale. A cheap pre-pass over the remaining queue could identify these
  and close them without agent time. Note the flag must still be closed by its
  ORIGINAL path or the question stays gated.

## More NULL-watermark clears  [batch 13 g42]
- **TPJC 2017 JC2 P1 Q9** and **VJC 2017 JC2 P1 Q2** — both checked (faint-grey
  band isolation on one, coloured-pixel mapping on the other, which traced glyph
  outlines exactly, i.e. chroma fringing not ink). Neither carries a watermark.

## Do NOT bleed-clean these  [batch 12 g43]
- **Pasir Ris 2017 S1 P1 Q18** — the grey staircase IS the flower bed. Part (d)
  is unanswerable without it. A blanket clean would delete the question.

## A label that is a pasted BITMAP inside the PDF  [batch 12 g43]
- **PJC 2017 JC2 P1 Q8** — the "y = cos(x^2)" label is an 86x31-px bitmap pasted
  into the source PDF, so it blows up blocky at any dpi and re-extraction cannot
  fix it. (The paper's freehand curve is also not a real plot.) Redrawn at the
  paper's measured geometry with the true cos(x^2); the redraw is flatter near
  x = 0 because cos(x^2) genuinely has zero gradient there.

## Stem text corrected by recovering the figure  [batch 12 g43]
- **Outram 2025 S2 P2 Q2** — the bank stem says "and base side 17 cm", but the
  source stem says only "vertical height VO = 14 cm". The 17 cm was a FIGURE
  LABEL that the old crop had sliced off, and someone had folded it into the
  stem. With the label restored, figure and stem agree again.

## Watermark tally from this group  [batch 12 g43]
- Six of seven were NULL. **Raffles Girls 2015 S2 P1 Q8 genuinely carried the
  tiled RGS watermark** (removed by redraw). The other five — PJC 2017 JC2 Q8,
  Outram 2025 S2 Q2, Pasir Ris 2017 S1 Q18, NJC 2017 JC1 Q5, Maris Stella 2016
  S3_AM Q11 — carry no watermark at all and can be set clean.

## A "source" that is a marking scheme AND clips the figure  [batch 13 g47]
- **Anglican High 2025 EM Prelim P2 Q12** — vertex B was missing from the stored
  figure entirely, and every part of the question is about B. It CANNOT be fixed
  by re-extraction: the only source (Dropbox `EM PRELIM 2025 Anglican High.pdf`
  and its byte-identical `(Post)` copy) is a MARKING-SCHEME document, and on p.37
  the figure overflows the page bottom and is clipped there — nothing continues
  on p.38. Its pp.38-39 hold the full worked scheme; **never crop from those.**
  Redrawn from the stated bearings (B at 220 deg from A, AB = 60; C at 125,
  AC = 50).

## Duplicate-row defect + colliding part labels  [batch 13 g47]
- **Catholic High 2024 EM Prelim P2 Q7** — the stem is empty with part (a)'s text
  doing the stem's job (looks like the genuine duplicate-row defect), AND part
  (b)(iii)'s two sub-questions are stored labelled `(a)`/`(b)`, colliding with the
  real parts (a)/(b).

## Dossier source-lookup bug: apostrophes  [batch 13 g47]
- **Nanyang Girls 2015 S1 SA2 P2 Q10** — the source IS on disk; the lookup failed
  only because `questions.source_file` drops the apostrophe. Real filename:
  `EM S1 SA2 2015 Nanyang Girls'.docx`. Any future index match should normalise
  punctuation, not just case.

## Captions the stem refers to but the images lack  [batch 13 g47]
- **RI 2014 S2 SA2 P1 Q14** — the stem names "Figure 1" and "Figure 2", but
  neither stored image carries its caption. Its sibling `image_url[1]` (Figure 2,
  the cross-section) is the same poor photocopy and was not in any batch — it
  deserves the same redraw.

## ⚠ FOURTH ANSWER LEAK — a fully worked possibility diagram  [batch 13 g44]
- **Presbyterian High 2025 EM P1 Q22** — the stored image is the possibility
  diagram **fully filled in**, i.e. the whole of part (a) [2 marks]. At 400 dpi
  the 11 filled cells are in a heavier bold face than the 5 the paper
  pre-printed, which is how it was caught. This one is PRINTED, not pen — so it
  is a different mechanism from the three annotation cases (Marsiling, St
  Patrick, Seng Kang) and would not be caught by looking for handwriting either.
- **Stored TWICE**: stem `image_url[0]` AND `parts[0](a).image_url_after`
  (`f5df41ce…`). A fix must cover both references or the leak survives.
- Deleting both leaves part (a) unanswerable, so the agent built a de-answered
  version at `fig13/out/fig-38-blank-candidate.png` — offered as an ADDITION for
  Adrian to rule on, not a swap.

**Running leak tally: 4** — three pen annotations (orange / blue / blue-baked-mono)
and one printed worked answer. All four found by an agent READING the figure and
asking "does this ink answer the question?". No pixel test found any of them.

## More "do not fix this"  [batch 13 g44]
- **SRJC 2017 JC2 P1 Q9** — the light-blue DOTTED lines are content: they are the
  construction lines the two theta arcs are measured against, not a Word canvas
  border. A blanket clean must not strip them.
- **Bartley 2023 S1 P1 Q8** — deliberately not to scale (drawn ~68/69 deg against
  a printed 77/63).
- **Manjusri 2017 S2 P1 Q11** — the axes have UNEQUAL scales (x = 2 squares/unit,
  y = 1 square/unit). That is why the line looks like gradient 1/2 while part
  (b)'s stored answer of 1 is correct. Preserved deliberately.

## Paper error reproduced faithfully  [batch 13 g44]
- **Dunman 2024 EM P1 Q9** — the stem-12 girls' leaves are printed `5 4 8 9`, out
  of order. Reproduced exactly as printed; changes no answer.

## Two figures on one question share a DISTORTED axis — never "fix" one alone  [batch 11 g60]
- **Nan Chiau 2024 EM P1 Q23** — the blank Distance/Time answer grid has a time
  axis that is deliberately not to scale (5 sits at 17% of the way to 24, not
  21%), and the question's OTHER image (the speed-time graph) uses the SAME
  distorted spacing to within 1%. Regularising either one alone would break the
  pairing the student reads across. Both stored answers verified (v = 30 m/s,
  24 m/s = 86.4 km/h).

## A colour figure correctly judged NOT a leak  [batch 11 g60]
- **Tanjong Katong Girls 2023 AM P2 Q10** — red curve, blue line, grey fill, i.e.
  the usual leak tell. Judged clean on three grounds: the baked-in question
  number and page rule prove it was cropped from the QUESTION page; the shading
  only restates the region the stem already describes in words; and R is labelled
  by letter alone, so its coordinates are not given away. Stored answer
  (7pi/2 = 11.0) independently confirmed.

## ⚠ Stored answer contradicts its own figure — orientation flipped  [batch 11 g61]
- **Geylang Methodist 2024 EM P1 Q27** — the figure puts **42 cm horizontally and
  30 cm vertically**, so the centre is (21, 15) and part (b) should read
  A(14,4) B(14,26) C(28,26) D(28,4). The stored set A(8,10) B(8,32) C(22,32)
  D(22,10) is centred on (15, 21) — i.e. a PORTRAIT 30x42 sheet — and its y = 32
  falls off the top of the paper as drawn. Part (c) is correct.
  The figure itself is fine (its odd solid-then-dashed axes and dotted
  continuations are deliberate original drawing; the stem says "not drawn to
  scale"). `image_watermark_status` is `no_image` despite an image being present.
- Its stem carries a stale inline `{{IMG:…c42a77b1….jpg}}` marker naming a file
  that is neither in `image_url` nor on disk — a dead marker, not a lost figure.

## Judgment call: a gap that is in the printed paper  [batch 11 g61]
- **NYJC 2025 JC1 P1 Q10** — an 81-px chunk of the cone's rim ellipse is missing
  **in the printed paper itself** (verified against the source scan). The agent
  filled the 18.7 deg gap by fitting the rim to its 765 surviving boundary points
  (mean residual 0.75 px; the detached arc beyond the gap lies on the same fit,
  which makes it measurement rather than invention). Adrian can reject the fill
  independently of the crop and stray-mark removal.
  A re-extract would be a DOWNGRADE here: the source PDF's page bitmap is 151 ppi,
  giving ~400x350 px against the stored 949x763. That PDF also carries a
  KiasuExamPaper watermark and holds the full marking scheme on pp.8-23.

## Content gap: options never extracted  [batch 13 g60]
- **Assumption English 2024 S3_EM_NA P1 Q20 (d)** — the part says "Circle your
  answer in the given options" but **no options were extracted**, so a student
  cannot answer (d) as stored. Not a figure problem.

## Stem-glue ingestion quirk (nothing lost)  [batch 13 g60]
- **CJC 2023 JC2 Prelim P1 Q2** — the paper's stem sentence ("The diagram below
  shows a sketch of the curve…") was glued onto the FRONT of part (a) instead of
  stored as the stem. Content intact, structure wrong. Distinct from the
  duplicate-row defect.

## More "as printed — do not fix"  [batch 13 g60]
- **TPJC 2017 JC2 Prelim P2 Q4** — the thick highlighted rectangle above the curve
  at its right edge is the SCHOOL's artwork, not extraction damage. Grey
  rectangle fills there are content too.
- **Bendemeer 2021 S3_EM_NA SA2 P2 Q3** — pentagons deliberately not to scale
  (drawn factor ~1.93 against a stated 2.5) though genuinely similar to each other.

## Another whole figure missing from a question  [batch 13 g61]
- **St Gabriel 2022 EM P1 Q21** — part (c) refers to a box-and-whisker plot for
  School B that was **missing from the bank entirely** (the question carried only
  one image). Recovered from the source DOCX and redrawn: min 0.5, Q1 2.5,
  median 3.0, Q3 4.0, max 6.0 — median $3.00 and UQ $4.00 match the stored
  answer. **ADDITION alongside fig-45, not a swap.**
  (Dossier said "source not on disk" only because the file is named
  `EM Prelim 2022 St Gabriels.docx` — trailing "s". Second filename-normalisation
  miss after the Nanyang Girls' apostrophe.)

## Skewed gridlines that change a read-off value  [batch 13 g61]
- **Hua Yi 2024 EM P2 Q10** — the photocopy's gridlines are skewed enough that
  Stella's brisk-walking bar reads ~6.3 km/h when it is 6.5 — and part (a) depends
  on that value. Measuring each bar against its OWN local gridlines cancels the
  skew (6.487 / 8.017 / 6.487 / 9.504), independently confirmed by the question's
  own arithmetic. Same family as the Northbrooks skew case: a scan can make a
  correct figure state something false.

## Inherited redraws were re-verified, not trusted  [batch 13 g61]
- #39 and #45 were rendered by agents that were later killed. This agent
  re-measured the scan itself and overlaid the redraw before adopting either
  (least-squares intercept 2.007 on #39; curve-on-curve match along the whole
  length on #45). Worth repeating for any other output inherited from a dead run.

## ⚠⚠ FIFTH LEAK CLASS: figures cropped from MARKED STUDENT SCRIPTS  [batch 12 g60]
Two figures in one group turned out to be **de-annotated marked scripts** — a
student's working was erased from the scan, imperfectly:
- **Catholic High 2014 S2 P1 Q8** — the served image still carried a **stroke along
  y = 2, which is half the answer to part (i)**, plus a white erasure smear along
  y = −2 that had wiped the grid, red-pen specks, and a rubbed-off minus on the
  "−2" label. Redrawn. **The Dropbox source PDF (p.6) is the student's answered
  paper — never re-extract from it.**
- **CHIJ St Joseph's Convent 2024 S3_EM P1 Q11** — side BC was broken by a 90 px
  gap exactly where the student's pencilled "59" had been erased, and two
  fragments of the student's own 121° arc were still visible at B.

**This is a fifth, distinct contamination route**, after pen annotation (x3),
printed worked answers, and marking-scheme art. It also explains damage we might
otherwise blame on scanning: the erasure destroys the printed artwork underneath.
**Worth a targeted sweep of figures sourced from "(Orig)" photo scans.**
(Related, already recorded: the Dunman PDFs are scans of a marked script, so the
handwritten answers on them are the student's and are wrong.)

## A paper whose own part is unsound  [batch 12 g60]
- **Peicai 2022 AM P2 Q9(iii)** — "A lies between B and D" forces θ ≤ 28.74°, but
  48cosθ − 14sinθ bottoms out at 35.36 and never reaches 30, so the stored answer
  θ = 36.9° lies OUTSIDE the legal range. The part as printed has no valid answer.
- Same question: the source DOCX writes part (i)'s result with a **plus**
  (`48cosθ + 14sinθ`); **our stored stem's minus is the correct one** — do not
  "correct" the bank to match the school here.

## Empty stem that genuinely breaks a question  [batch 12 g60]
- **Christ Church 2022 S3_EM P2 Q6** — the art is fine; the fault is the empty
  stem. The paper reads "A, B, C and D are four points of a playground on level
  ground with **C due east of B**. AB = 22.8 m, BD = 20 m, BC = 27.1 m,
  CD = 18 m, angle ADB = 52°." Without "C due east of B", part (a)(iii) is
  unanswerable. All four stored answers recompute correctly once restored.

## My own error, caught by an agent
I carried a stalled agent's hint about ITS figures #6/#7 ("rocket + cross-section,
same question") into a REGROUPED brief where those numbers meant different
figures. The agent checked and reported the hint was wrong — different papers,
different questions. Hints tied to figure numbers do not survive regrouping.

## Adrian's redraw round (2026-09-02, after reviewing the full sheet)
- **CHIJ Katong Convent 2021 EM_NA P1 Q17** — Adrian overruled the earlier
  "the boxes are the school's typesetting, leave them" note and asked for the
  labels without boxes. Redrawn accordingly; the redraw also squares up the
  right-angle mark at Q and re-centres the exterior-angle arc on R (the scan's
  arc was a drawing-tool artefact, off-centre with a drifting radius).
- **Fuhua 2021 EM_NA P2 Q10(a)** — the school's drawing **contradicts its own
  printed data**: AH drawn at 44.8 deg from North against a stated 036, and at
  0.71 x AB against a true 3.4/7.2 = 0.47 x AB, plus a stray arc running off the
  crop. Redrawn from the stated data; BH = 5.88 km and bearing of A from H =
  216.00 deg both reproduce the stored answers exactly.

## ⚠ An unflagged figure with a known defect, in NO batch
- **Fuhua 2021 EM_NA P2 Q10 part (b)** (`55286854-2795-48fe-866f-eefb81cd2f78.png`,
  the sector OACB) — same baked-in-and-truncated stem text as part (a), confirmed
  by opening it. **No `results.jsonl` line anywhere treats it**; it was never
  flagged, so it was never in the queue. It still needs a pass.
  (Same shape as the other unflagged siblings recorded above — RI 2014 Figure 2,
  Nan Chiau 2021 part (a), Assumption English 2025 sibling `ad08929d`,
  CHIJ St Nicholas Q9's inverted pyramid.)

---

# Watermark-cleaning pass (2026-09-03) — defects surfaced while removing stamps

These came out of the 19-figure watermark removal. They are question-bank defects,
independent of the watermark, and none of them has been written to the database.

## A question that cannot be answered from its own figure
- **Raffles Girls 2015 S1 P1 Q1** (`9cd61354…`, key `4976966e…`) — **the question needs
  TWO number lines and the bank holds ONE.** Stored answer (b)(i) is "dots at −2, −1, 0,
  1 and 2", but the stored image only reaches **1.5**: a student cannot mark 2 on it. The
  paper has a second, separate number line for (b)(i) running −3.5 to 3.5 with ticks at
  every integer −3..3. It is `word/media/image1.png` (958×92) in the source DOCX, was
  **never given a bucket key**, and this row's `image_url` is `[]` — so the row references
  no image at all while still serving a question that depends on one.
  A cleaned copy of the second line is held at
  `wmfix/out/9cd61354-EXTRA-bi-numberline.png` (1511×154, 300 dpi). **Not written
  anywhere — needs Adrian's call on whether (b)(i) should be illustrated.**

## A label the bank clipped into a different letter
- **ACS (Barker Road) 2018 S2 P1 Q13** (`77afe190…`, key `0a20d4bc…`) — the bottom-right
  vertex label is **Q**, but the bank crop cuts its descender so it reads as **O**,
  contradicting the stem. Confirmed by zooming the re-extracted figure: the tail is
  present in the source PDF and absent from the bank copy. The cleaned version extends
  the bottom edge 5.1 pt to restore it. Also: removing the page number "12" (which the
  crop had included) **uncovers DC's second parallel-mark arrowhead**, a real piece of
  the diagram the page number was sitting on top of.
  A strict-parity variant that keeps the "12" is at `wmfix/out/77afe190-with-pagenum.png`.
  Separately, the **C** label is clipped at its baseline **in the source PDF** —
  pre-existing, not introduced, and not fixable without redrawing.

## A figure that is not to scale (paper's own drawing, NOT introduced by cleaning)
- **Raffles Girls 2019 S1 P1 Q11** (`0806a962…`) — the shaded sector measures **127°
  (8.47/24)** against the **9/24 = 135°** the stem states. Measuring the *watermarked*
  original with the identical routine returns the same centre, radius and 127°, so the
  geometry is the paper's, untouched by the cleaning. It does not contradict the stored
  answers (the 9/24 is given in the text, not read off the figure), but the figure must
  never be used to teach angle estimation.

## Corrections to earlier sweep records
- **s107 t20** was recorded as "100% solid black, looks like a broken figure". It is
  **not broken** — raw levels centre on 148; it is a photograph of concrete bollards in a
  car park, the question's own frustum illustration.
- **s107 t14**'s top-edge text is real, but it is the paper's own black print clipped by
  the crop (pixel minima 20–57, where a pale stamp sits at 240–252) — not a stamp.

## Watermark-detection blind spots (measured, not assumed)
Worth knowing before anyone trusts a future scan:
- **The band pass has ~89% sensitivity.** Against the 18 known-stamped figures it
  re-found 16, missed 2, and found 1 the first pass had missed. Neither pass alone is
  complete.
- **Both misses are graph-paper figures.** The grid fills the pale band and masks the
  lattice. The fix that works is cropping to the **margins**, where there is no grid —
  that is how Raffles Girls 2015 Q4 was caught after one pass had cleared it.
- **Not every stamp lives in the pale band.** Raffles Girls 2015 Q5's stamp prints
  *below 249*, at ink level, on a tile that is 96.2% pure white — a pale-band-only view
  would never raise it.
- **Autocorrelation cannot be used as a stamp test** on graph paper, dotted grids or
  hatching: they are themselves periodic and score exactly like a tiled stamp.

## 53 questions held out of serving by a DATA defect, not a watermark (2026-09-03)

Closing the watermark sweep left 138 questions blocked that had never been examined.
Only 85 of them are a watermark question at all. The other **53 have no image to
check** — they are held out of serving by `has_image = true` on a row that cannot
produce an image:

- **12 — broken reference.** `has_image` true, a path stored in the row, but **no such
  object in the bucket**: fetching it 404s. Something wrote the reference and either
  never uploaded the file or the object was later removed.
- **41 — orphaned flag.** `has_image` true and **no image reference anywhere in the
  row** — not `image_url`, not `images[]`, not `figure_url`, not any `parts[]` or
  sub-part field (checked by walking the whole row, not by naming fields).

Both classes fail the serving gate exactly like a watermarked figure would
(`figureServable()` returns false on `has_image && !figure_url && status !== 'clean'`),
so they have been silently unservable. Neither can be fixed by cleaning.

**Not corrected — Adrian's call.** The fix is to set `has_image = false` where the
question genuinely has no figure, but that is a flag that gates what students see, and
some of these may be questions whose figure was lost and ought to be recovered instead
(cf. the GCE 2022 Q12 placeholder box containing the word "Image", and Pierce 2024
EM_NA Q18, a known total loss). Recovering a lost figure and hiding a missing one are
opposite actions; the row cannot tell you which it wants.

Lists: `wmsweep/never-swept.json` (the 97 with a resolvable key, of which 12 then 404)
and the 41 keyless rows derived alongside it.
