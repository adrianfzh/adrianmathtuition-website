---
name: revision-worksheet
description: >
  Build Adrian's revision worksheets as .docx by taking one of his EXISTING documents as
  the base and appending a fresh "Practice" section of real past-paper questions pulled
  from the math Supabase question bank. Two kinds: "notes" (base = a notes-bank fragment
  from Dropbox/AdrianMathNotes/notes_bank, i.e. Adrian's own formulas + Reminders) and
  "worked" (base = an existing "(With Worked Examples)" sheet from Dropbox/AdrianMathNotes/Revision).
  Trigger whenever Adrian asks for a revision worksheet / revision sheet / notes-plus-practice
  for a topic — e.g. "revision worksheet, S4 AM Binomial Theorem, notes, 8 questions",
  "make the worked-examples revision sheet for AM Partial Fractions", "revision sheet for
  S4 EM Matrices with 10 questions". NOT the same as create-worksheet: that one authors a
  worksheet from scratch; this one clones an existing document and appends practice.
---

# Revision Worksheet Skill

Two kinds of revision worksheet, both produced the same way: **byte-clone one of Adrian's
existing `.docx` files, then append a Practice section to it.** Nothing about the base is
re-rendered, re-styled, or re-flowed — his fonts, OMML equations, images, headers and
relationships survive exactly because the file is cloned and only `word/document.xml` is
mutated.

| Kind | Base document | Result |
|---|---|---|
| `notes` | Notes-bank fragment (`notes_bank/<BANK>/<Topic>.docx`) — Adrian's formulas + his "Reminders" section | Fragment verbatim, then `Practice` |
| `worked` | Existing revision sheet (`Revision/<FOLDER>/… (With Worked Examples).docx`) | Whole worked sheet verbatim, then `Practice` |

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

```bash
python3 <skill-dir>/revision_lib.py --kind notes  --bank S4_AM --topic "Binomial Theorem" -n 8
python3 <skill-dir>/revision_lib.py --kind worked --folder AM  --topic "Binomial Theorem" -n 8
```

Default question count is **8**. Always print the run report (below) back to Adrian.

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
| `--out <path>` / `--suffix " (TEST)"` | output path / filename suffix |
| `--seed N` | reproducible question pick |
| `--no-ai` | exclude `AI Generated` rows (real past papers only) |
| `--show-source` | print school/year/paper under each question |
| `--space N` | extra blank working lines beyond `marks` (default 2) |
| `--page-break` / `--no-page-break` | force Practice onto a new page or not |
| `--dry-run` | resolve + select + report, write nothing |
| `--list` | list available fragments / sheets and exit |

## Content source 1 — notes bank (kind=notes)

```
~/Library/CloudStorage/Dropbox/Apps/AdrianMathNotes/notes_bank/{S3_AM,S4_AM,S3_EM,S4_EM}/<Topic>.docx
```

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
- `has_image=is.false` — **v1 excludes every figure question, deliberately** (see below)
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
- no question whose text references a figure/diagram/table we cannot render
- no markdown tables or image links in the body

Selection is tiered — real past-paper + `verified` first, then real, then verified
`AI Generated`, then the rest (`--no-ai` drops the AI tiers entirely). Within a tier it is
a diversity-greedy pick spreading marks bucket, difficulty and school, seeded by `--seed`
when reproducibility matters, and the final set is sorted ascending by total marks so the
sheet ramps up. No duplicates.

### Figures are out of scope in v1

Questions with `has_image=true` are excluded, full stop. Rendering them means embedding
the cropped figure, which needs the verified-figure gate from the question-bank work.
Until that exists, a figure question on a revision sheet would be unanswerable. Say this
plainly if Adrian asks why a topic returns fewer questions than he expects — for some
topics (Matrices, Vectors, geometry) the figure exclusion removes a third or more of the
pool, and the report's `skipped NN: refers to a figure/table we cannot render` line shows
exactly how many.

## The Practice section

Appended after the base content, in the house style inherited from `create-worksheet`
(Times New Roman 9.5 pt, 1.5 line spacing, marks right-aligned, `[Ans: …]` right-aligned
in orange `#843C0C`, navy `#1F4E79` heading):

- `Practice` heading, optionally preceded by a page break (`<w:br w:type="page"/>` in its
  own paragraph — default **off** for `notes` so the formulas stay visible beside the
  questions, **on** for `worked` so the practice starts clean).
- Questions auto-numbered `1.`, `2.`, … with hanging indents; sub-parts `(a)`, `(b)`, …
  built from the row's `parts` json.
- Marks as `[3]`, right-aligned at a tab stop computed from the **base document's own
  `sectPr`** (page width − margins − 0.5 cm), so it lines up with whatever page geometry
  that particular base uses.
- Working space: `marks + 2` blank lines (min 3, max 12; tune with `--space`).
- `[Ans: …]` right-aligned orange, from the row's `answer`, or assembled from sub-part
  answers as `(a) …; (b) …`.

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
- **Explicit LEFT tab stop as well as the right marks stop.** A custom tab stop clears
  Word's default stops before it, so the tab after `(a)` would otherwise jump all the way
  to the marks stop.
- **Equations never abort the run.** All LaTeX in the selected questions is converted in a
  single batched `pandoc` call (≈38 equations in a couple of seconds), with a
  per-expression retry through `worksheet_lib._latex_to_omml`. Anything still unconvertible
  degrades to plain text for that one expression and is listed in the report as
  `FALLBACK (plain text): …`. The worksheet is always produced.

## Output

Default: `~/Desktop/REV <BANK-or-FOLDER> <Topic> (Notes|Worked Examples).docx`

**Never write into the Dropbox folders.** Adrian reviews the file on his Desktop and moves
the approved ones into `Dropbox/Apps/AdrianMathNotes/Revision/` himself. The skill reads
Dropbox; it does not write there.

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
Equations : 38 converted, 0 fallback(s)
Output    : /Users/adrianfong/Desktop/REV S4_AM Binomial Theorem (Notes).docx
```

Non-negotiable contents: **which base/fragment was used and how it was resolved**, the
question count with **per-question school/year provenance**, and **any equation
fallbacks**.

## Verification

```bash
textutil -convert txt -stdout "out.docx" | head -60           # text + structure
unzip -p "out.docx" word/document.xml | grep -o "m:oMath" | wc -l   # equations present
python3 -c "from docx import Document; print(len(Document('out.docx').paragraphs))"
```

**Quick Look lies about this file.** `qlmanage`/Preview renders OMML as blank and ignores
custom tab stops, so equations look missing and `[3]` looks mid-line. A control file
generated by the proven `create-worksheet` skill renders exactly the same way in Quick
Look. Judge the output in **MS Word**, or by the XML checks above — not by a thumbnail.
(Same root cause as the LibreOffice/Cambria Math caveat in `create-worksheet`.)

## Programmatic use

```python
import revision_lib as R
rep = R.make_worksheet(kind="notes", bank="S4_AM", topic="Binomial Theorem", n=8)
print(rep.text())
```

`make_worksheet(...)` returns a `RunReport`; `--dry-run` resolves and selects without
writing. Other useful entry points: `resolve_fragment(bank, topic)`, `resolve_worked(folder,
topic)`, `fetch_pool(env, level, topic)`, `list_topics(env, level)`, `select_questions(...)`,
`clone_with_practice(...)`.
