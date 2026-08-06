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
| `--out <path>` / `--suffix " (TEST)"` | exact output path, taken verbatim / suffix on the **default** filename (ignored when `--out` is given) |
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
> any real run: `tar -czf notes_bank_backup.tar.gz notes_bank`.

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
- **The skill's own output is excluded from base resolution.** Worksheets land in
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

Default: `Dropbox/Apps/AdrianMathNotes/Revision/<folder>/REV <BANK-or-FOLDER> <Topic> (Notes|Worked Examples).docx`

| Kind | Folder |
|---|---|
| `worked` | the folder the base sheet came from — the worksheet lands beside its source |
| `notes` | `S4_AM`/`S3_AM` → `AM`, `S4_EM`/`S3_EM` → `EM` (a notes bank has no folder of its own) |
| `--base` with no bank/folder | `~/Desktop` |

`--out <path>` overrides it. The finished file goes straight into the Revision library;
say where it landed so Adrian can open it from Dropbox on any device.

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
Equations : 38 converted, 0 fallback(s)
Output    : …/Dropbox/Apps/AdrianMathNotes/Revision/AM/REV S4_AM Binomial Theorem (Notes).docx
```

Non-negotiable contents: **which base/fragment was used and how it was resolved**, the
question count with **per-question school/year provenance**, **any equation fallbacks**,
and **where the file was written**.

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

**Word can wedge behind an invisible modal.** If `open_document` starts timing out on
*every* file — including one it opened a minute earlier — Word is sitting on a dialog with
no visible window; nothing in the skill causes it and only a human dismiss clears it
(`System Events` needs assistive access we don't have). Confirm it's environmental by
opening an untouched original, then fall back to a **pandoc round-trip**, which reads the
real OMML back out without Word at all:

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
