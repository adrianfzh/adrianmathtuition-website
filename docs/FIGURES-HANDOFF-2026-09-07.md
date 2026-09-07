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
- **Never derive a judgement from a keyword regex.** On 7 Sep a keyword filter said
  "34 questions need no figure"; reading them showed 24 had figures and the true
  number was 11. It then also mis-sorted two more in opposite directions. The words
  "the diagram shows" (a figure the paper gave) and "sketch the graph" (an instruction
  to the student) look similar to a regex and mean opposite things. Read the question.
- **Only `status='open'` blocks serving.** The gate is
  `not exists (select 1 from figure_flags ff where ff.question_id = q.id and ff.status='open')`
  and it is kind-agnostic. `held` does not withhold anything.
- **A wrong figure has no pixel defect.** Three known-bad figures were released by a
  bulk "release every quiet figure" tap. Quiet is not the same as correct.

## The serving gate

```ts
figureServable(row) = !row.has_image || !!row.figure_url || row.image_watermark_status === 'clean'
```
plus: no `figure_flags` row for that `question_id` with `status='open'`.

## Where things stand (7 Sep 2026)

9,466 live questions carry an image. **15 do not serve.** Everything else is clean.

### A. Three questions whose TEXT is broken, not just the figure — these need Adrian

Do not release any of these by fixing the image alone.

1. **Anglican High 2025 EM Prelim P1 Q23** — id `16648399-9491-4165-8225-e3b66e3fcca8`,
   flag path `e4095a11-24b4-4aa1-ac27-6b697816281e.png`, source `EM PRELIM 2025 Anglican High.pdf`.
   The stored image is a **worked-solution overlay**: blue construction arcs with both
   the perpendicular bisector and the angle bisector already drawn, plus red and green
   loci lines. The three tents A, B, C are not even labelled, so it is unusable as the
   question figure even after de-leaking. Needs the blank answer-space diagram from the
   source PDF, which is **not** in `~/Desktop/AdrianMath/papers/processed`. An earlier
   pass reconstructed the labels by inference — that must not ship.

2. **Bukit Panjang Government High 2021 AM Prelim P1 Q11** — id `c91d75e0-6b05-4413-aee2-eb766f967455`,
   flag path `716a700a-ef99-45b0-88bf-49bacea0b40a.png`, source
   `AM PRELIM 2021 Bukit Panjang Government High P1.pdf` (also not in `processed`).
   **The figure is correct; the stored text and answers are wrong.** The figure shows
   `y = x^(3/2)` and `y = -x^(3/2)` with a tangent touching at A (x=4) and meeting the
   lower curve at B. The stored stem says "y = x^2 - 3 and y = sqrt(3-x)" — both wrong —
   and the stored answer (i) `y = 8x - 19` is the tangent to that wrong curve.
   Correct: at x=4, y = 4^(3/2) = 8; dy/dx = (3/2)x^(1/2) = 3; tangent **y = 3x - 4**
   (x-intercept 4/3, which matches the drawing); **B = (1, -1)**. Part (ii)'s area must
   be recomputed. Re-extract the text from the source paper.

3. **Chung Cheng High (Yishun) 2025 EM Prelim P1 Q19** — id `9efc7fd2-e9e7-49cf-a915-447dc027a1e1`,
   `source_file` is null. The wrong figure (a rectangle with shaded triangles X and Y,
   belonging to another question) was **already detached on 7 Sep**. Still open for a
   non-figure reason: `parts` is empty and `question_text` does not contain the table of
   true/false statements, so it is unanswerable. The `answer` field implies three
   statements (n^2>1 True; 1/n > 1/n^2 True; (n-1)(n+3) always odd False, n=3 gives 12)
   but an earlier pass read the paper as **n^3 > 1**, and True/True does not
   disambiguate. Needs the source paper.

### B. Eight questions whose figure is LOST

`has_image = true`, `image_url` empty, no inline `{{IMG:}}` anywhere, but the text
refers to a diagram the paper supplied. Clearing `has_image` would publish a question
whose own words point at a picture that is not there — do not do that. Recover the
figure from the source paper, or leave blocked.

| question | id | the cue in its text |
|---|---|---|
| IJC or SRJC or YJC 2013 JC1 P1 Q2 | `9df595d0-dbe3-4a63-9d2f-b8ccd4bfa4de` | "The diagram shows" |
| MI 2015 JC1 P1 Q7 | `7b8ee155-83fd-4938-b986-c3ca2af86ee4` | "The diagram shows" (circle x²+(y−1)²=1) |
| NYJC 2013 JC1 P1 Q7 | `f0c28f16-b84e-4b15-a4d5-91e463690206` | "The diagram shows" |
| TPJC 2015 JC2 P1 Q10 | `a0cfcbb4-a1d0-41c0-9cb5-950c5b69bb1e` | "The diagram shows" |
| TPJC 2015 JC2 P2 Q4 | `20453a3b-add2-4da7-bc0b-81773a639caa` | "The diagram shows" |
| Pierce 2024 EM_NA P1 Q1 | `d2dcd162-bd23-49ce-b099-d1bedd119968` | spinner, numbers 1–8 |
| Pierce 2024 EM_NA P1 Q18 | `e3b3b79c-0b31-499f-8152-2e7a6694c31d` | "Draw an enlargement of **the polygon**" |
| Pierce 2024 EM_NA P1 Q21 | `2d81a524-022c-4627-a6bd-ed0c8c5e2c81` | part (b) triangle ABC, "not drawn to scale" |

Several of these are reconstructible from the question's own algebra (e.g. MI 2015 P1 Q7
gives the circle's equation). A redraw is legitimate **only** if every feature comes from
the question text — never inferred. Check the bot's figure registry first (see below).

### C. Three files missing from the bucket

`https://nempslbewxtlikfzachi.supabase.co/storage/v1/object/public/question_images/<key>`
returns HTTP 400 for all three. Never judged. Find the source papers and re-extract.

- CJC 2016 JC2 P1 Q1 — id `5fc07576-9404-4afd-be89-f7c8a973cfb7`
- CJC 2016 JC2 P1 Q4 — id `79c69ca0-5c94-4bb8-bfc8-2a426da7fa9e`
- CJC 2016 JC2 P2 Q3 — id `d00d3c79-2ef8-472a-afc8-3bf66f548902`

### D. One bad crop

**MJC 2014 JC1 P1 Q7** — id `c08a143c-167a-4f49-acff-fa562a4c6ff3`, inline figure
`e8f7dffb-ec68-4285-ab9d-980ddd589430.png`. The crop has no y-axis, no axis labels, no
origin and no scale; the rule along the bottom is page furniture, not the x-axis. The
stem promises "horizontal asymptote y = 0 and turning points at x = 1 and x = 5" and
none of it is identifiable, so part (a) cannot be attempted. Needs a re-crop from source
or a redraw. Flagged `held`.

### E. The review backlog — Adrian's, not yours

At `/admin/figures-bank`: **131 question figures** and **313 solution figures** with
`status='held'`. These are already serving (held does not withhold). Do not bulk-release
them. Do not "release every quiet figure" — that button is how three known-bad figures
went live.

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
