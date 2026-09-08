# Continue the question-bank figure repair

You are picking up figure-repair work on Adrian's math question bank. Everything you
need is below; nothing is assumed from a previous conversation.

## Read first (not optional)

- Repo: `~/dev/adrianmathtuition-website` (branch `dev`). **NOT** `~/Desktop/...` —
  that path is a temporary symlink that may disappear.
- `docs/FIGURES.md` — especially **§4 "Ingestion gate + nightly catch-up"**, which
  defines the five fitness checks and who may set `image_watermark_status='clean'`.
- `CLAUDE.md` at the repo root.

## Hard rules

1. **Write nothing to git.** Do not commit, do not push. Adrian applies separately.
2. Database and storage-bucket writes are allowed **only** for the specific repairs
   described below, and only after you have looked at the image yourself.
3. **Never modify a source PDF or DOCX in place** — copy into a working dir first.
4. Use `/usr/bin/python3` for PIL/numpy. Homebrew python does not have them.
5. **Never run a recursive `find` over `~/Desktop` or `~/Desktop/AdrianMath`** — it
   stalls forever on iCloud-evicted files. Use `mdfind` or the Dropbox MCP search
   (`title_only`).
6. `timeout` is not installed on this Mac.
7. Run node scripts **from the repo root** so `@supabase/supabase-js` resolves.
   Write the script to a file; inline `node -e` breaks on zsh glob characters
   like `(` and `)` inside LaTeX.
8. Another session may be working the same tables. Re-read a row immediately before
   writing it, and read the whole row back afterwards.

## The method that actually works

**Judge figures by looking at them.** An automated verifier was tried on this work
and produced 4 false alarms and 0 true findings: lattice autocorrelation is confounded
by graph paper and hatching, and ink-diff across a resolution change manufactures
phantom loss. Build a contact sheet, read it, decide.

The five checks from `docs/FIGURES.md` §4, applied per figure against its own stem:

| | check | fails → |
|---|---|---|
| a | **belongs** to this question — every label/value/coordinate agrees with the stem | not stored |
| b | **whole** — no sliced axis/label, no page furniture or another question's drawing in frame | re-crop |
| c | **no answer in it** — no completed construction, no shaded answer region, no pre-drawn read-off | not stored in `image_url` |
| d | **legible** at print size | withheld |
| e | **watermark-free** | withheld |

Only a figure passing all five may set `image_watermark_status='clean'`. Anything else
gets status left NULL plus a `figure_flags` row with `status='held'` (never `'open'`),
`claimed_by='ingest-fitness'`. Append a `fitness: <date> …` line to
`image_watermark_notes` either way — that is how the nightly catch-up tells judged
rows from unjudged ones.

## Traps that have bitten repeatedly — read these

- **PostgREST returns max 1000 rows.** `figure_flags` has ~1200. Paginate with
  `.range()` or your counts will be silently wrong. This produced a false "the open
  flags have vanished" alarm on 7 Sep.
- **`.neq(col,'clean')` misses NULL rows** (three-valued logic). So does
  `NOT (a OR NULL)` in SQL. Filter in JS after fetching, or handle NULL explicitly.
- **`image_url` is a JSON-array *string***, sometimes with two entries, sometimes
  `[]`, and its elements may be `{url, pos}` objects rather than plain paths.
- **`image_sizes` holds the bucket path as an object KEY, not a value.** A recursive
  search over values will miss it. After detaching an image, check
  `JSON.stringify(wholeRow).includes(oldKey)` — not a clever walker.
- **`figure_flags.path` is a BARE filename** (`abc.png`), while `image_url` carries
  `question_images/abc.png`. Querying flags with the prefix returns nothing and looks
  like "no flags exist".
- **Figures can live inline** as `{{IMG:question_images/x.png}}` tokens in
  `question_text` or `parts[].text`, with `image_url` empty. `figureServable()` cannot
  see those, so the question is withheld even though its figure is present and fine.
  **24 questions were in exactly this state on 7 Sep.** Always search the whole row
  for `{{IMG:` and markdown `![](…)` before concluding a figure is missing.
- **Inline tokens are not the only hiding place — walk the `parts[]` slots too.**
  `parts[].image_url`, `parts[].image_url_after` and the same two on every subpart.
  On 7 Sep morning a pass checked `image_url`, `images`, `figure_url` and inline
  `{{IMG:}}`, found nothing, and wrote "FIGURE LOST" onto **five** questions whose
  figure was sitting in a part slot the whole time. `docs/FIGURES.md` §1 already warns
  about this; the warning was read and not applied. Enumerate every slot, then decide.
- **A part slot can hold a real jsonb ARRAY, not just a JSON-array *string*.**
  `partImagePaths()` starts `if (typeof value !== 'string') return []`, so
  `["question_images/x.png"]` stored as an actual array renders for **nobody** — and
  from outside the row it looks exactly like a lost figure. Two of the five above were
  in this state. The fix is the plain string form; check `typeof`, not truthiness.
  **This class had a LIVE PRODUCER and cleaning it was not enough** (8 Sep): the class
  was cleared to zero on 7 Sep and was back to two within a day, both rows written that
  morning by the extraction fleet. Root cause found and fixed at source — see
  §"The extraction fleet was still producing this". Before you spend a session cleaning
  a defect class, check `created_at` on the members: if any of them are hours old, you
  are bailing out a boat with a hole in it.
