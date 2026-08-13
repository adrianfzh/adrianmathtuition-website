---
name: revision-worksheet
description: >
  Build Adrian's revision worksheets as .docx by taking one of his EXISTING documents as
  the base and appending a fresh "Practice" section of real past-paper questions pulled
  from the math Supabase question bank. Two kinds: "notes" (base = a notes-bank fragment
  from Dropbox/AdrianMathNotes/Practice/<folder>/notes_bank, i.e. Adrian's own formulas + Reminders) and
  "worked" (base = an existing "(With Worked Examples)" sheet from Dropbox/AdrianMathNotes/Revision).
  Trigger whenever Adrian asks for a revision worksheet / revision sheet / notes-plus-practice
  for a topic — e.g. "revision worksheet, S4 AM Binomial Theorem, notes, 8 questions",
  "make the worked-examples revision sheet for AM Partial Fractions", "revision sheet for
  S4 EM Matrices with 10 questions". ALSO trigger on the shorthand "rw" as the first word of
  a terse comma-separated request — "rw, am circles, worked", "rw am partial fractions notes
  10", "rw jc integration worked" — where the remaining fields are, in any order, the folder
  or bank, the topic, the kind (notes|worked), and optionally a question count. NOT the same
  as create-worksheet: that one authors a worksheet from scratch; this one clones an existing
  document and appends practice.
---

# Revision Worksheet Skill

Two kinds of revision worksheet, both produced the same way: **byte-clone one of Adrian's
existing `.docx` files, then append a Practice section to it.** Nothing about the base is
re-rendered, re-styled, or re-flowed — his fonts, OMML equations, images, headers and
relationships survive exactly because the file is cloned and only `word/document.xml` is
mutated.

| Kind | Base document | Result | Lands in → kiosk button |
|---|---|---|---|
| `notes` | Notes-bank fragment (`notes_bank/<BANK>/<Topic>.docx`) — Adrian's formulas + his "Reminders" section | Fragment verbatim, then `Practice` | `Practice/<folder>` → **Practice** |
| `worked` | Existing revision sheet (`Revision/<FOLDER>/… (With Worked Examples).docx`) | Whole worked sheet verbatim, then `Practice` | `Revision/<folder>` → **Revise** |

Requires `pandoc` (equation conversion), `python-docx` + `lxml`, and the sibling
[`create-worksheet`](../create-worksheet/SKILL.md) skill — its `worksheet_lib.py` is the
LaTeX→OMML converter and the source of the house style. **Do not reinvent equation
rendering here.**

## Invocation

Adrian phrases it in prose. Map it to a CLI call:

| He says | You run |
|---|---|
| "revision worksheet, S4 AM Binomial Theorem, notes, 8 questions" | `--kind notes --bank S4_AM --topic "Binomial Theorem" -n 8` |
| "revision worksheet, S4 AM Binomial Theorem, worked" | `--kind worked --folder AM --topic "Binomial Theorem"` |
| "revision sheet for S4 EM Matrices, 10 questions" | `--kind notes --bank S4_EM --topic "Matrices" -n 10` |
| "…using fragment 'Calculus Applications (All)', practice from 'Integration (Applications)'" | `--fragment "Calculus Applications (All)" --practice-topic "Integration (Applications)"` |

**The `rw` shorthand.** `rw, am circles, worked` is the same request in four words. Fields
come in any order and case doesn't matter: `rw` first, then the folder/bank, the topic, the
kind, and optionally a bare number for the question count.

| He types | You run |
|---|---|
| `rw, am circles, worked` | `--kind worked --folder AM --topic "Circles"` |
| `rw am partial fractions notes 10` | `--kind notes --bank S3_AM --topic "Partial Fractions" -n 10` |
| `rw, em matrices, notes` | `--kind notes --bank S4_EM --topic "Matrices"` |

Resolve it, then **say what you resolved it to before building** — `am` alone does not say
S3 or S4, and a bare topic can match more than one sheet (`Polynomials` vs `Polynomials 2`).
One line naming the base file is enough; do not stop and ask unless resolution is genuinely
ambiguous, in which case list the candidates rather than guessing.

```bash
python3 <skill-dir>/revision_lib.py --kind notes  --bank S4_AM --topic "Binomial Theorem" -n 8
python3 <skill-dir>/revision_lib.py --kind worked --folder AM  --topic "Binomial Theorem" -n 8
```

Default question count is **8**. When Adrian does *not* name a count, prefer
`-n 12 --minutes 55` and let the size budget decide — see *Sheet shape*, rule 1.
Always print the run report (below) back to Adrian.

### Flags

| Flag | Meaning |
|---|---|
| `--kind notes\|worked` | required |
| `--topic "<Topic>"` | canonical topic; used for both base resolution and the DB query |
| `--bank S3_AM\|S4_AM\|S3_EM\|S4_EM` | notes bank (kind=notes) |
| `--folder AM\|EM\|S1\|S2\|JC\|AM G2\|EM G2` | Revision subfolder (kind=worked) |
| `-n N` | number of practice questions (default 8) |
| `--practice-topic "<T>"` | DB topic when it differs from the base's topic |
| `--fragment "<name>"` | force a specific notes fragment, skipping resolution |
| `--base <path.docx>` | force any base document outright |
| `--level AM\|S3_AM\|EM\|S3_EM\|S1\|S2\|JC` | override the level mapping |
| `--out <path>` / `--suffix " (TEST)"` | exact output path, taken verbatim / suffix on the **default** filename (ignored when `--out` is given) |
| `--seed N` | reproducible question pick |
| `--minutes M` | trim to ~M minutes of working (rule 1); never below 8 questions |
| `--optional N` | `(Optional)` divider before the last N questions (rule 2) |
| `--drop-parts "3:a,b 7:a"` | keep only the sub-parts taught (rule 3); numbers are sheet numbers |
| `--link "<Topic>"` | append one question tagged with BOTH topics (rule 4) |
| `--json` | print the selected questions in full — read this to choose `--drop-parts` |
| `--no-ai` | exclude `AI Generated` rows (real past papers only) |
| `--show-source` | print school/year/paper under each question |
| `--space N` | extra blank working lines beyond `marks` (default 2) |
| `--page-break` / `--no-page-break` | force Practice onto a new page or not |
| `--dry-run` | resolve + select + report, write nothing |
| `--list` | list available fragments / sheets and exit |

## Content source 1 — notes bank (kind=notes)

```
~/…/AdrianMathNotes/Practice/AM/notes_bank/{S3_AM,S4_AM}/<Topic>.docx
~/…/AdrianMathNotes/Practice/EM/notes_bank/{S3_EM,S4_EM}/<Topic>.docx
```

**Moved here 2026-08-12** from a single top-level `notes_bank/`. Adrian: "put the
notes_bank into the corresponding practice folders and their corresponding levels
themselves, so it's easy to manage" — the fragments now sit beside the sheets they
feed. Resolve with `revision_lib.bank_dir(bank)`; never join a path by hand, and note
there is no longer a single root that contains all four banks. Nesting under
`Practice/` is safe only because every base scan is a NON-recursive `glob("*.docx")`
— make one of them recursive and the fragments get picked up as worksheet bases.

**The filenames are the registry.** Adrian adds new fragment files whenever he likes;
nothing in this skill hardcodes a topic list, and no fragment ever needs registering.
`--list` re-reads the folder each run.

Resolution is a four-stage cascade, and the stage used is always reported:

1. **Exact** filename match (`Binomial Theorem.docx`).
2. **Fuzzy** — case-, punctuation- and bracket-insensitive, then a difflib similarity
   pass (≥ 0.86). So "binomial theorem", "Binomial theorem (AM)" and "Binomial-Theorem"
   all land on the same file.
3. **Grouped "(All)" fallback** — many topics live inside a combined sheet rather than
   having their own file. `Integration (Applications)` has no fragment of its own, so it
   resolves to `Calculus Applications (All).docx`. Matching is done against the real
   `*(All)` filenames present in the folder (group/qualifier keywords are hints for
   scoring only, never a hardcoded mapping).
4. **Fail loudly** — never silently. The run stops with the 5 closest names in that bank,
   plus any other bank where the topic *does* exist:

```
RESOLUTION FAILED: No notes fragment for 'Vectors in Two Dimensions' in S4_AM.
Closest names:
   Coordinate Geometry
   Indices
   Calculus Applications (All)
   Trigonometry (All)
   Partial Fractions
```

**Always tell Adrian which fragment was used** — the report's `Fragment:` line, and for a
grouped hit the follow-up line explaining why:

```
Fragment  : Calculus Applications (All)
            ^ 'Integration (Applications)' has no fragment of its own; it lives inside
              the grouped sheet 'Calculus Applications (All)'
```

### Notes sheets get a title block (kind=notes only)

A fragment opens straight on its bold topic name — fine as a bank entry, wrong as a
handout. Adrian's own worked sheets carry a two-line centred heading, and he asked for the
same on notes (*"should have a title for notes (like examples)"*, 2026-08-06), so
`build_title` reproduces it glyph-for-glyph:

```
        Sec 3 Additional Math Revision      ← TNR bold 9.5, centred (BANK_TITLES[bank])
              Binomial Theorem              ← TNR bold 11, centred
Notes:                                      ← TNR bold 10, underlined, left
```

This is the **one** place the document departs from 9.5 pt, which is why `_apply_title`
runs *last*, after `_normalize_house_style` — the normaliser would otherwise pull the
title back to body size. `_apply_title` also **replaces** the fragment's own leading
heading when it is just the topic name or the file stem (so the topic isn't printed
twice); otherwise it inserts above it.

`kind=worked` is untouched — those sheets already have Adrian's heading.

### The Reminders bullets are real equations (converted 2026-08-06)

Every fragment's **Reminders** block was originally typed as plain text with Unicode
stand-ins — `(a+b)ⁿ`, `(2x)³ = 8x³`, `T(r+1)`. Next to the fragment's own formulas, which
are genuine OMML, they read as a different document: upright variables, one-glyph
"superscripts", and nothing Word can restyle. Adrian asked for real equations, so
**`reminders_to_equations.py` rewrote all 65 mapped fragments in place** — 460 equations,
0 Unicode pseudo-math left in the bank.

The LaTeX is frozen in **`reminders_latex.json`** beside the script (fragment key → list of
bullet strings, mathematics inside `$…$`), so the conversion is auditable and reversible
without re-running a model. The script is the deterministic half: read the map, rebuild
each bullet as `•  ` + TNR 9.5 runs interleaved with OMML from the same pandoc converter
the practice section uses.

```bash
python3 reminders_to_equations.py --dry-run          # report, touch nothing
python3 reminders_to_equations.py --only S4_AM/Binomial
```

It is **safe to re-run and safe on new fragments**: a bullet is rewritten only when it has
no OMML yet *and* the mapped LaTeX has real mathematics, and only after the whole block
passes a prose gate — same bullet count, and every bullet's ordinary words identical once
symbols and `\commands` are stripped from both sides. A shifted or stale map fails that
gate and the fragment is skipped with a message, never half-written. **A fragment Adrian
adds after 2026-08-06 simply isn't in the map and is left alone** — write its Reminders as
equations in Word, or add its bullets to the JSON.

> ⚠ These are **Adrian's editable sources**, not generated output. Back the bank up before
> any real run, from `AdrianMathNotes/`:
> `tar -czf notes_bank_backup.tar.gz Practice/AM/notes_bank Practice/EM/notes_bank`.

### Font size — one pass, already applied

Every fragment was authored from a different formula sheet, so sizes were mixed: on
2026-08-12 all 66 files carried more than one, and most content sat at **6.5–7 pt**
against 9.5 pt prose — a tiny heading over tiny equations with normal-size bullets.
Output never showed it (`_normalize_house_style` pins the build to 9.5 pt), only the
sources did. `normalize_notes_bank.py` applies that same size pass to the bank:

```
python3 normalize_notes_bank.py            # dry run
python3 normalize_notes_bank.py --apply
```

Size only — line spacing and page geometry are left as Adrian authored them. It skips
any file with a `~$` Word lock, because a rewrite would be silently undone by the next
save in Word. Run it after adding a fragment from a new source sheet.

## Content source 2 — worked-examples sheets (kind=worked)

```
~/Library/CloudStorage/Dropbox/Apps/AdrianMathNotes/Revision/<AM|EM|S1|S2|JC|AM G2|EM G2>/
```

Filenames carry ordering digits and decorations — `3 REV AM Binomial Theorem (With Worked
Examples).docx`, `O REV 02 Polynomials and Partial Fractions (With Worked Examples).docx`.
The resolver strips that noise (`REV`, `REVISION`, `N LEVEL`, `JC1`, `AM`/`EM`/`G2`,
leading digits, `copy`, `amended`, `(With Worked Examples)`, `Practice`) before matching,
scores a "with worked examples" variant above a bare one, and penalises decorated
duplicates (`… 2`, `… (Without Graphs)`).

If nothing matches, it says so and lists what the folder actually has — same failure
format as above. **`Revision/AM G2` is currently empty**, so any `--folder "AM G2"` request
will fail that way until Adrian puts sheets in it.

### Building a NEW worked-examples sheet from the bank (first built 2026-08-13)

The kinematics proof-of-concept: `30 Kinematics Revision (With Worked Examples) (Past
Papers) (S4).docx` in `Revision/AM` — a bank-sourced twin of Adrian's authored sheet
(subtitle carries the differentiator: *Kinematics (Past-Paper Edition)*). Reference build:
[`bank_worked_sheet.py`](bank_worked_sheet.py) — copy-adapt per topic; everything
layout-mechanical is already solved in it, only the content changes.

Pipeline:

1. **Mirror the authored sheet** when one exists: dump it paragraph-for-paragraph (OMML
   linearized, bold/italic/size flags, tables interleaved) and reuse its Notes text
   verbatim + its conventions (page breaks before Examples/Practice, padded literal part
   labels in Examples, auto-numbered Q/SQ in Practice, `[Ans:]` per question).
2. **Fetch the topic pool** (content source 3 below). Hand-pick ~6 worked examples for a
   teaching arc (each gets a bold `concept()` line naming what it teaches); pick practice
   via `select_questions` (seeded, tiered, diversity-greedy).
3. **Exclude the authored sheet's questions from practice** — Adrian's authored Practice
   sections are themselves bank-sourced (kinematics: 11/14 found verbatim by
   fragment-regex against the pool). Exclude them AND the worked-example picks so the two
   sheets share zero questions and can be used together.
4. **Solve everything yourself.** Bank `solution` fields are untrusted reference only, and
   part-level `answer`s contain real errors (kinematics e5252acf (b): part-ans 8⅓ is just
   s(2); the asked-for total distance is 12⅙). Every printed answer = own verified
   computation; check part marks sum to `total_marks`.
5. **Build with create-worksheet's `worksheet_lib`** (`Worksheet()`: title/subtitle/
   concept/example/para/Q/SQ/ans/figure/solution_box/page_break), then render-verify via
   Word→PDF page by page.

