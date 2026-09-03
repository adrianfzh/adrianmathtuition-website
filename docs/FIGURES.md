# Question-bank figures — the one map

Everything about the ~9.7k images attached to bank questions: who owns which
table, how a figure gets repaired, and the traps that have already burned a
session. **Read this before touching figure images, and before starting any
bulk figure work** — several Claude sessions run in parallel on this repo and
have twice built overlapping tooling.

## 1. Where a figure actually lives

A question can carry its figure in three places, and code must check all three:

| Field | Shape | Notes |
|---|---|---|
| `questions.figure_url` | text URL | engine-drawn figures (ours). Serves unconditionally. |
| `questions.image_url` | JSON string array | bare paths `<file>.png` / `question_images/<file>.png` **or** `{url,pos}` objects (2025 EM batch) — parse with `cropUrls()` in `lib/kiosk-worksheet-images.ts`, never `String()`. |
| `questions.parts[].image_url` / `.image_url_after` | inside the parts jsonb | a figure that belongs to one part. |

> ⚠ **A figure is NOT missing just because `image_url` is empty.** On 2026-08-30
> an AI placement pass moved 347 stem-level figures down into their correct
> `parts[]` slots (logged in `question_image_placement_log` with before/after +
> reasoning). Reading only `image_url` makes those look wiped — they aren't.
> **Always check `parts` before declaring a figure lost or "restoring" one**, or
> you will attach a duplicate. As of 2026-09-01 only **6** live questions have
> no image anywhere (stem + `images` + parts all empty).

## 2. Tables, and which workflow owns each

| Table | Written by | Purpose |
|---|---|---|
| `figure_flags` | **Adrian's eyeball review** (`/admin/figures-bank`) + repair batches + the solution-image watermark pass | one row per image flagged as needing work. `status` `open`→`fixed`; `claimed_by`/`claimed_at` = cross-session claim. **`kind`** (2026-09-03, migration `figure_flags_kind`): `question` = a question figure for the redraw flow (every pre-existing row); `solution` = a SOLUTION image (`solution_images[]` / `parts[].solution_image`) for the watermark gate in §4 — those rows carry the note "SOLUTION IMAGE — not a question figure; do not redraw via the figures-bank flow". |
| `figure_clean_log` | repair batches | every swap: `old_path` → `new_path`, `batch`. **The revert ledger** — originals are never deleted from the bucket, so repointing `image_url` back to `old_path` undoes any fix. |
| `question_image_placement_log` | the image-placement pass | stem↔part relocation, with `before_*`/`after_*` and the model's reasoning. |
| `question_image_audit` | bank-wide image audit | per-image audit rows. |
| `figure_regen_flags` | a *different* tool | **learning-unit SVGs**, not bank scans — `/admin/figures` (singular). Don't confuse it with `/admin/figures-bank`. |

## 3. Claim protocol (mandatory for bulk work)

Two sessions redrawing the same figure is the failure this prevents:

```sql
-- claim before working
update figure_flags set claimed_by = '<who>', claimed_at = now()
where path in (
  select path from figure_flags
  where status = 'open' and kind = 'question' and claimed_by is null
  order by created_at limit 50
);
```

Claim queries filter **`kind = 'question'`** (2026-09-03) — `/admin/figures-bank`,
`/api/admin/figures-bank`, the 🚩 highlights in `/admin/questions` and the
`scripts/figure-maintenance` surveys all do; a `kind='solution'` row is the
serving gate's (§4), never a redraw job, and must not reach a redraw session.

`status` **stays `open` while claimed** — the serving gate keys off
`status='open'`, so reusing `status` as a claim marker would silently re-expose
an unfixed figure to students. Clear the claim by setting `status='fixed'` when
the repair lands, or null `claimed_by` if you abandon the batch.

## 4. Serving gate — flagged figures never reach students

`kiosk_pool`, `practice_next` and `practice_candidates` each carry:

```sql
and not exists (select 1 from figure_flags ff
                where ff.question_id = q.id and ff.status = 'open')
```