- **"Not in `papers/processed`" is not the same as "no source".** Five of the six
  source files an earlier pass recorded as absent were in `papers/processed` or Dropbox
  all along, including a PDF parked as unrecoverable since July. `mdfind -name '<exact
  filename>'` costs two seconds. Note that `source_file` is often spelt differently
  from the file on disk (`… Bukit Panjang Government High P1.pdf` on the row vs
  `AM PRELIM 2021 Bukit Panjang.pdf` on disk), so search the school and year, not the
  literal string.
- **The bank's school codes are abbreviations; Dropbox files spell them out.**
  **`RI` = Raffles Institution** (Adrian, 2026-09-08) — `EM S2 SA2 2014 RI.docx` on the
  row is `EM S2 SA2 2014 Raffles Institution.docx` on disk, and searching for "RI" finds
  nothing. Same shape of miss for any initialism. Search the expansion too.
- **A paper can be filed under the wrong subject, or bundled inside another one.**
  `AM S4/AM Prelim 2021/AM PRELIM 2021 Bukit Panjang.pdf` is *mostly the E-Math paper*;
  the A-Math paper it is named for starts at **page 50** of the same file. Before
  concluding a question is not in its paper, page through the whole file — a thumbnail
  contact sheet at 36 dpi is enough — rather than trusting the filename or the first
  few pages. (Also: `EM PRELIM 2025 Chung Cheng High (Yishun).docx` in Dropbox is a
  Beatty 2024 paper.)
- **Before planning a re-crop from a DOCX, check `<a:srcRect/>` in `word/document.xml`.**
  Empty means Word is hiding no cropped-away area, so `word/media/imageN.png` is all
  there is — if that file is already truncated, the truncation predates the docx and no
  re-crop exists. (MJC 2014 JC1 P1 Q7: media image byte-identical to the stored crop,
  empty `srcRect`. Nothing to recover.)
- **A PDF can be the broken thing.** Word floating-object collapse survives the export:
  in `EM S4 PRELIM (NA) 2024 Pierce.pdf` every Paper-1 diagram lost its anchor, so four
  questions' text labels are piled on the formula sheet and the line-work exists nowhere
  in the file. Enumerate `page.get_images()` and `page.get_drawings()` before concluding
  a figure can be traced out of a page render.
- **Never derive a judgement from a keyword regex.** On 7 Sep a keyword filter said
  "34 questions need no figure"; reading them showed 24 had figures and the true
  number was 11. It then also mis-sorted two more in opposite directions. The words
  "the diagram shows" (a figure the paper gave) and "sketch the graph" (an instruction
  to the student) look similar to a regex and mean opposite things. Read the question.
- **Only `status='open'` blocks serving.** The gate is
  `not exists (select 1 from figure_flags ff where ff.question_id = q.id and ff.status='open')`
  and it is kind-agnostic. `held` does not withhold anything.
- **A wrong figure has no pixel defect.** Three known-bad figures were released by a
  bulk "release every quiet figure" tap. Quiet is not the same as correct. A *clean,
  engine-drawn* figure is no safer: RI 2014 S2 Q6 carried a tidy vector pair of Venn
  diagrams that drew C and D **overlapping** where the paper draws them **disjoint** —
  which flips the answer to (C ∩ D)′ from "everything but the lens" to "the whole
  universal set". It looked perfect. Check the geometry against the paper, not the
  pixels against a threshold.
- **A missing glyph fails SILENTLY in PIL** — no exception, no warning, just `.notdef`
  boxes in the output. Times New Roman has ∩ (U+2229) but not ∪ (U+222A) or ∅, and a
  `ImageFont.truetype()` on a font path that does not exist falls back without saying so.
  An ink-pixel count will NOT catch it, because a `.notdef` box has ink (63 px, against
  129 for a real ∩). What catches it is the interior fill ratio of the glyph's bounding
  box: ~0.7 for a real glyph, 0.0 for the hollow box. On this Mac use
  `/System/Library/Fonts/Supplemental/STIXGeneral.otf` for anything with set-theory or
  maths symbols — DejaVu is NOT installed. (This only ever affected a preview PNG; the
  bank stores LaTeX and KaTeX renders `\cup` correctly — verified against the repo's own
  katex 0.16.45.)

## The serving gate

```ts
figureServable(row) = !row.has_image || !!row.figure_url || row.image_watermark_status === 'clean'
```
plus: no `figure_flags` row for that `question_id` with `status='open'`.

## Where things stand (after the 7 Sep evening pass)