Gotchas that already bit (all handled in the reference build):

- Bank text carries bare-superscript fragments — `ms$^{-1}$`, `2$^{\text{nd}}$` — whose
  `$…$` content is invalid LaTeX alone; rewrite `$^` → `${}^` before `split_math` or
  pandoc silently drops the unit exponent.
- Storage-bucket JPEGs can lack JFIF/Exif headers → python-docx `UnrecognizedImageError`
  even though the file is a valid JPEG; re-encode via PIL to PNG first.
- `parts` can arrive scrambled — Methodist d5605b0a came (iii),(ii),(i); sort by label
  (roman map when all labels are roman, else alpha) before rendering.
- A part with `subparts`: render the part stem as `SQ(parts)` with **no** marks, then each
  subpart as a literal padded `"(i)  "` paragraph with its own marks and
  `left_indent Cm(1.4)`. Pad with `f"({sp['label']}) ".ljust(5)` — trailing space INSIDE
  the f-string — or the 5-char `(iii)` gets zero padding and glues to its text (bit on the
  trig-ratios sheet, 2026-08-14; the space guarantees ≥1 gap while `(i)`/`(ii)` spacing is
  unchanged).
- Practice questions have no `solution_box` to keep-together them — after `ans()`, set
  `keep_with_next` on `ws._block_paras[:-1]` and clear the list, or questions straddle
  pages.
