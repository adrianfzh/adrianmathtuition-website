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
| `figure_flags` | **Adrian's eyeball review** (`/admin/figures-bank`) + repair batches | one row per image he flagged as needing work. `status` `open`→`fixed`; `claimed_by`/`claimed_at` = cross-session claim. |
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
  where status = 'open' and claimed_by is null
  order by created_at limit 50
);
```

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

## 7. State (2026-09-01)

- **3,582** repairs applied across **3,399** questions (`figure_clean_log`):
  2,284 auto bleed-clean · 1,198 vision-approved clean · 14 grey-background
  normalise · 18 targeted cleans · 57 redraws · 11 recovered missing figures.
- **Adrian's flag queue: 569 flagged, 78 fixed, 491 open** — worked in ~50-figure
  batches (agents draw → Adrian vets a sheet → apply).
- **6** questions have no image anywhere; Pierce 2024 EM_NA Q18 is a known total
  loss (absent from every source copy).