**All 15 questions this queue named are now closed** — the last, Pierce 2024 EM_NA P1
Q18, with a SUBSTITUTE figure of our own rather than a recovery, on Adrian's explicit
instruction (§B). Nothing in this queue is waiting on a decision.
A bank-wide sweep closed **22 more** that the queue never saw, because they were serving
BROKEN rather than withheld; that is its own section below, and it is the more important
half. The bank-wide count moves under you while a peer session ingests, so measure it,
don't quote it: at 2026-09-08 ~09:30 SGT it was 9,645 rows with an image, 9,644 serving.
The single row not serving is SAJC 2012 JC2 P1 Q6, withheld on purpose (§"The extraction
fleet was still producing this"). Anything else that appears in that gap is a freshly
ingested row awaiting its own fitness pass, not a regression — check `created_at` before
treating one as a defect.

**The 8 Sep round (Adrian: "go ahead") closed three more and fixed the renderer.**
MJC 2014 JC1 P1 Q7 was released once the original paper showed the figure was never
defective (§C); Bukit Panjang 2021 AM P1 Q11 and Chung Cheng (Yishun) 2025 EM P1 Q19 had
their text re-extracted from source and were released (§A); Anglican High 2025 EM P1 Q23
was redrawn on Adrian's instruction and released (§A); `questionMarkdown()` now recurses
through sub-parts of any depth (§"Known and NOT fixed", now fixed); and later that day
three more figures were built from the questions themselves — both RI 2014 S2 Q6 Venn
diagrams and the Pierce Q1 spinner, Q21 ladder and Q21 triangle (§"Figures built from
the question").

The evening pass closed 8 of the 15. Two findings did most of that work, and both are
now traps above: five "lost" figures were never lost (they sat in `parts[]` slots the
7 Sep morning pass did not walk), and five of the six "missing" source papers were
sitting in `papers/processed` or Dropbox the whole time.

**The lesson that generalises: count what the RENDERER emits, not what the columns say.**
Every defect the sweep found was invisible to a column walk and invisible to the
withheld-question count, because the rows were stamped `clean` and serving. Parse
`questionMarkdown()`'s `<img>` tags, compare that to every reference in the row, and
compare both to a **recursive** bucket listing — a one-level `storage.list()` misses
`AM/<school>/…` and `EM/<school>/…` entirely and will hand you five phantom
"missing objects" (it did, on the first pass here).

### Fixed on 7 Sep evening — 8 questions, all judged by eye against their stems

Every one passed all five checks (belongs · whole · no answer shown · legible · no
watermark) and is stamped `image_watermark_status='clean'` with the evidence appended
to `image_watermark_notes`. Verified end-to-end afterwards through the repo's own
`questionMarkdown()` + `figureServable()`: each emits exactly one `<img>`, every URL
returns HTTP 200, no open flag blocks any of them.

| question | what was actually wrong | what was done |
|---|---|---|
| IJC or SRJC or YJC 2013 JC1 P1 Q2 | figure present in `parts[a].image_url_after` but stored as a **jsonb array**, which `partImagePaths()` (string-only) drops — rendered for nobody | array → plain string; stamped clean |
| NYJC 2013 JC1 P1 Q7 | same: `parts[a].image_url` held a jsonb array | array → plain string; stamped clean, with (b) recorded as a **qualified** pass — see below |
| TPJC 2015 JC2 P1 Q10 | nothing — `parts[i].image_url_after` was fine, just never judged | stamped clean |
| TPJC 2015 JC2 P2 Q4 | nothing — `parts[a].subparts[ii].image_url` was fine, never judged | stamped clean |
| MI 2015 JC1 P1 Q7 | figure fine, but the docx paste **sliced the x-axis label** — the top 3 pixel rows of an "x" at the bottom edge (rows 311–313; 306–310 blank) | re-cropped 518×314 → 518×308, new object, slot repointed, `figure_clean_log` batch `figure-recover-2026-09-07`; stamped clean |
| CJC 2016 JC2 P1 Q1 | bucket object missing (stored key 400s) | re-extracted `media/image1.png` from `JC2 Prelim 2016 CJC.docx`, uploaded under a new key, `image_url` repointed, logged; stamped clean |
| CJC 2016 JC2 P1 Q4 | bucket object missing | same, from `media/image4.png` |
| CJC 2016 JC2 P2 Q3 | bucket object missing | same, from `media/image9.png` |

Sources used, all verified byte-identical to what was already in the bucket where a
bucket copy existed: `JC1 MY 2013 IJC or SRJC or YJC.docx`, `JC1 MY 2013 NYJC.docx`,
`JC2 Prelim 2015 TPJC.docx`, `JC1 MY 2015 MI.docx`, `JC2 Prelim 2016 CJC.docx` — every
one of them in `~/Desktop/AdrianMath/papers/processed`.

**One qualified pass, recorded in the row's own note.** NYJC 2013 P1 Q7's scan is very
slightly skewed, so the page edge shows as thin black wedges along parts of the frame
(top rows 0–7; left cols 0–4; top-right col 946 rows 0–198; bottom-right rows 765–767
from x 685) — 5–8 px on a 947×768 image, all outside the drawing, touching no label.
Left in place: the bottom edge carries the bottom of the "(0,−3)" parentheses and row 7
the top of the "y" label, so a rectangular trim clips real content, and a bespoke
paint-out risks more than the hairline costs. It is an edge-bleed clean of the kind the
2026-08-28 sweep already did if Adrian wants it gone. Every figure in the batch was
measured the same way; the other seven carry 0.1–0.4 % ink in the 3 px frame band,
i.e. nothing.

### The bank-wide sweep — "everything else is clean" was not true

The queue above named 15 questions. Asked what about the other ~9,450, the evening pass
swept the whole bank with the RENDERER as ground truth (`questionMarkdown()` → count the
`<img>` tags) rather than a column walk, and diffed every reference against a **recursive**
listing of the bucket. That found three classes the withheld-question count could never
show, because **every row in them was stamped `clean` and serving**.

| class | found | outcome |
|---|---|---|
| Part slot holds a **jsonb array** → renders for nobody | 14 rows / 20 slots | 13 rows fixed (array → string) after judging all 20 figures; 1 withheld |
| `has_image` true, gate passed, **no figure reference at all** | 9 rows | 7 cleared (`has_image` false), 2 figures recovered |
| Rendered `<img>` pointing at a **missing bucket object** | 0 | — |

**The array class is the one that mattered.** These questions served the words "The
diagram shows…" with no diagram at all — worse than the withheld ones, because nothing
flagged them. Same defect as IJC and NYJC above, 13 more instances: RVHS 2015 JC2 P1 Q10,
GCE 2003 EM P1 Q23, CJC 2013 JC1 P1 Q9, SAJC 2013 JC1 P1 Q10, CJC 2015 JC1 P1 Q8,
Raffles Girls 2021 AM P1 Q8/Q10/Q11, RI 2014 JC1 P1 Q10, NJC 2014 JC1 P1 Q8,
GCE 2004 EM P2 Q5, GCE 2003 EM P1 Q7, TMJC 2022 JC2 P1 Q6.

Two things the shape fix alone would have got wrong, both caught by looking first:

- **TMJC 2022 JC2 P1 Q6 was a duplicate.** Its stem `image_url` held copies of *both*
  part figures — `ec5e2524….png` is a PNG twin of part (a)'s `2dfb33f6….jpeg`, and
  `b881c671….jpeg` is literally the same key as part (b)'s — with `question_text` empty,
  so they rendered as two captionless images at the top. Converting the part slots alone
  would have shown every figure twice. The stem was cleared to `[]`; each figure now
  renders once, beside its own part. (By contrast Raffles Girls 2021 AM P1 Q8 renders the
  *same* diagram twice on purpose: the paper prints it once as the given and again as the
  answer space for (b)(ii), whose text says "Insert the line on the following diagram".)
- **RI 2014 S2 P1 Q6 was not repaired — it was withdrawn.** Both its Venn diagrams are
  scans of an **annotated script**: continuous diagonal pencil hatching over the whole
  frame that runs past the rectangle's border, teal pen marks, a hand-drawn squiggle
  inside A∩B, blue handwriting bleeding through at the foot of the second. The question
  asks the student to *shade* a region, and for (C∩D)' — where C and D are disjoint, so
  the answer is the whole universal set — the hatching reads as the answer itself.
  Serving it with no diagram and serving it with that diagram are both wrong, so
  `image_watermark_status` was cleared to NULL and a `held` flag added. **The array slots
  are left as they are on purpose — do not "fix the shape" without replacing the images.**
  **Source checked 2026-09-08:** the paper is in Dropbox at
  `1 ONLINE LESSONS/3 Exam Papers/EM S2 (G3)/EM S2 SA2 2014/EM S2 SA2 2014 Raffles Institution.docx`
  (filed under the expansion, not "RI"), its Q6 images are `media/image2.png` and
  `image3.png`, and both are **byte-identical** to what the bank already holds. There is
  no PDF beside it, so no clean scan of that paper exists. Do not re-hunt it.
  **RESOLVED ANYWAY, 8 Sep — both diagrams REDRAWN and the question released.** Calling
  it "needs a paper you don't have" was wrong: the pencil obscured the printed diagram
  but did not destroy it, and the printed ink separates from the pencil by grey level.
  Full method, and the wrong pre-existing figure that turned up on the same row, in
  §"Figures built from the question".

**The no-reference class needed the source paper, not a keyword.** Seven of the nine turn
out to need no figure at all: in ACJC 2016 P1 Q6/Q10/Q12 and P2 Q2/Q3/Q10, and TPJC 2015
P1 Q3, every image in the question's block sits *after* the answers begin — they are
SOLUTION sketches, and each mention of a diagram in the question ("show the graph of M
against t", "sketch this locus on an Argand diagram") is an instruction to the student.
Verified block by block in the source docx. `has_image` cleared on all seven. (Watch for
`image6.png`/`image7.png` in the ACJC docx: 1×1-pixel spacers, not figures.)

The other two were real losses and both were recovered:

- **DHS 2014 JC1 P1 Q8** — the stem says the graph "is given below". The figure is in
  `JC1 Promo 2014 DHS.docx` as `word/media/image4.emf`, an Enhanced Metafile nothing on
  this Mac renders; the embedded DIB was pulled straight out of its single
  `EMR_STRETCHDIBITS` record (285×160, 32bpp) and written as PNG. Matches the stem
  exactly: y = −4x²(x²−2), maxima (−1,4) and (1,4), roots at O and ±√2.
- **Tampines 2021 EM_NA P2 Q10** — part (b) says "in the grid paper provided on the next
  page". That grid is the full-page image on page 26 of the source PDF; extracted at its
  native 595×856 rather than re-rendered. The `www.KiasuExamPaper.com` branding on that
  page is page TEXT below the image, not part of it, so the extract is clean; a printer
  registration mark in the top-right corner was cropped off with the top 26 blank rows.

### Known and NOT fixed: the renderer stops at two levels of subpart

`questionMarkdown()` walked `parts[] → subparts[]` and no deeper, so anything at
`subparts[].subparts[]` — text as well as images — rendered for nobody. Exactly **2 rows,
4 nodes** bank-wide: Anglo Chinese School (Barker Road) 2025 EM P2 Q4
(`bcc5d1af-…`, which lost parts (a)(ii)(a) and (a)(ii)(b) plus one figure) and
Catholic High 2025 AM P2 Q6 (`4d59a7fb-…`, which lost (a)(ii)(a) and (a)(ii)(b)).

**FIXED 2026-09-08 on Adrian's go-ahead** (uncommitted, in the working tree). The
hand-unrolled inner loop in `src/lib/bank-question-markdown.ts` is now a recursive
`emitPart(part, depth)`; the indent is `'&nbsp;&nbsp;'.repeat(depth)`, which is exactly
what the old code hard-coded at depth 1, so **every question with two levels or fewer
renders byte-for-byte as before** — 34,198 of 34,200 rows — and only the two deep ones
change, from silently-truncated to complete. Two regression tests were added to
`bank-question-markdown.test.ts` (one asserting the three-level output, one pinning the
two-level output byte-for-byte); the full suite passes, 188 files / 2,950 tests. Both
rows were then re-rendered and confirmed: ACS now emits 2 images and 8 blocks, Catholic
High 1 image and 8 blocks.

### A. The three "text is broken" questions — two now FIXED from source (8 Sep)

**Bukit Panjang Government High 2021 AM P1 Q11 — FIXED, released.** The paper was
never missing; it was *inside the wrong file*.
`1 ONLINE LESSONS/3 Exam Papers/AM S4/AM Prelim 2021/AM PRELIM 2021 Bukit Panjang.pdf`
is mostly the **E-Math (4048)** paper — the **Additional Mathematics 4047/1** paper
starts at **page 50** of it, Q11 is on **page 67**, with the marking scheme handwritten
under each printed question. Stem, all three parts, their marks (3+1+5 = 9, matching the
stored total) and every answer were taken verbatim. The stored figure was always right;
the stem, the part-(i) answer, the part marks and a **missing part (ii)** were all wrong
and are now replaced:
> The diagram shows part of the curve y = x^(3/2) and y = −x^(3/2). The tangent meets
> the curve y = x^(3/2) at the point A where x = 4.
> (i) Find the equation of the tangent. **[3]** → A(4, 8), gradient 3, **y = 3x − 4**
> (ii) The tangent meets y = −x^(3/2) at B. Given the x-coordinate of B is 1, find the
> y-coordinate. **[1]** → **−1**, so B(1, −1)
> (iii) Find the total area of the shaded region. **[5]** → 32/15 + 21/10 = **127/30 ≈ 4.23**

**Chung Cheng High (Yishun) 2025 EM P1 Q19 — FIXED, released.** Found at
`~/Documents/Claude/Projects/AdrianMath/papers/processed/EM PRELIM 2025 Chung Cheng High (Yishun).pdf`,
**page 12**, table printed with the scheme filled in. The first statement is **n³ > 1**,
not n² > 1 — an earlier pass read n³ correctly and a later note guessed n²; the paper
settles it. The three statements had only ever existed in the `answer` field, never in
the question, so it was unanswerable; they are now parts (a)–(c) at 1 mark each:
n³ > 1 → True · 1/n > 1/n² → True · (n−1)(n+3) always odd → False, n = 3 gives 12.
⚠ The Dropbox file `EM PRELIM 2025 Chung Cheng High (Yishun).docx` is **NOT this paper** —
it is a Beatty 2024 paper, mislabelled.

**Anglican High 2025 EM P1 Q23 — REDRAWN and released** (Adrian, 8 Sep: *"just redraw
anglican figure"*). The wording and parts were already correct in the row and match
p20–21 of `Dropbox/…/EM Prelim 2025/EM PRELIM 2025 Anglican High.pdf`; only the figure
was wrong. **Both** Dropbox copies (the plain one and `(Post)`) are the *answered*
version — there is no blank one — and the stored image was that overlay.

De-leaking it was not possible: the coloured construction crosses the black original, so
stripping colour and its anti-aliased halo leaves gaps in both segments, and the labels
A, B, C were never in the image at all — they were page text that the Word
floating-object collapse threw into the left margin. So the figure now in the bank is
**ours, not a scan**.

How the geometry was established, so nobody has to take it on trust:
- The two arms were least-squares-fitted to the surviving black pixels — residual std
  2.6–2.9 px, i.e. the stroke width, so they really are straight. They meet at
  (381.4, 669.8) in the stored image's pixel space, far ends (381.5, 211.0) and
  (1373.0, 829.6); angle ABC = 99.1°.
- The labels are **derived**, and each derivation is corroborated by measuring the mark
  scheme's own answer lines against the fitted arms: the **red** line is 87.3° to the
  right arm and 8 px from its midpoint → it is the perpendicular bisector of AB, so the
  right arm is AB; the **green** line is 88.8° to the vertical arm and 19 px from its
  midpoint → that arm is BC; the **blue** line passes 1.3 px from the vertex and splits
  it 47.0°/52.1° → it is the bisector of angle ABC, so the vertex is B. Hence
  **B = vertex, A = far end of the right arm, C = top of the vertical arm.**
- End-to-end check: performing (a)(i) and (a)(ii) on the redrawn figure puts **M** at
  (971, 168) and **T** at (927, 441), within **37 px** and **33 px** of where the
  school's own hand-drawn lines intersect — inside their drawing error, given their
  angle bisector is 2.5° off true — and on our figure |TA| = |TB| = |TC| = 591.8 and
  |MA| = |MB| = 774.4 exactly.

The old overlay is still in the bucket and in `figure_clean_log`
(batch `anglican-redraw-2026-09-08`); repointing `image_url` back to
`e4095a11-24b4-4aa1-ac27-6b697816281e.png` reverts it.

### B. The Pierce questions — two drawn from the question, one closed with a substitute

`Pierce 2024 EM_NA P1 Q1` (`d2dcd162-…`), `Q18` (`e3b3b79c-…`), `Q21` (`2d81a524-…`).
**Do not go looking for the paper again.**

`EM S4 PRELIM (NA) 2024 Pierce.pdf`
(sha256 `99d9ddcd36f3260157b63df3032ad76c1d93b05fff91035a86b2e4c59aed95f4`) is in
`Dropbox/1 ONLINE LESSONS/3 Exam Papers/EM S4 (NA)/EM S4 SA2 (NA) 2024/`, with a
byte-identical copy in `~/Documents/Claude/Projects/AdrianMath/solutions/done/`. The
2026-07-18 note blamed the *archive renders* for the Word floating-object collapse; the
collapse is **in the PDF itself**. Every embedded image and every vector path on
Paper 1 (pp. 1–17) was enumerated: the only rasters are the school logo (p1), a black
mask (p3), the Q13 parallelogram (p10) and the Q17 sector (p14/15). Every other diagram
lost its anchor and its line-work is absent from the file — page 2 carries the surviving
text labels of four different questions piled on top of the formula sheet.

**Q1 and Q21 were then drawn from the question instead (8 Sep, Adrian: "do all"), and
both are released.** See §"Figures built from the question" below for how far the
evidence went in each case.

**Q18 could not be reconstructed, and was closed with a SUBSTITUTE instead** (8 Sep,
Adrian: *"just create a diagram that fulfills the question"*). Its stem is only *"Draw an
enlargement of the polygon using the scale factor of 2."*: the polygon is described
nowhere, and the shape and its grid are absent from the file — page 13 ends with the Q18
line and page 14 is blank from the top down to the `[2]` at y=467, which is where the
floating objects sat. So the figure now on the row is **ours**: a pentagon on 1-unit
squared paper, vertices (1,1), (4,1), (4,3), (2,3), (1,2), sides 3, 2, 2, √2 and 1, one
edge deliberately diagonal so a scale-factor-2 enlargement is not trivially axis-aligned;
the grid is 16 × 11 so the 6 × 4 image fits several times over, and no centre of
enlargement is marked, matching the stem. A real `answer` and `solution` were written
against it. ⚠ **The question is now a valid practice item on enlargement by scale factor
2, but it is NO LONGER A FAITHFUL REPRODUCTION of Pierce 2024 EM (NA) P1 Q18** — a
student's answer is not comparable to that school's mark scheme. The flag is closed as
"closed with a substitute, not a recovery". If the real paper ever turns up, replace the
figure and say so on the row.

### The extraction fleet was still producing this — fixed at source, 8 Sep

The jsonb-array defect above was cleared to **zero** on 7 Sep. By the next morning it
was back to **two**, and both rows had been written that morning by the extraction
fleet (`PDF-Pipeline-CC1`):

| row | what the fleet did |
|---|---|
| TJC 2016 JC1 P1 Q13 (`918c82d0-…`) | wrote `parts[b].image_url` as a jsonb **array**, so the cartridge diagram rendered for nobody — while stamping `fitness:ok … (2 figures)` and `clean`. Both objects existed. **Fixed** (shape only; the figure checks out against the stem). |
| SAJC 2012 JC2 P1 Q6 (`b993ff5c-…`) | same array shape, **and the object it names 404s** (`NoSuchKey`). Stamped `fitness:ok … (1 figure)` and `clean`, so it served part (a)'s *"as shown in the diagram"* with nothing at all. Fixing the shape would not help — there is nothing to point at. **Withheld** (status → NULL, `held` flag); its array slot is left as-is on purpose. |

**The fleet is not code — it is an instruction sheet**, the `exam-extraction` row of
Supabase `extraction_worker_prompt`, which every worker reads before each run. Both
defects were gaps in that sheet, not carelessness by the workers:

1. It gave the wiring form for the ROW-level `image_url` — a JSON-array *string* in a
   text column — and later listed `parts[i].image_url` / `image_url_after` in a
   placement table, but **never said those take a bare string**. A worker who has just
   been shown the array form naturally reuses it, `parts` is jsonb, and the array is
   what lands. Nothing downstream complains.
2. It had a "run the SQL storage cross-check" step in the images section, but the
   fitness stamp — the actual gate — did not require that check to have passed. So a
   worker could certify a figure it had never confirmed uploading.

**Both are now rules in the live sheet** (`v2026-09-08-slotshape`), each naming the two
rows above as the evidence, and each saying what the symptom looks like: "renders for
NOBODY while the row still looks correct in the database". The pre-edit text is archived
byte-for-byte as `exam-extraction-2026-09-08-slotshape` and was verified equal after the
write — that is the rollback. It takes effect on the next worker run; nothing to deploy.

> **The lesson worth carrying:** a defect class with a live producer will refill faster
> than you can clean it, and the cleaning session is exactly the one positioned to
> notice. Check `created_at` on the members of any class you are about to sweep. If some
> of them are hours old, find the writer before you spend the session on the rows.

### Figures built from the question, 8 Sep — how far the evidence went

Adrian: *"are you able to build the images from the question alone?"* → *"do all"*, and
later *"just create a diagram that fulfills the question"* for the last one. Four figures
were unbuildable-by-paper; all four now carry a drawing, and they sit on **four different
amounts of evidence**. **That distinction is the point of this section** — "we drew it"
is not one category, and the row notes say which kind each one is:

| | kind | example |
|---|---|---|
| 1 | measured from the source | RI 2014 S2 Q6 — circle fits, sub-pixel residuals |
| 2 | determined by the stem | the Pierce Q1 spinner, the Q21 ladder |
| 3 | a choice the answer does not depend on | the Q21 triangle's side assignment |
| 4 | **a substitute — not the paper's figure at all** | the Pierce Q18 polygon |

Kind 4 is the one to be loudest about: it makes a question usable while quietly changing
what it is. It was done once, on Adrian's explicit instruction, and the row says so.

**1. RI 2014 S2 P1 Q6 — nothing inferred.** The scans are of an annotated script, but
the PRINTED geometry survives underneath and separates by grey level: printed ink is
below 110, the pencil hatching and pen sit in the 110–200 band. Rectangle bounds read
straight off the full-width/full-height dark rows and columns; each circle fitted by
algebraic (Kasa) least squares to the ink on its arc after dropping the label glyphs,
**radial residual mean 0.78–0.95 px**. (a) circles (208.3, 152.3) r 113.6 and
(340.5, 148.6) r 113.3 — centres 132.2 apart against radii summing 226.9, so
**overlapping**. (b) circles (160.5, 144.5) r 94.6 and (361.5, 145.1) r 93.7 — centres
201.0 apart against radii summing 188.3, so **disjoint, gap 12.7 px**. The labels ε, A,
B / ε, C, D are printed on the diagrams, so their positions came from glyph centroids,
not from reasoning. Both are blank answer spaces, so nothing is given away.

> ⚠ **And the row already had a WRONG clean figure.** Its stem carried
> `0f7da418-2c83-42f5-b552-7203e267158c.png`, a tidy engine-drawn pair somebody made
> earlier — which draws **C and D overlapping**. That is not cosmetic: with C and D
> disjoint, C ∩ D is empty and (C ∩ D)′ is the **whole** universal set, where the
> overlapping version implies shading everything except the lens. It was the only thing
> rendering on that question. Detached (referenced by this row only; object kept, swap
> logged). **A clean, confident-looking figure is not evidence that it is the right
> figure** — this one had no pixel defect at all.
>
> Both diagrams also had to move from `parts[].image_url` to `parts[].image_url_after`,
> because the part texts say "in the following Venn diagram" and "in the diagram below"
> — the `image_url` slot renders ABOVE the part's words.

**2. Pierce 2024 P1 Q1, the spinner — determined by the stem.** *"an equal chance of
landing on each of the numbers 1, 2, 3, 4, 5, 6, 7 and 8"* fixes everything that
matters: a circle in eight EQUAL sectors labelled 1–8. The only free choice is the
arrangement round the rim, and it changes neither answer — P(prime) = 4/8 and
P(>3) = 5/8 on any arrangement. It is not arbitrary either: the surviving collapsed
labels sit in two columns reading 7, 8, 1, 2 down the left and 6, 5, 4, 3 down the
right — consecutive, increasing anticlockwise — and that is what was drawn. No pointer,
so no outcome is implied.

**3. Pierce 2024 P1 Q21 — one part from the text, one carrying a flagged assumption.**
(a) The ladder is fully specified in words: 5 m ladder, foot 1.2 m from a vertical wall,
so height √23.56 = 4.854 m at 76.06° to the horizontal — which is what makes the answer
"not safe" against the stated 70°–74° band. Drawn to those dimensions, nothing invented.
(b) The triangle's side lengths 10, 40 and 42 are **not in the question text** — they
survive only as loose labels — and **which side is which is not recoverable**: the four
surviving words sit at x = 99.6, 135.6, 171.6, 207.6, **exactly 36.0 pt apart**, which is
the collapse's fixed tab, not their original positions. A is above and B and C share a
row, so BC is the base; past that it is a choice. Drawn as AB = 10, BC = 40, CA = 42 and
flagged in the row note. It does not change the answer — 42 is the longest side on any
assignment and 10² + 40² = 1700 ≠ 42² = 1764 — but it would still be a different figure
from the school's.

**The rule this suggests for the next session:** before drawing anything, say out loud
which of these three you are in — *measured from the source*, *determined by the stem*,
or *a choice that the answer happens not to depend on* — and put that sentence in
`image_watermark_notes`. All three are legitimate; conflating them is what shipped
inferred labels the first time round.

### C. The "bad crop" that turned out not to be a crop — RELEASED

**MJC 2014 JC1 P1 Q7** — id `c08a143c-167a-4f49-acff-fa562a4c6ff3`, inline figure
`e8f7dffb-ec68-4285-ab9d-980ddd589430.png`. **Released 2026-09-08; flag closed.**

Two passes called this figure defective ("no axes, no origin, no scale — part (a) cannot
be attempted"). Both were wrong, and the original paper proves it. It is in Dropbox at
`1 ONLINE LESSONS/3 Exam Papers/H2 JC/JC Math JC1 MY 2014/JC MY 2014 MJC.pdf` — a
3-page landscape 2-up scan, Q7 on page 2, right column, footer `9740/01/MYE/2014`.
Compared side by side with the stored crop they are the same drawing, speck for speck:
**MJC printed this figure with no axes.** The heavy horizontal rule is the bottom edge
of the printed drawing box, not page furniture and not the x-axis — the curve is clipped
by it on both descending branches. Nothing was ever lost in extraction.

The question is answerable exactly as the school set it: the stem supplies the only
numbers there are (asymptote y = 0, turning points x = 1 and x = 5), which is why the
stored answers are qualitative — 1/f(1), ±√f(5) — rather than numeric.

**The general lesson: "this figure looks incomplete" is a hypothesis about the
extraction, and the paper is the only thing that can test it.** Two sessions measured
the pixels in ever-finer detail (asymptotes at x-px 181.5 and 427.5, tails 16 px apart,
turning points at 285 and 487) and grew more confident of a conclusion the source
refuted in one look. Find the paper before you write "needs the real paper".

### D. Freshly ingested, not part of this queue

**RI 2015 JC2 P1 Q8** (`7ab22336-b60d-45d9-87a9-cc0b2ba7e576`), **Q10**
(`f89db196-8f06-4f0b-bb3b-0d14f0d59c2a`), and however many more have landed by the time
you read this — another session was ingesting `JC2 Prelim 2015 RI.docx` while this pass
ran, first row created 2026-09-07 10:37. Q8's figure is at `parts[b].image_url_after` as
a JSON-array *string*, so it renders; it is simply unjudged, and will be picked up by
its own session or the nightly `figure-fitness` catch-up. **Left alone deliberately** —
stamping rows out from under a live ingestion is how two sessions collide.

### E. The review backlog — Adrian's, not yours

At `/admin/figures-bank`: **446 `status='held'` rows** across the question and solution
lanes. These are already serving (held does not withhold). Do not bulk-release them.
Do not "release every quiet figure" — that button is how three known-bad figures went
live.

## Before you redraw anything

The **bot repo** (`~/dev/adrianmath-telegram-math-bot`) has `lib/figures/` — a registry
of 33 typed figure families (graphs, circles, triangles, box plots, graph paper,
argand, parametric curves, conic sections, …). Each has `verify(spec)` that re-derives
the maths and fails closed. **Use the registry before hand-writing SVG.** Bespoke SVG
is only for out-of-registry art (floor plans, real-world illustrations).

If you do write bespoke SVG: derive every repeated shape from ONE parameterised
function so copies cannot drift apart, and **do not trust SVG's `A` arc command** — when
the chord equals the radius there are two valid centres and it can pick the wrong one,
producing an arc that bows around the wrong point while both endpoints land correctly.
Sample arcs explicitly about a known centre instead, then verify by measuring ink on a
ring about the vertex.

## How to report

For every figure you touch, record: what was wrong, what you did, where the geometry
came from, your confidence, and anything Adrian must decide. Never claim a figure is
repaired without having looked at the result at 1:1.