- Examples use literal padded labels (`"(i)   "` ljust 6 roman / `"(a) "` ljust 4 alpha) +
  `marks=` for the right-tab `[n]`; `SQ` auto-numbering is for the Practice section only.

Provenance (school/year/paper/question) stays OFF the sheet — house default — and goes in
the delivery message instead.

## Content source 3 — practice questions (math Supabase `questions`)

Credentials come from the repo's `.env.local`, parsed with a **real dotenv parser**
(`python-dotenv`, hand-rolled fallback) — **never grep/sed**: the stored values carry
escaped `\n` and naive extraction produces a URL with a stray `\` and a 2-char-longer key
(the documented `CLAUDE.md` gotcha; it has bitten before). Values are whitespace- and
trailing-`\n`-stripped. Reads `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) +
`SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) and talks to PostgREST directly.

Filter (all applied server-side):

- `deleted_at=is.null`
- `topics=cs.{"<CanonicalTopic>"}` — array containment
- figure questions are INCLUDED since 2026-08-12 (their images embed — see below);
  `--no-figures` restores the old `has_image=is.false` exclusion
- `level=eq.<mapped level>`
- `order=id.asc` — **paging is only stable with the explicit `.asc`.** Plain `order=id`
  silently drops and duplicates rows across pages (it once turned a 148-row topic into 8).

Level mapping:

| Bank / folder | DB level(s) |
|---|---|
| `S4_AM`, folder `AM` | `AM` |
| `S3_AM` | `S3_AM` first, topped up from `AM` |
| `S4_EM`, folder `EM` | `EM` |
| `S3_EM` | `S3_EM` first, topped up from `EM` |
| `S1` / `S2` / `JC` | `S1` / `S2` / `JC` (`JC` currently has 0 rows) |

Rows are then quality-gated in Python; every rejection reason is counted in the report:

- answer must be non-empty, or every sub-part in `parts` must carry an `answer`
- no sub-part with empty text (incomplete extraction)
- `has_image=true` with no stored image file → rejected (flagged but nothing to embed)
- text references a figure/diagram/table AND the row has no stored image → rejected
  (with a stored image, the reference is fine — the figure is on the sheet)
- no markdown tables or image links in the body

Selection is tiered — real past-paper + `verified` first, then real, then verified
`AI Generated`, then the rest (`--no-ai` drops the AI tiers entirely). Within a tier it is
a diversity-greedy pick spreading marks bucket, difficulty and school, seeded by `--seed`
when reproducibility matters, and the final set is sorted ascending by total marks so the
sheet ramps up. No duplicates.

### Figures are embedded (2026-08-12)

Figure questions are IN. The bank stores every extracted diagram in the public
`question_images` Supabase Storage bucket (`image_url` = JSON array of paths,
`image_size` = `sm|md|lg` print hint), and the builder embeds them under the question
stem as inline drawings — `fetch_figures` downloads after selection, `FigureStore`
carries the bytes, and `clone_with_practice` writes `word/media/` + relationships +
content-type defaults so the two halves can never disagree. Width: sm 7 cm / md 10.5 cm
/ lg 14 cm, never upscaled past the image's natural 96-dpi size.

- **A question whose figure cannot be fetched is SWAPPED, never printed diagram-less**
  — the report's `Figures :` block lists every swap (`~ swapped in <school year …>`).
- Figures download on `--dry-run` too, so the sheet numbering a dry run shows (which
  `--drop-parts` takes) is identical to the real build's.
- Rows the sheet still cannot carry are skipped with honest reasons: `figure flagged
  but no stored image file`, `refers to a figure/table it has no stored image for`
  (text mentions a diagram, bank has nothing behind it), markdown tables.
- Empty-stem rows whose question IS the image (the extractor stored the whole question
  as a picture) are usable — the sheet shows the number, the image, and the marks.
- `--no-figures` restores the old exclude-at-query behaviour end to end.
- This unblocked the diagram-heavy topics: JC1 *Differentiation (Maximum and Minimum)*
  went from ~30% usable to 152/165 in the first live build (4 images on 3 questions).

## Sheet shape — Adrian's four rules (2026-08-11)

These came out of comparing a sheet Adrian built by hand against one another model
built from the same request. They are what makes a sheet *his*, and none of them are
about formatting — they are about what goes on the page and how much of it.

### 1. A sitting, not a paper — 8–14 questions, 45–60 minutes

A revision sheet is one sitting a student can finish in a evening, not a mock paper.
The count band is 8–14; the real constraint is **time**, estimated at
`MINUTES_PER_MARK = 1.5` (the O-Level/H2 exam rate: EM P1 is 80 marks in 2 h), so
45–60 min is **30–40 marks**.

- The run report always prints `Size : N question(s), M marks, ~T min of working`
  and warns when it lands outside either band. It never refuses.
- **Pass `--minutes 55` whenever Adrian doesn't name a count** (with `-n 12` or `-n 14`
  so there is something to trim from). The trim drops from the END — questions are
  sorted ascending by marks, so the longest go first and the ramp survives — and stops
  at 8 questions, warning instead of cutting deeper.
- Mark-heavy topics blow the budget at the floor: 8 Binomial Theorem questions is
  ~50 marks ≈ 75 min. Say so rather than silently shipping a 75-minute "45-minute
  sheet"; the fix is Adrian's call (fewer questions, or scope the sub-parts — rule 3).

### 2. One `(Optional)` divider, never per-question challenge tags

`--optional 2` writes a single bold `(Optional)` line before the last 2 questions.
Everything below it is extra; everything above is the sheet.

**Do not tag individual questions `(Challenge)` / `(Harder)` / `*`.** A tag hung off a
question tells a student mid-sheet that they may skip *this one*, and they will. One
divider tells them where the part they must finish ends — which is the thing worth
telling them. Because the set is sorted ascending by marks, the tail is already the
hard end; the divider just names it.

The divider is short and bold, so `_bind_section_heads` treats it as a heading and
chains it to the question below — a divider stranded at the foot of a page marks the
wrong boundary. The report stars the tail questions.

### 3. Scope the sub-parts to what has been taught

When Adrian says *"they've only done up to the product rule"* or *"they haven't seen
integration by parts"*, that is not a filter on topics — it is a filter on **sub-parts**.
A past-paper question whose (a)–(b) need untaught material and whose (c)–(d) don't is
still a good question: take (c)–(d).

The workflow, because sheet numbers only exist after selection:

```bash
# 1. see the actual questions (same seed AND same -n/--minutes/--link as the real run)
python3 <skill-dir>/revision_lib.py --kind notes --bank S4_AM --topic "Binomial Theorem" \
    -n 10 --seed 7 --dry-run --json
