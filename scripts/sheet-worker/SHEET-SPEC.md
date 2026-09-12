# The sheet spec — a Practice Again sheet as JSON

> **Style:** every rendered solution follows [`create-worksheet/ADRIAN-STYLE.md`](../../.claude/skills/create-worksheet/ADRIAN-STYLE.md) — line-by-line working aligned at "=" in editable Word maths, grey ← notes, two cases side by side with "or", real numbering, columns for diagrams. Add a new rule THERE.

> Status: **built and proved, not switched on.** `SHEET_RENDER=spec` turns it on
> for the sheet worker; nothing sets it yet. Adrian decides after reading the
> fidelity result below.

Today the sheet worker writes the sheet's content *and* builds the DOCX, one
`worksheet_lib` call at a time, in a throwaway `author.py` it writes per job —
then exports the PDF through Word by AppleScript. Two jobs in one: the teaching,
and the typesetting. The typesetting is the same every time, it costs model
time, and it is where the layout faults come from (three of the eleven September
sheets were filed without the repair pass; one Remember line came out 9 pt and
another 9.5; one author glued the whole practice item and another glued nothing).

This splits them. **The writer emits the sheet as one JSON file; a script
renders it.** The teaching stays the writer's. The typesetting becomes code.

```
work/sheet.spec.json   ──▶   scripts/sheet-worker/render_sheet.py   ──▶   3 Practice Again.docx
                                (worksheet_lib + repair + lints + Word)      3 Practice Again.pdf
```

Nothing about the house style moves: `render_sheet.py` **imports**
`.claude/skills/create-worksheet/worksheet_lib.py` and calls the same helpers
the worker calls today, then runs `repair-sheet.py`'s own `repair()` and the
`WORKER_PROMPT.md` §3b sweeps, then exports the PDF from inside Word's sandbox
container the way the toolchain notes require. A change to the library reaches
the renderer with no edit here.