(migration `open_flag_exclusion_serving_pools`.) So a flagged-but-unfixed
question sits out of kiosk/bot worksheets, portal Practice, assignment picks and
printed papers — and **fixing it auto-releases the question**, no cache, no
second step. Keep this clause when editing those RPCs.

Separately, the watermark gate (`figureServable()` in `lib/kiosk-pool.ts`) fails
CLOSED: a scanned figure serves only when `image_watermark_status='clean'`. After
attaching a recovered figure, set that column or the question stays unservable.

**Solution images (2026-09-03)** — `solution_images[]`, `parts[].solution_image`,
sub-part `solution_image` and `{{IMG:…}}` inside solution text had NO gate:
`solutionMarkdown()` rendered them unconditionally, so a scan carrying another
school's or tuition centre's branding showed the moment a solution was revealed
(Adrian: never ship another company's watermark). `lib/solution-image-gate.ts`
  **Flag a stamped solution image with `status='held'`, not `open`** (3 Sep 2026): the serving RPCs exclude a question on any `open` row regardless of `kind`, so an open solution row would drop the whole question from practice/kiosk pools; `held` is ignored by the pools and blocks only in the render gate (pool bite = 0), and becomes `fixed` when the image is cleaned.
now builds a `SolutionImageGate` from `figure_flags` rows with `kind='solution'`
(`open` = blocked, matched by normalised bucket path — `normaliseImagePath()` in
`lib/bank-question-markdown.ts`), and every student-facing solution renderer
passes it: `/api/portal/practice/solution` (math and science branches — the
practice and timed-set flows both reveal through it), the notebook reveal
(`POST /api/portal/notebook`), and — so Adrian sees what a student sees — the
`/admin/questions` detail view and its worked-solutions PDF. A withheld image
emits nothing (no placeholder); the working around it still shows. Question
figures take no gate. The dormant switch **`SOLUTION_IMAGES_REQUIRE_CLEAN`**
(`false`) flips the gate from deny-list to allow-list — only paths on a
`kind='solution'` `status='fixed'` row render, everything unclassified
disappears — flip it only once the classification pass has covered the bank.
**Unjudged levels are allow-listed regardless of the switch (3 Sep 2026).**
`JUDGED_SOLUTION_LEVELS` in `lib/solution-image-gate.ts` names the levels the judge pass has
covered (Sec: AM/EM/S1/S2 + NA). `solutionImageGateFor` reads each question's level; a question
at any other level goes into `gate.unjudged`, and `solutionMarkdown` then renders only its
`fixed` paths — so the ~2,700 JC solution images nobody has judged are withheld from
`/app/practice` (which IS open to students in the marking-only beta) until a JC judge pass
lands and JC is added to the set. A failed level read treats every question as unjudged.
Adrian: "There must be no watermark images — important."

### Solution lane — `/admin/figures-bank` → 🖼 Solutions

The held rows above are Adrian's to judge, and since 2026-09-03 they have a
surface: the **Solutions** tab (`?kind=solution`, `GET/POST /api/admin/figures-bank`
with `kind:'solution'`). Each card is one held image — the live bank image beside
the **cleaned candidate** when one exists (`question_images/candidates/<flag path>`,
seeded by `scripts/figures/upload-solution-candidates.mjs` from the cleaning
sessions' `~/.adrianmath-figures/candidates-*.json`, each PNG carrying a
`<path>.json` sidecar with the session's verdict). A candidate the cleaning
session **held** is still shown — never hidden — but its chip says why and its
button reads *Use it anyway*, so approving a remnant is a conscious act. The chip
switches on an EXPLICIT `hold_kind` only (`residue` = inspected, faint lettering
survives the strict stretch; `unverified` = nobody has looked); absent, it reads
"❓ held — see note" and prints the raw reason. **Never infer `hold_kind` from the
reason text** — a keyword guess once labelled an uninspected image as inspected.

Five actions, and only three of them write to the question row:

| Action | What it does |
|---|---|
| ✓ **Approve as-is** | flag → `fixed`, note "Adrian approved as-is · …". Nothing else — the image was always fine. |
| ✓ **Use cleaned candidate** / *Use it anyway* | the full write contract below, note "Adrian approved cleaned candidate". |
| ✍️ **Amend…** | same contract with Adrian's own upload (≤ 3.5MB decoded — Vercel's 4.5MB body cap), note "Adrian amended". |
| 🙈 **Keep hidden** | note only, status unchanged. |
| ✏️ **Redraw** | note "redraw requested", status unchanged. |

The two applying actions mirror `apply.py` exactly (`lib/solution-image-apply.ts`,
pure + tested): upload as a NEW object `question_images/solutions/cleaned/<qid>-<part>-<sha8>.png`
→ replace every reference **recursively** (`solution_images[]`,
`parts[].solution_image`, `parts[].subparts[].solution_image`, inline `{{IMG:…}}`),
writing the full public URL → re-read the whole row and **prove the old key is
absent**, reverting if it survived → a `figure_clean_log` row with batch
**`admin-vet-lane`** → and only then the flag flip. Any failed step returns a 500
naming the step with nothing half-applied. `fixed` is what the render gate serves —
including at **unjudged levels**, where only `fixed` paths render at all, so
approving here is what makes a JC solution image visible again.

Outage posture: deny-list mode serves unfiltered and logs (it contains KNOWN bad
images; a Supabase hiccup must not blank every honest diagram), allow-list mode
withholds everything. The RPC clause above stays kind-agnostic on purpose: an
open flag of EITHER kind keeps the whole question out of the selection pools —
the intended stopgap while a solution image is bad.

### Fitness lane — `/admin/figures-bank` → 🔍 Fitness

A **question**-figure counterpart to the Solutions lane, added 2026-09-03 for
the fitness-verification pass (`claimed_by 'figfit-2026-09-03'` plus a peer
session's cropsweep): a QUESTION figure that may be the wrong figure, cropped
short, illegible, or carrying foreign content gets `figure_flags kind='question'
status='held'` — held, not open, because an open QUESTION flag pulls the whole
question from serving immediately (§4 above), and most fitness failures are
cosmetic; Adrian needs to look before anything is withdrawn. `GET
?kind=fitness` on `/api/admin/figures-bank` lists the held rows joined with
their question, with a severity read out of the pass's note (`blocks-answering`
/ `cosmetic`, or `null` when the note doesn't say). Three actions, each
PREFIXING Adrian's verdict onto the pass's own note rather than replacing it:
🙈 **Hide from students** flips status to `open` (withdraws the question from
serving until the figure is repaired — the confirm dialog says so); ✓ **Figure
is fine** flips status to `fixed` (the question keeps serving; the row stays as
a record it was looked at); 🛠 **Send to repair** leaves status at `held` (stays
in the queue without touching what students see). None of the three writes to
the bucket or the question row — this lane is a judgment call, not a repair
tool.

## 5. Repairing figures — what actually works

Proven order of preference:

1. **Lightest touch first.** Excess whitespace / stray question number / caption
   → *trim the original*. Question text baked into the crop → *crop to the figure*
   or split into two images. Don't redraw what only needs cropping.
2. **Redraw** damaged or faint line art. Map it to a family in the bot repo's
   `lib/figures/` registry (23 typed families, `verify()` fails closed) before
   hand-writing SVG — see the figure-library note in `CLAUDE.md`. Render at
   density 200; **match the original's relative font sizes** (redrawn text coming
   out too small is Adrian's most frequent review note).
3. **Leave alone**: photographs, and anything whose grey/colour IS content
   (graph-paper grids, shaded regions, halftone). Blanket pixel "cleans" erase
   these — that is why the 2026-08 sweep skipped ~4.5k images on purpose.
4. **Never invent.** If the figure isn't determined by the image + question text,
   report it as unrecoverable rather than guessing at dimensions.

Every applied fix: upload as a NEW bucket object, repoint the reference, write a
`figure_clean_log` row, flip the flag to `fixed`. Adrian vets a before/after
sheet (numbered + labelled school/year/Qn) **before** anything is applied.

## 6. Recovering a missing figure

Source order: the paper's `questions.source_file` → Dropbox
`1 ONLINE LESSONS/3 Exam Papers/…` → `~/Desktop/AdrianMath/papers/processed/`
→ the grail harvest (`grail-harvest/_INGEST/…`, which sometimes holds an
*independent scan* of the same paper).

Two hard-won tricks:

- **A "corrupt" PDF may still hold the figures.** Poppler rendering nothing does
  not mean the art is gone: in the Pierce 2024 export every figure float had
  collapsed into an overlapping pile on one page. Parsing the page content
  stream and re-rendering one figure's path/label blocks at a time recovered
  them. Try that before declaring a figure unrecoverable.
- **Watch for marked copies.** Some source scans have the *answer* construction
  drawn on the figure; crop the clean version or redraw at measured geometry.

⚠ **Answers written while a figure was missing may be fabricated.** Pierce 2024
EM_NA Q20's stored answers (mode 2 / median 1.5 / 50%) contradicted the genuine
recovered figure (0 / 1 / 25%) and were corrected on Adrian's say-so. If a
recovered figure disagrees with the stored answer, suspect the answer.

## 6a. Applying a batch — five shapes, not one

`figure_clean_log` records which was used. A blind "swap `image_url[idx]`" is
wrong for four of them:

1. **swap** — replace the reference. The common case (249/265 in the 2026-09-02 run).
2. **remove** — the image does not belong to the question (answer leak, orphan
   from another paper, a spare graph-paper page). Log `new_path='(removed)'`, and
   **also purge `questions.images`** — that column is a FALLBACK that
   `lib/bank-question-markdown.ts` reads when `image_url` yields nothing, so
   emptying `image_url` alone can resurface the very image you removed.
3. **append / restore** — the stored image is fine; figures were DROPPED and must
   be re-attached alongside it. Never repoint the existing reference.
4. **split** — one image becomes two, the second attaching to `parts[]`.
5. **close-only** — no defect; close the flag and check whether
   `image_watermark_status` is the real blocker.

⚠ **A reference may live in `parts[i].image_url` / `.image_url_after` or
`images[i]`, not `image_url[n]`.** 15 of 265 did in the 2026-09-02 run. A script
that only writes `image_url` will skip them — and if it closes their flags anyway,
those questions end up marked fixed while still serving the broken image. Write
the part-level slots too, and verify by re-reading each row.

⚠ **The same leaked image can be stored twice under DIFFERENT ids.** Presbyterian
High 2025 EM P1 Q22 held the completed possibility diagram at both
`image_url[0]` and `parts[0](a).image_url_after` with different filenames, so a
removal keyed on the first path left the second live. After any removal, grep the
whole row (`image_url`, `images`, `parts`) for any image, not just the old path.

## 7. Handing this work to another session / Claude account

Everything needed to continue lives in **this repo + the database**. A session
scratchpad does NOT travel and does not need to: the durable state is
`figure_flags` (what is left, and who holds it) and `figure_clean_log` (what was
done, and how to undo it).

**On the same Mac, another Claude account needs nothing extra** — same repos,
same `.env.local`, and this doc. On a different Mac: clone both repos
(website + `adrianmath-telegram-math-bot` for `lib/figures/`), copy
`.env.local`, and follow `docs/CLOUD.md` for the secrets bootstrap.

### The loop, one batch at a time

1. **Claim** the next 50 (see §3). Use a distinct `claimed_by` label, e.g.
   `<account>-batch-N`. Never work unclaimed rows — a peer may hold them.
2. Resolve each flag's **working path**: the flagged path can be stale (the
   figure was replaced since). If `figure_flags.path` appears in neither
   `image_url` nor `parts`, work on the question's CURRENT image instead, and
   remember the flag path so you can close the right row afterwards.
3. **Spawn agents** (6–7 figures each, no more than ~4 at once — 8 concurrent
   agents viewing full-size scans stalled the watchdog). Tell each agent to
   downscale before viewing (`sharp(...).resize({width:900}).jpeg()`), finish
   one figure completely before starting the next, and prefix its scratch
   scripts (`g1-`, `g2-`, …) — they share a directory.
   The brief that works is §5 plus: *match the original's relative font sizes*
   (the commonest review complaint), *render SVG at density 200*, *invent
   nothing*, *append (never rewrite) the shared manifest*.
4. **Build a review sheet** — numbered, each pair labelled `#N · School Year
   Level Qn` with the treatment used, original left / repaired right, skips
   listed at the top. Adrian rules on it by number. Nothing is applied before he does.
5. **Apply** the approved ones (§5 last paragraph), then close each flag by its
   ORIGINAL flag path and clear `claimed_by`.
6. If you abandon a batch, null out its `claimed_by` so the rows return to the queue.

### What produced these results (match this setup)

- **Model.** Batches 1–2 ran on **Claude Fable 5**; batches 3–4 on **Claude Opus 5**
  (Adrian switched the session model mid-run with `/model`). Both cleared his
  review wholesale, so either tier works — but do not drop to a small model:
  the quality comes from the agent *reading the scan and the question* and
  deriving geometry, which is vision + reasoning work.
- **Effort.** No per-agent `model` or `effort` override was ever passed. Agents
  are spawned with `subagent_type: "general-purpose"` and simply **inherit the
  session's model and effort**, so set the session where you want it and leave
  the Agent calls alone.
- **Shape.** 50 figures per batch → 6–8 agents of 6–7 figures each. Each agent
  ran long and hot (roughly 80k–360k tokens, 16–170 tool calls) because it views
  the scan, zooms, computes, renders, re-views and iterates. That per-figure
  scrutiny IS the product — a cheaper pass produces plausible-looking figures
  that quietly contradict the paper.
- **What actually drives quality** (in rough order): telling the agent the
  stored image is ground truth and the brief is only a hint; making it COMPUTE
  geometry from the question's own stated values rather than eyeball the scan;
  demanding the lightest treatment (crop before redraw); and requiring it to
  view its own output and iterate. Several agents caught paper-level and
  answer-key errors this way — that only happens if they verify against the
  marking scheme.

### Watch-outs that have already cost time

- Applying by the *target* path silently fails to close flags whose path was
  stale — the figure gets fixed but the question stays gated out of serving.
  Verify: no rows left with your `claimed_by` and `status='open'`.
- A repaired figure whose DATA is still incomplete (a truncated crop) must stay
  `open` with a `re-extract needed:` note — art quality is not the only test.
- Not every flag is a drawing problem. Roughly 1 in 8 is an extraction defect —
  the wrong page stored (formula list, whole exam page), a crop that slices off
  data, or question text baked into the image. Those need the source paper
  (§6), not a redraw.

> **Findings from batches 6–9 that are NOT figure defects** — wrong stored
> answers, leaked question text, orphaned images, and upstream damage classes —
> are collected in [`docs/FIGURES-FINDINGS-2026-09.md`](FIGURES-FINDINGS-2026-09.md).
> Read it before trusting a stored answer on any question those batches touched.

## 8b. Watermarks (2026-09-03 — 19 CLEANED AND APPLIED)

Batch `opus-watermark-2026-09-03`. All 19 verified by eye before writing and
signed off by Adrian; originals kept, every swap in `figure_clean_log`.

- **Two sweeps over all 3,224 swept figures found 19 stamped**, not 18 — the
  second pass caught Raffles Girls 2013 Q13 that the first missed.
- **3,030 questions returned to serving** (3,168 blocked → 138). The swept corpus
  is fully resolved: **zero swept-but-unstamped** remain.
- Still blocked: **138 figures that were never in the sweep index at all.** They
  have had no examination of any kind. That is the whole remaining gap.

**Four stamp mechanisms**, so probe before reaching for pixels:
1. a deletable `/Artifact <</Subtype /Watermark>>` block wrapping a form, at
   `/ca .0599976` (6% opacity);
2. a **PDF annotation** `/Type /Annot /Subtype /Watermark` with an `/AP` stream —
   and on that paper `/TT7` Calibri is REAL question text, so a font-based strip
   destroys content;
3. **flattened into the pixels** (OCR'd scan, no watermark token) — recover the
   plate as the per-pixel MEDIAN across all pages, then invert
   `displayed = 0.94·true + 15.3`;
4. **baked into the bank PNG** by the extraction pipeline (the bank image is
   byte-identical to the DOCX media) — re-extract from the paper's PDF twin.

**Removing a 6% overlay makes a figure DARKER.** Pixels that "appear" after
cleaning are recovered content, not invention — the wash had lifted them above
the ink threshold. Check their original grey before calling it damage.

### Three ways a stamp evades a scan — all measured, not assumed
- **Graph paper.** The grid fills the pale band and masks the lattice. Both of
  the band pass's two false negatives were graph paper. Crop to the **margins**.
- **Ink-level stamps.** Raffles Girls 2015 Q5 prints *below 249* on a 96%
  pure-white tile; a pale-band view never raises it.
- **Levels-clipped crops with grey fill.** Raffles Girls 2013 Q13 scores 0.17%
  pale, so both passes cleared it — the stamp survives only where it lies over
  the figure's own halftone grey. The tell is **grey coverage, not pale
  coverage**: that figure is 30.5% grey (180–235), line art is 0–5%. Only
  **40 figures** bank-wide fit the profile (grey ≥ 10% and pale < 1%).
  **All 40 were swept 2026-09-03: 39 clean, 1 stamped (the known positive).
  This lane is CLOSED.**

  How to look, if it recurs — a plain **196–236 binarisation does NOT work**: it
  saturates the fill solid black and eats the letterforms. Two views do:
  a **band-pass** (blur r=3 − blur r=22), which keeps stamp-sized structure while
  killing dither grain and page-scale shading; and a **high-pass whose gain is
  measured inside the grey fill only** — take gain from the whole image and the
  black line art sets the scale, compressing a ~15-level stamp to nothing.
  Embed a known positive in every contact sheet as a live control so review
  sensitivity is proven rather than assumed.

  Three populations account for the 39 clean, and each is safe for a structural
  reason, not merely "no glyphs seen": **flat vector fills** (zero internal
  variance at 2–10× gain — no texture for a stamp to ride on at any opacity),
  **printed halftone/stipple** (irregular, no repeating unit), and
  **photographs** (structure follows the subject; apparent lattices converge and
  foreshorten rather than tiling at constant pitch).

⚠ **Autocorrelation is NOT a stamp test.** Graph paper, dotted grids and hatching
are periodic and score exactly like a tiled stamp. My automated verifier flagged
4 figures on this basis and **all 4 were false alarms**. Judge by eye, in-band.
Equally, an **ink-diff is meaningless across a resolution change** — downsampling
a higher-dpi re-render onto the bank grid shifts thin grid lines half a pixel and
manufactures thousands of phantom lost pixels.

**Write references by walking the row, not by naming fields.** The apply's first
pass updated `parts[1].image_url` on Raffles Girls 2015 Q1 and left the SAME key
in `parts[1].subparts[1].image_url`; a whole-row read-back caught it. Sub-parts
are a real level. Replace recursively and re-read the whole row to prove the old
key is gone.

## 8c. Traps that bit more than once (2026-09-03) — read before counting anything

**1. NULL kills a boolean, in SQL and in PostgREST. Three separate incidents in one day.**
- `.neq('image_watermark_status','clean')` does NOT match NULL rows. A count of blocked
  questions came back 9 when the truth was 170.
- In SQL, `NOT (figure_url IS NOT NULL OR image_watermark_status = 'clean')` evaluates to
  NULL when the status is NULL, so those rows match NEITHER branch and vanish from both
  sides of a total. shown + not_shown came to 5,937 against a family of 5,952 — 15 rows
  silently absent.
- Always `coalesce(<predicate>, false)`, or `IS DISTINCT FROM`, or fetch the NULLs with a
  separate `.is(col, null)` and union them.

**2. A dead `image_url` does NOT mean a missing figure.** `figure_url` is the fallback and
`figureServable()` honours it. Eight EM/AM questions were classified as "picture missing"
because their primary key 404s; every one had a working `figure_url` returning 200 and was
serving correctly. **Check the fallback, and check it by FETCHING, not by reading the row.**

**3. An agent's own verdict is a claim, not evidence.** Re-verifying 43 solution-image
"apply" verdicts against a stricter gate failed 5 — and in every one of the five the
report's own text was FALSE:
- "no readable KIASU wordmark, runner, phone number or URL" — all four readable.
- "no readable branding" — the runner fully readable, on the figure carrying the
  competitor's phone number.
- "0 lost, 0 gained" — 918 px gained, a black 1-px column from an RGBA→RGB flatten.
- `flags: null` — the re-render had written a part label "(i)" into a figure answering
  part **(ii)**, filling a rectangle the bank had deliberately blanked.
**Read the evidence beside a verdict, never the verdict alone.** One file sitting in `out/`
marked ready destroyed 64.5% of its own non-white content.

**4. Distinguish an attempt-fault from a source-fault before sending anything to redraw.**
Two of those five were fixable in minutes (restore the blanked corner; write the
transparent column as white). Redrawing them would have discarded a recoverable original
in favour of a reconstruction — strictly worse. Only a fault in the SOURCE justifies a redraw.

**5. A shared cache propagates a wrong answer as fast as a right one.** 32 papers were
cached `"route":"flat-field"` before we learned division is the wrong inverse for an
alpha-blend stamp. Corrections must be APPENDED (never rewrite a shared append-only log —
a concurrent writer's lines are destroyed), and readers must dedupe by **LATEST**, not by
richest: a correction is usually shorter than the entry it fixes. Entries carrying
`supersedes` win.

**6. Never derive a structured fact by grepping prose.** A correction pass skipped a paper
because its note contained the word "subtraction" — in the sentence *"any plate subtraction
punches holes in content"*, i.e. a warning that it FAILS. Decide from `route` / `worked` /
`supersedes`; `notes` is for humans.

## 8. State (2026-09-02, evening — QUEUE CLEARED)

- **~3,970** repairs applied across the bank (`figure_clean_log`), of which
  **265 in `opus-figures-2026-09-02`**: 249 swaps · 6 removals (5 answer leaks +
  1 orphan page) · 6 additions of figures that were missing entirely · 1 split ·
  16 part-level or `images[]` writes.
- **Adrian's flag queue is CLEARED: 569 flagged → 568 fixed, 1 open.** The single
  open flag is DHS 2021 JC1 Promo P1 Q5 (a colour rocket illustration; only its
  cross-section inset is redrawable, awaiting Adrian's call).
  Batches 6–13 all applied. 103 of the 363 reviewed figures turned out to have
  **no defect** — Adrian flags fast by eye, so roughly 1 in 3 was already fine.
- **421 of the 541 questions** behind those flags now pass the serving gate.
  The remaining ~120 are held by `image_watermark_status`, not by figure quality.
- **6** questions have no image anywhere; Pierce 2024 EM_NA Q18 is a known total
  loss (absent from every source copy).
- **A flag is sometimes an answer leak, not a drawing fault.** ASRJC 2021 JC2 P2
  Q4 carried the marking scheme's own answer sketches for parts (b)(ii) and
  (b)(iv) in `image_url` — on the parts that ask the student to sketch. Two
  agents caught it independently; the tell is **colour**, since question papers
  are monochrome. The fix is removal from `image_url` (logged with
  `new_path='(removed)'`), not repair. Check for this whenever a flagged figure
  looks *too* complete.
- **Redraws leave `image_watermark_status` behind.** Closing the flag is half the
  release: 9 of this batch's 27 questions were still gated on a NULL watermark
  afterwards. A redrawn figure is vector art with no watermark possible, so it
  can be set `clean` on sight — but it must actually be set, or the repair
  changes nothing. Verify with the gate predicate, not the flag table alone.
- **Known, NOT being worked here:** ~1,015 questions exist as duplicate rows
  where one twin has an empty stem (sampled and confirmed — e.g. EJC 2021 JC2
  Q1 has the stem on one row and the parts on the other). That is an extraction
  defect, not a figure defect, and it is why some wrong figures are attached to
  the empty-stem twin.