# 2. read the parts, decide, rebuild with the identical selection args + --drop-parts
python3 <skill-dir>/revision_lib.py --kind notes --bank S4_AM --topic "Binomial Theorem" \
    -n 10 --seed 7 --drop-parts "3:a,b 7:i"
```

⚠ **The selection is only reproducible when every selection argument matches** — same
`--seed`, same `-n`, same `--minutes`/`--link`. The picker is greedy over a seeded
shuffle, so a different `-n` is a different sheet, not a longer one. Label matching is
punctuation- and case-insensitive (`(a)`, `a.`, `A` all key on `a`) and this bank uses
`(i)`/`(ii)` at least as often as `(a)`/`(b)` — read the labels from `--json`, don't
assume.

Two things travel with a dropped part, both handled: the **marks total** (recomputed
from the surviving parts, which moves the writing space and the size budget) and the
**answer line** (a row-level `[Ans: …]` covers parts we just removed — it is rebuilt
from the surviving parts when they all carry answers, and kept with a loud
`Scope : … Check it.` note when it is the only answer there is). A drop that would
empty a question is refused, not silently applied.

### 4. One question that links two named sub-topics

When Adrian names two things — *"differentiation and kinematics"* — at least one
question should need both, and it goes **last**, as the capstone. `--link "Kinematics"`
finds a question tagged with both topics (the bank tags every topic a question touches,
so containment is exactly the right test), best tier first, and force-places it after
the ascending-marks sort.

If nothing in the bank carries both tags, the report says so plainly and adds nothing.
Do not fake it by picking a question that merely looks like it links — either choose a
different second topic (one that appears in the sheet's own `topics`) or write the
capstone with the [`create-worksheet`](../create-worksheet/SKILL.md) skill.

## The Practice section

Appended after the base content, in the house style inherited from `create-worksheet`
(Times New Roman 9.5 pt, 1.5 line spacing, marks right-aligned, `[Ans: …]` right-aligned
in orange `#843C0C`, navy `#1F4E79` heading):