**Proved on three vetted sheets** (11 Sep 2026 — Isabelle's AM 2025 P1, Denise's
AM 2022 P2, Isabelle's 2-paper E Math batch): transcribed to a spec, re-rendered,
and compared against the filed files — **every page pixel-identical at 100 dpi**,
every paragraph and run identical, 21 of 22 docx zip entries byte-identical (the
22nd is `document.xml`, differing only in the figures' embedded file names). Same
spec twice gives the same bytes.

---

## Writing one

```bash
/usr/bin/python3 scripts/sheet-worker/render_sheet.py work/sheet.spec.json \
  --out work/render --name "3 Practice Again"
```

`--no-pdf` skips the Word export (use it while drafting, or where Word is not
installed). `--strict` makes any lint hit a non-zero exit. `--check-determinism`
renders twice and proves the bytes match. `--no-repair` reproduces a sheet filed
before the repair pass existed.

Use `/usr/bin/python3`, not Homebrew's — it is the one with `python-docx`,
`matplotlib`, `sympy` and `PIL`.

## Shape

```json
{
  "spec_version": 1,
  "sheet": { "subject": "AM", "title": "…", "student": "…" },
  "body": [ { "block": "skill", "parts": [ … ] }, … ]
}
```

`sheet` is the title block and the running header. `body` is the sheet, in
order, as a flat list of typed blocks — the block types below are the whole
vocabulary, and they are the house style's own: there is no block for anything
the style does not allow.

### `sheet`

| field | |
|---|---|
| `subject` | `AM` / `EM` / `JC` — the second running-header line ("Additional Mathematics"). |
| `title` | `PRACTICE AGAIN — Learn from A Math 2025 Paper 1`, or on a batch `… from your E Math papers`. |
| `papers` | Batch only: the student's own papers, one grey centred line under the title (`2025 Paper 1 · 2025 Paper 2`). Naming the student's own papers is allowed on a batch sheet. |
| `student` | Full name. Rendered as the faded-blue `For <Full Name>` subtitle — present but receding, and nowhere else on the page. |
| `instructions` | Leave it out. The three fixed lines are the default. |
| `header` | Leave it out. Overrides the running header outright. |
| `working_space` | Leave it at 0. A Practice Again sheet is read, not written on. |

The title block is tight by construction: title `space_after` 2 pt, the papers
line 9 pt with 1 pt under it, the name 10 pt with 3 pt under it, then the three
instruction lines and one blank paragraph.

### Blocks

| block | what it is |
|---|---|
| `skill` | The Title Case section heading — bold navy `1F4E79`, 11 pt, 6 pt of air above, glued to the line below. It names the TOOL, not the task. **Every skill after the first opens a page** (`new_page` overrides). |
| `where` | Every sheet (11 Sep 2026): `Where it showed: Q7(a)(i) and Q11(b)` on a single-paper sheet, `Where it showed: 2025 Paper 1 Q2 and Q8(a)` on a batch — grey italic, 9 pt, under every `skill` heading. |
| `keymove` | The ONE blue key-move line under the heading. The situation goes here, not in the heading. |
| `example` | `Example N` — auto-numbered. `"label": "a"` opens a lettered group (`Example 3a`), `"b"` reuses its number. |
| `para` | An unnumbered paragraph: an Example's stem, a continuation line. `marks` puts `[n]` at the 15.5 cm right tab; `indent_cm` lines it up with the text of the question above it. |
| `parts_start` | Opens the `(a)(b)(c)` list under an Example's stem, flush with its left edge. Call it after the stem and its figure. |
| `part` | `(a)` / `(b)` / `(c)`, with `marks`. Under an Example after `parts_start`; under a practice `item` otherwise. |
| `item` | A numbered practice question — `1.` `2.` `3.`, never `(a)`. A question with parts is one `item` + `part` blocks + ONE `answer`. |
| `practice` | `Practice N`. Restarts the numbering, so every set counts 1, 2, 3 from the top and an item Adrian inserts in Word renumbers the rest. |
| `remember` | A hint under a practice question: `[Remember: …]`, grey. The brackets are added. |
| `answer` | ONE orange right-aligned `[Ans: …]` at the END of the whole question, carrying every part. `[Ans: ` and `]` are added. |
| `figure` | A diagram under the question that uses it. |
| `solution` | The boxed worked solution. |
| `table` | A data table the question comes with — a two-way frequency table, an ingredient list, a table to fill in. |
| `blank` | One empty body line. |
| `page_break` | A hard page break. |

Every block also takes `glue: true` — keep this paragraph with the one below it.
The headings, the figures and the `[Ans]` line already glue themselves; use it
only to reproduce a sheet that glued more.

### `parts` — a paragraph's inline content

A list of three shapes:

```json
[ {"t": "Substitute the point into "},
  {"m": "(x-a)^2 + (y-b)^2"},
  {"t": " and compare with "},
  {"m": "r^2"},
  {"t": ": less than "},
  {"tag": ["inside: ", {"m": "< r^2"}]} ]
```

- `{"t": …}` — words. `b` / `i` / `u` / `color` where a piece needs its own ink.
- `{"m": "latex"}` — an equation object. **If it is maths, it is an equation
  object, wherever it appears** — a heading, a stem, an `[Ans]` line, the inside
  of a green tag. `\frac`, never `\tfrac` (`\tfrac` renders as a linear
  fraction). `display: true` for a display equation inline.
- `{"tag": [ … ]}` — Adrian's green bold square-bracket rule tag. Pieces are
  strings or `{"m": latex}`, so the maths inside the brackets is an equation
  object like everywhere else. `color` picks the ink: green `00B050` the rule
  and the result it produces (default), blue `0432FF` the expression being
  matched, red `EE0000` the piece added or changed.

A block's own ink is the renderer's: a `keymove` is blue italic, a `note` step
grey italic, a `remember` grey — the spec carries the words, not the hex.

### `solution` steps

```json
{ "block": "solution", "rows": [
  { "label": "(a)", "steps": [
    { "step": "note",  "parts": [ … ] },
    { "step": "math",  "latex": "\\begin{aligned} y &= Ax^b \\\\ \\ln y &= \\ln A + b\\ln x \\end{aligned}" },
    { "step": "prose", "parts": [ … ] },
    { "step": "check", "parts": [ … ] } ] } ] }
```

| step | |
|---|---|
| `note` | A grey italic principle line. A box opens with 2–3: the general rule, the move, then it applied to this question. |
| `prose` | A step that says what you are doing, in plain Singapore classroom English. The general rule inside it is a green `tag`. |
| `math` | A display equation. Multi-step working is ONE `\begin{aligned}` block with `&=` per line, so the `=` signs stack — three `=` on one line is not allowed. End a line with `\quad\text{← short reason}` for the grey 8 pt arrow annotation. |
| `figure` | A diagram inside the box, on the first part that uses it, showing only what that part has established. |
| `check` | A sanity check — renders `✓ Check: …` in green, so the student can see it is not part of the working. Only where a real check exists. |
| `error` | The one red Common Error line: a concrete wrong MOVE a student makes here and what belongs instead, in one sentence. The `Common Error: ` label is added. Most boxes carry none; two per sheet is plenty, and the renderer says so above that. |

`label` is `(a)` / `(i)`, or `""` for a one-part solution (a single full-width
cell — the layout stays the same). Rows sit 8 pt apart, as paragraph spacing in
both cells; the box shows only its outer border. `keep_together` defaults to
**true** (Adrian, 11 Sep 2026: an example "looks cut off in the middle → hard
to read"): the Example label, its question, figure, `Solution:` line and the
whole box move to a fresh page together rather than being cut. The half-empty
page that can leave behind is accepted. Practice questions are glued the same
way (`sheet.keep_questions_together`, default true).

### Figures

```json
{ "block": "figure", "width_cm": 10.5,
  "source": { "figure_lib": { "kind": "graph", "curves": [ … ] } } }
```

`source` is either a `figure_lib` spec — rendered at build time into
`<out>/figures/`, so the figure travels with the spec and can be re-rendered —
or `{"file": "figures/q4.png"}`, a file beside the spec, for a bank question's
own diagram or a bespoke matplotlib render. Every PNG is trimmed to its ink at
embed time and the width scaled by the same ratio, so the drawing prints at the
size you chose with the border gone: do not pad `xlim`/`ylim` and do not widen
`width_cm` to compensate for a border.

A QUESTION carries a diagram only when the bank question itself has one. A
diagram you draw goes inside the solution box, on the part that uses it.

### Tables

```json
{ "block": "table",
  "rows": [ ["", "Wear glasses", "Do not wear glasses", "Total"],
            ["Adult", 26, 58, 84] ],
  "align": ["left", "center", "center", "center"],
  "widths_cm": [3.2, 3.4, 4.6, 2.4] }
```

Full gridlines (a solution box shows only its outer edge), bold header row and
bold stub column unless `header` / `stub_bold` say otherwise, every row but the
last glued to the one below. A cell may be a string, a number, or a `parts` list.

## What the renderer enforces

Run in this order, every time, so a sheet cannot be filed without them:

1. the spec is valid against `sheet-spec.schema.json`;
2. `repair-sheet.py`'s `repair()` — a `worksheet_lib` sheet scores one
   `gap_above_box` per solution box **every time**, plus the part gaps and any
   linear fraction or source line; this is a build step, not a safety net;
3. the §3b sweeps — `find_plain_maths` over every `<w:t>` run, zero linear
   fractions, the word *never*, the banned figures of speech (*survive*, *hands
   you*, *the trick is*, …), a count of Common Error lines, and no table cell
   ending on an empty paragraph;
4. the PDF through Word, from
   `~/Library/Containers/com.microsoft.Word/Data/Documents/adrianmath-export/`,
   staged under a uuid name with the index-loop guard — never `active document`,
   which is a race two sheet slots have lost before, and never LibreOffice,
   which cannot draw Word's OMML equation arrays.

## What it does not do

It does not choose the wave, write the teaching, verify an answer, search the
bank, or file anything to Dropbox. Those stay the writer's — the checkpoints in
`WORKER_PROMPT.md` are unchanged. It turns a finished sheet into a file.
