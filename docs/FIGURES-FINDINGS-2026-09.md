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