- `Practice` heading (TNR **bold 9.5 pt, no colour** — it is our paragraph, not the
  base's, and a big navy heading read like a different document grafted onto Adrian's
  sheet), optionally preceded by a page break
  (`<w:br w:type="page"/>` in its own paragraph — default **off** for `notes` so the
  formulas stay visible beside the questions, **on** for `worked` so the practice starts
  clean). Where there is no page break there is a **blank paragraph** instead — without it
  `Practice` sat flush under the last Reminders bullet (*"should have a newline between
  reminders and practice"*, 2026-08-06).
- **Every run is Times New Roman 9.5 pt** — question text, part labels, marks, answers —
  written as explicit `w:rFonts` (ascii/hAnsi/eastAsia/cs) + `w:sz`/`w:szCs` = 19 on each
  run, never inherited — the heading too (it is bold, same size).
- **The question number never sits alone on a line.** When a question is all sub-parts
  (the common shape in this bank) the first part rides up onto the number's line:
  `1.<tab>(a)<tab>Write down, and simplify, …`, with the hanging indent set to the text
  column so wraps and the following `(b)`, `(c)` line up under it. Columns: number at the
  margin, labels at 1 cm, text at 2 cm. When the question *has* stem text, the number
  goes with the stem and `(a)` starts its own line.
- Marks as `[3]` **right-aligned on a tab stop at 15.5 cm** — Adrian's house position, set
  explicitly 2026-08-06 ("tab stops should be 15.5"). Every practice paragraph carries the
  stop, marked or not, so the column is identical down the page.
  **The stop is only safe with the gutter that comes with it.** The text column is 16 cm
  (A4 less 2.5 cm margins), so each paragraph also gets a **0.5 cm right indent**
  (`w:ind/@w:right = 283`): that pulls the wrap width in to 15.5 cm — exactly where the
  mark lands — so a long question can never run under `[n]` and strand it on the next
  line. Without the indent the text runs to 16 cm, the tab has nowhere to go, and Word
  drops the mark onto a line of its own. That was the bug, twice.
  Measured in Word's own PDF export: worked 83/83 and notes 16/16 marks at exactly
  15.5 cm, 0 orphaned.
- Working space: `marks + 2` blank lines (min 3, max 12; tune with `--space`). It is bound
  to its question — see *Nothing straddles a page break*.
- `[Ans: …]` right-aligned and **entirely orange, converted equations included** — see the
  OMML note under assembly.

### Page setup is imposed on the output

The notes fragments inherit formula-sheet layouts (odd margins, US Letter, the occasional
landscape section), so the output rewrites **every** `sectPr` — the body-level one and any
mid-document section break in `w:pPr/w:sectPr`:

| | |
|---|---|
| Margins | top 2 cm (1134), bottom 1 cm (567), left 2.5 cm (1417), right 2.5 cm (1417) |
| Header/footer bands | clamped inside the new margins |
| Page size | forced to A4 portrait (11906 × 16838) whenever it isn't already — landscape or Letter. A size within 0.05 cm of A4 is left alone. |

The run report says how many sections were normalised and names any page size it changed.

### House style is imposed on the WHOLE document, not just the Practice block

Styling only the appended paragraphs produced a two-formats worksheet: our practice in
9.5 pt on a 15.5 cm stop, Adrian's cloned formula sheet in whatever the source happened
to carry. He reported all of it at once on 2026-08-06 — *"font sizes not 9.5 / tab stops
should be 15.5 / make line spacing 1.5 lines"*. `_normalize_house_style` runs **after**
the practice is inserted, so base and practice are normalised together:

| | |
|---|---|
| Size | every `w:sz`/`w:szCs` → 19 (9.5 pt), and runs that carried **no** size get one, so nothing inherits the base's `docDefaults` (typically 11 pt) |
| Equations | `style_omml` over every `m:oMath`, including the `ctrlPr` glyphs Word draws itself — brackets, fraction bars, radicals |
| Line spacing | `w:line="360" w:lineRule="auto"` = 1.5 lines outside tables, `"276"` = 1.15 inside them (see below) |
| Marks | any far tab stop (≥ 14.1 cm — Adrian's sheets use 16 cm) is pulled back to 15.5 cm and given the 0.5 cm gutter |
| Inline marks | a trailing `" [n]"` typed as ordinary text, with no tab, is split out of its run and put on the stop |

**Forcing 9.5 pt does not flatten superscripts.** Word derives script sizes from the base
run size at render time: Adrian's own fragment stores base `a` and exponent `n` at the
*same* 6.5 pt, yet Word draws them at different sizes. Pinning every run to 9.5 pt
therefore *scales* equations rather than squashing them — the rendered PDF shows 9.6 pt
body with 6.5/5.5/5.0/4.6 pt script levels underneath it, all generated by Word.

> ⚠ `w:pPr` and `w:rPr` are ordered sequences, not bags. A child inserted in the wrong
> position makes Word declare the file unreadable. `_order_ppr`/`_order_rpr` re-sort after
> every insertion — use them for any new property you add.

The `tabbed` test in the inline-marks pass checks **every** run in the paragraph, not
`runs[:-1]`: Adrian's sheets put `<w:tab/>` and the `[n]` text inside a *single* run, so
the narrower test read those as untabbed, appended a second tab, and wrapped 54 marks onto
their own line.

### Nothing straddles a page break (2026-08-06)

Adrian asked for two things in one breath: *"questions or parts of questions should start
on a new page, do not want writing space to span across two pages"* and *"worked examples
… should not span two pages if they can fit into one (unless its a really big example)"*.
Both are the same mechanic — bind a block, then make the block short enough to fit.

**Binding.** OOXML has no "keep this together" property, so it is spelled out:

- **Practice** — `build_practice` groups each question, or each sub-part, with its own
  writing space into a *unit*, and `_unit()` puts `w:keepNext` on every paragraph but the
  last. The answer line joins the final unit. A stem that only introduces sub-parts is
  left open (`closed=False`) so it stays glued to the first part.
- **Worked examples** — `_keep_blocks_together` marks every `w:tr` `cantSplit`, puts
  `keepNext` on every row except the last, and walks *backwards* from the table via
  `_example_head` to pick up the question stem and an optional section heading
  (`"Finding n"`). Binding only the paragraph directly above the table is not enough: it
  left `3. (i) Write down…` at the foot of page 2 with its whole solution on page 3.
  The walk stops at the previous table or a page break so examples never chain, and gives
  up after 40 paragraphs.
- **Section headings** — `_bind_section_heads` chains a heading to the whole of the first
  question beneath it, so a heading with no room under it moves to the next page instead of
  clinging to the last inch. See *A section heading moves with its first question*.

**Shortening.** Binding alone made things *worse* — a box that no longer fit moved
wholesale to the next page and left a near-empty one behind (13 pages, one ending at
y=143). The fix is the in-table line spacing: 1.5 is for reading and for writing space,
but nobody writes inside a solution box, so there it is pure height. Table paragraphs are
set to **1.15** — not an invented value, it is the tighter spacing Adrian already uses
elsewhere on the same sheets — which takes ~23 % off every box.

Measured on `3 REV AM Binomial Theorem`: 13 pages → **12**, and the notes portion lands on
**8 pages, exactly matching Adrian's untouched source**. Across three AM sheets (Binomial,
Partial Fractions, Polynomials) 22 solution boxes render with **1** split, and that one
example is 784 pt against ~757 pt of page — a genuine overflow, i.e. the "really big
example" escape working as intended. Word drops `keepNext` when it cannot honour it, so
oversized blocks degrade instead of looping.

> Blank spacer paragraphs are collapsed by `_compact_blanks`, which **must** run before the
> practice block is inserted — our writing space is made of exactly those paragraphs, and
> collapsing it afterwards would delete the space students write in.

> ⚠ `_in_table` walks `iterancestors()` rather than pre-collecting table paragraphs into a
> set of `id(p)`. lxml hands out element **proxies**: the ids get recycled as proxies are
> collected, so the set silently answers at random. That bug made the whole table rule a
> no-op while every count still looked plausible.

### A section heading moves with its first question (2026-08-06)

*"Practice should be on a new page IF THERE IS NOT ENOUGH SPACE AT THE CURRENT ONE … so
that it is not cluttered."* — Adrian, on a page whose last inch held his own
**"Binomial Theorem Practice"** heading plus question 1, with the `[Ans: 71/9]` stranded
alone at the top of the next page.

Note **whose** heading that was. Our generated Practice block always starts a fresh page
(`page_break=True`), so it was never the culprit; the cluttered heading was authored inside
the source worked-examples document. The fix therefore had to reach into the *cloned base
content*, not the generator — check which one you are looking at before debugging this.

There is no OOXML "start a new page if short of room". The way to express it is `keepNext`,
so `_bind_section_heads` chains the heading to the whole of question 1 and lets Word
relocate the group:

- **What counts as a heading** (`_is_section_head`) — a top-level paragraph, ≤ 60 chars,
  every text-bearing run bold, not itself a question. That catches
  `Binomial Theorem Practice`, `Finding n`, `Solution:` and the bracketed source tags
  (`[Binomial Theorem - AM Prelim 2019 Bowen P2 Q2]`), which must never be orphaned either.
- **Where the run ends** — at question 2, at the next heading, at a table (from there
  `_example_head` owns the chain), or after 10 paragraphs. The **last** paragraph of the run
  is deliberately left unbound, or the block would drag question 2 along behind it.
- **Finding question 2 is not a text match.** Adrian's practice questions are Word
  *autonumbered*: the number is not in the text at all, it lives in `w:numPr`. Only
  `ilvl` 0 opens a question — the deeper levels are its (i)/(ii) parts. `_is_item_start`
  reads `numPr` first and falls back to the `_Q_START_RE` text form our own generator emits.

Verified with a **seeded A/B** (`--seed 7`, same questions, only the code differing) on
`3 REV AM Binomial Theorem`: 12 pages → 12, 18 boxes → 18, 0 splits → 0, and exactly one
page changed — p4 now opens with `Binomial Theorem Practice` instead of the orphaned answer.
Notes sheets came out byte-identical.

> ⚠ Practice questions are **randomly sampled**, so two unseeded runs pick different
> questions and any page-count comparison between them is noise. An earlier "3 → 4 pages"
> scare on the notes sheet was exactly this. Always pass `--seed` when comparing layouts.

### Assembly rules (why it doesn't corrupt Adrian's documents)

- **Byte-clone, then mutate one part.** Every zip entry is copied verbatim in its original
  namelist order; only `word/document.xml` changes, and the new paragraphs are inserted
  immediately before `w:sectPr`. Part count in = part count out.
- **Inline run/paragraph properties only.** No `w:pStyle`, no style-id references, no
  `numbering.xml` edits — a style id that happened to exist in the base with different
  settings would silently restyle the practice, and adding numbering definitions would
  need a new part. Fonts, sizes, colours, alignment, indents and tab stops are written
  directly on each paragraph.
- **Numbering is cleared only when it needs to be.** `<w:numPr><w:numId w:val="0"/></w:numPr>`
  is emitted *only* if the base's `docDefaults`/default paragraph style actually carries
  numbering. Emitting it unconditionally put a phantom bullet on every practice line.
- **Every column gets an explicit LEFT tab stop.** A custom tab stop clears Word's default
  stops before it, so the number/label columns are spelled out rather than left to the
  hanging indent's implicit stop.
- **The skill's own output is excluded from base resolution.** `worked` worksheets land in
  `Revision/<folder>` — the very folder scanned for `worked` bases — so a second run would
  otherwise clone the first run's worksheet and compound the Practice section (this
  happened: 25 `[Ans:]` lines instead of 6). `list_worked`/`list_fragments` skip any stem
  matching `^REV .+\((Notes|Worked Examples)\)$`, which is exactly `default_out_path`'s
  naming and never matches Adrian's own `3 REV AM … (With Worked Examples)`.
- **Equations never abort the run.** All LaTeX in the selected questions is converted in a
  single batched `pandoc` call (≈38 equations in a couple of seconds), with a
  per-expression retry through `worksheet_lib._latex_to_omml`. Anything still unconvertible
  degrades to plain text for that one expression and is listed in the report as
  `FALLBACK (plain text): …`. The worksheet is always produced.
- **OMML runs are restyled after conversion** (`style_omml`). Pandoc emits `m:r` with no
  `w:sz` and no `w:rFonts`, so an equation inherits the *base document's* default size and
  body font — it comes out visibly larger than the 9.5 pt text beside it, and inside an
  orange `[Ans: …]` it stays black. Each math run gets `w:sz`/`w:szCs` = 19, `Cambria Math`
  (what Word itself writes on math runs), and the answer colour where applicable. `w:rPr`
  is a *sequence*, not a bag, so the injected children are re-sorted into CT_RPr order —
  out-of-order children make Word declare the file unreadable.
- **…and so do the OMML control properties.** Brackets, fraction bars, radical signs and
  big operators are glyphs the *element* draws, not an `m:r`: Word sizes them from the
  element's `m:ctrlPr`. Pandoc emits none, so those glyphs fell back to the base
  document's 12 pt default — tall parentheses and √ towering over a 9.5 pt equation, which
  only a rendered PDF shows (the XML check passed the whole time). `style_omml` now also
  injects `<tag>Pr/m:ctrlPr/w:rPr` on `m:d`, `m:f`, `m:rad`, `m:nary`, `m:sSub`, `m:sSup`,
  … — `<tag>Pr` first child, `m:ctrlPr` last inside it.

## Output

Default: `Dropbox/Apps/AdrianMathNotes/<Revision|Practice>/<folder>/REV <BANK-or-FOLDER> <Topic> (Notes|Worked Examples).docx`

**The kind picks the root folder, and the root folder picks the kiosk button.** Since
2026-08-11 `/kiosk` shows students three buttons — Learn (`Notes/`), Revise (`Revision/`),
Practice (`Practice/`) — each reading one folder per level. A `worked` sheet is what
"Revise" means (worked examples first); a `notes` sheet is what "Practice" means (summary
+ formulas, then questions). Both kinds wrote into `Revision/` before that date, which
would now file every practice sheet under the wrong button.

| Kind | Folder |
|---|---|
| `worked` | `Revision/<folder>` — the folder the base sheet came from, so the worksheet lands beside its source |
| `notes` | `Practice/<folder>`, with `S4_AM`/`S3_AM` → `AM`, `S4_EM`/`S3_EM` → `EM` (a notes bank has no folder of its own) |
| `--base` with no bank/folder | `~/Desktop` |

`--out <path>` overrides it. Say where it landed so Adrian can open it from Dropbox on any
device — and name the button (Revise / Practice) it will show up under on the iPad.

## Run report — print all of it, every time

```
Base      : …/notes_bank/S4_AM/Binomial Theorem.docx  (exact)
Fragment  : Binomial Theorem
Practice  : 6 question(s)  [levels AM:148]
            pool 148 -> usable 129
            skipped 16: a sub-part has no text (incomplete extraction)
            skipped  3: no answer
    1. Presbyterian High School 2024 Prelim P2 Q1     5 marks, Standard
    2. Anderson 2024 Prelim P1 Q3                     6 marks, Standard, verified
    …
Page      : margins 2/1/2.5/2.5 cm forced on 1 section(s)
Keep      : 9 solution box(es), 14 section heading(s) bound to what follows
Equations : 38 converted, 0 fallback(s)
Output    : …/Dropbox/Apps/AdrianMathNotes/Practice/AM/REV S4_AM Binomial Theorem (Notes).docx
```

Non-negotiable contents: **which base/fragment was used and how it was resolved**, the
question count with **per-question school/year provenance**, **any equation fallbacks**,
and **where the file was written**.

The `Keep` line exists because `keepNext` is invisible in both the XML checks and a casual
read of the render — if it says `0 section heading(s)` on a sheet that plainly has headings,
the detector missed them, and no amount of staring at the PDF will tell you that.

## Verification

```bash
textutil -convert txt -stdout "out.docx" | head -60           # text + structure
unzip -p "out.docx" word/document.xml | grep -o "m:oMath" | wc -l   # equations present
python3 -c "from docx import Document; print(len(Document('out.docx').paragraphs))"
```

**Quick Look lies about this file.** `qlmanage`/Preview renders OMML as blank, so equations
look missing. A control file generated by the proven `create-worksheet` skill renders
exactly the same way in Quick Look. Judge the output in **MS Word**, or by the XML checks
above — not by a thumbnail. (Same root cause as the LibreOffice/Cambria Math caveat in
`create-worksheet`.)

**Font problems are invisible to the XML checks — verify by RENDER.** The oversized
brackets/radicals bug passed every structural assertion (`w:sz` was 19 on every run,
because the offending glyphs are not runs). Export the file to PDF *from Word* (Word MCP
`open_document` → `export_pdf` → `close_document`) and inventory the glyphs:

```python
import pdfplumber, collections
with pdfplumber.open("out.pdf") as pdf:
    inv = collections.Counter((c["fontname"].split("+")[-1], round(c["size"], 2))
                              for p in pdf.pages for c in p.chars if c["text"].strip())
```

Read the sizes **relatively**, not absolutely: macOS Word's PDF export quantises font
sizes, so 9.5 pt comes out as `9.6` and 9 pt as `9.12`. The test that means something is
that our practice runs report the *same* number as Adrian's own `w:sz=19` body text in the
same PDF. Anything reporting the document default (12 pt → `12.0`) is a real bug.

The same PDF proves the other two house-style rules, and both are worth checking whenever
the layout code is touched:

```python
# marks column — every [n] should end at 15.5 cm from the left margin
LEFT, STOP = 2.5 * 28.35, 15.5 * 28.35            # cm -> pt
marks = [w for p in pdf.pages for w in p.extract_words() if w["text"].startswith("[")]
print(sorted({round(w["x1"] - LEFT - STOP, 1) for w in marks}))   # want [0.0] or [-0.1]

# line spacing — consecutive line tops in one block, want ~16.8 pt at 9.5 pt / 1.5 lines
```

**Page-break integrity needs the same PDF, and it has two distinct checks.** Neither is
visible in the XML — `keepNext` is a *request*, and whether Word honoured it only shows in
the render.

```python
# 1. no writing space carried over: EVERY page must start at the top margin (~56-58 pt).
#    A page whose first glyph sits lower began with the tail of the previous question.
print([(i, round(min(c["top"] for c in p.chars if c["text"].strip()), 1))
       for i, p in enumerate(pdf.pages, 1)])

# 2. no example split from its question. Word draws each solution-box border as thin
#    filled rects, NOT one big rect, so find_tables()/page.rects miss them entirely —
#    look for a tall LEFT vertical edge instead, then check the nearest preceding
#    numbered stem is on the same page.
boxes = [(i, e["top"], e["bottom"]) for i, p in enumerate(pdf.pages, 1) for e in p.edges
         if e["orientation"] == "v" and e["bottom"] - e["top"] > 40 and e["x0"] < 160]
```

Expect **0** on check 1. On check 2 a split is only acceptable when the example really is
taller than the ~757 pt text column — measure it before accepting it.

```python
# 3. no heading clinging to the foot of a page. Print each page's first line and read it:
#    a section heading should open a page or sit well above the bottom, never introduce
#    one or two lines and hand the rest to the next page.
for i, p in enumerate(pdf.pages, 1):
    ws = p.extract_words(); top = min(x["top"] for x in ws)
    print(i, round(top, 1), " ".join(x["text"] for x in ws if x["top"] < top + 3)[:50])
```

**Compare layouts only with `--seed`.** Practice questions are randomly sampled, so two
unseeded runs of the same command pick different questions and differ in length for reasons
that have nothing to do with the code. Generate the before and after with the *same* seed,
or the comparison is worthless — this produced a false "the change costs a page" panic once
already.

**Word can wedge behind an invisible modal.** If `open_document` starts timing out on
*every* file — including one it opened a minute earlier — Word is sitting on a dialog with
no visible window; nothing in the skill causes it and only a human dismiss clears it
(`System Events` needs assistive access we don't have). A milder variant: Word keeps
exporting but every `close` verb starts answering *"doesn't understand the close message"*,
which leaves documents open — and an open document exports its **stale in-memory copy**, so
from then on always export to a fresh filename. Plain AppleScript often still works when
the MCP tool times out:

```bash
osascript -e 'tell application "Microsoft Word"
  set d to open file name POSIX file "/abs/path/in.docx"
  save as d file name "/abs/path/out.pdf" file format format PDF
end tell'
```

Confirm a hard wedge is environmental by opening an untouched original, then fall back to a
**pandoc round-trip**, which reads the real OMML back out without Word at all:

```bash
pandoc "out.docx" -t markdown --wrap=none        # equations come back as LaTeX
```

Compare per bullet/line rather than by splitting the whole document on `$` — a display
`$$…$$` or an escaped `\$` desynchronises a whole-file pairing and manufactures hundreds of
phantom mismatches. Fold `\mathrm`, `\left`, `\right`, `\,` and braces before comparing;
pandoc's brace choices are its own.

## Programmatic use

```python
import revision_lib as R
rep = R.make_worksheet(kind="notes", bank="S4_AM", topic="Binomial Theorem", n=8)
print(rep.text())
```

`make_worksheet(...)` returns a `RunReport`; `--dry-run` resolves and selects without
writing. Other useful entry points: `resolve_fragment(bank, topic)`, `resolve_worked(folder,
topic)`, `fetch_pool(env, level, topic)`, `list_topics(env, level)`, `select_questions(...)`,
`clone_with_practice(...)`, `style_omml(elem, size, color)`, `out_folder(kind, bank, folder)`.
