# Writing a Geography set — the brief (B, 7 Oct 2026)

For whoever writes Geography sets (a session or its agents). Follow it to the letter.
The worked examples are **g01–g04** in `data/humanities/geography/sets.json` — read them first.

The syllabus is Singapore O-Level Geography (the Humanities elective and Pure Geography, first
examined 2023/2024): Geography in Everyday Life · Tourism · Climate · Tectonics.

## What one set is

One JSON object: `id` (`gNN`), `subject: "geography"`, `kind: "points"`, `cluster`
(`everyday` · `tourism` · `climate` · `tectonics`), `title` (the sub-topic, 6 words at most),
`issue` (one line saying what the set covers), `sources: []`, and **five questions**.

Each question:

- `id` (`gNN-q1` …), `skill` (`geo_explain` for explain / suggest, `geo_describe` for describe /
  compare), `command` (`explain` · `describe` · `compare` · `suggest`), `marks` (3, 4 or 5),
  `sources: []`, `question` (one clear sentence, ending with a full stop).
- `develop` — `true` when a point can earn a second mark for being developed (the usual rule for
  "Explain two reasons …" and for describing data, where the figures are the development);
  `false` when the answer is a chain of steps or a list, each worth one mark.
- `points` — the creditable points, ids `a`, `b`, `c` … Each `text` is one plain sentence (3 to 30
  words). When `develop` is true, every point has a `develop` line: what earns the second mark.
  Give **more points than the marks need** (a student may choose), and at least enough to reach
  full marks.
- `rules` (optional) — one or two lines only this question needs ("Describe only. A reason earns
  nothing.").
- `table` (optional) — `{caption: "Table 1: …", columns: […], rows: [[…]]}`, 4 to 8 rows, our own
  made-up but realistic data for "Country X" / "City Y" or a real, well-known pattern. No maps,
  graphs or photographs yet — a question must be answerable from its words and its table.
- `seeded` — one answer for EVERY mark from 0 to `marks`: `{level: <marks>, text}`.

In each set: three `explain`, one `describe` from a table, and one more (`describe`, `compare` or
`suggest`). Marks across the five: mostly 3 and 4, at most one 5.

## Figures (added 7 Oct 2026)

A question may show a **figure drawn from its own numbers** instead of a table: put
`"figure": "bar" | "line" | "climate"` on the `table`, caption it `"Fig. 1: …"`, and say
"Using Fig. 1, …" in the question. Every value is printed on the graph, so a student can quote
exact figures, and the reader is given the same numbers.

- `bar` — the first column is the categories, ONE more column of numbers (3 to 12 rows).
- `line` — the first column is the categories (years, months, times), one or two columns of numbers.
- `climate` — exactly three columns: the month (`J F M A M J J A S O N D` or `Jan` … `Dec`, 12 rows),
  then `Temperature (°C)`, then `Rainfall (mm)`. Rainfall is drawn as bars, temperature as a line.
- No maps, photographs or diagrams yet.

## Rules for the content

1. **Ours.** Never copy or number-swap a school or national question (`docs/CONTENT-POLICY.md`).
2. **Right.** Every point is correct secondary-school Geography as the syllabus teaches it. If
   you are not sure a fact is right, leave the point out. A real place or event is named only when
   the fact about it is well known and certain (the 2004 Indian Ocean tsunami; Singapore's park
   connectors). No invented statistic about a real place — use Country X.
3. **Plain words.** A Sec 3 student reads the question once and knows what to do.
4. Never the tutor's name, never a model's name.

## Rules for the seeded answers

- The answer for mark *k* earns **exactly** *k* by the points and the `develop` rule — no more.
  Count it: each point made = 1; each point made and developed = 2 (only when `develop` is true).
- **The 0 answer has no valid point at all** — not even one that is missing from your list. It is
  on the topic, sounds like a student, and says nothing creditable (a definition, a restated
  question, a true but irrelevant fact, a description where an explanation is asked).
- **No extra valid ideas.** The reader may credit a correct point that is not on your list. So an
  answer must not carry a stray correct idea beyond the ones you are counting.
- Build upward: the answer for *k* + 1 is usually the answer for *k* plus one more point or one
  development.
- Write as a student writes: short sentences, own words (do not copy the point's wording exactly),
  no bullet points. 220 words at most.

## Before handing a set back

```
npx tsx scripts/humanities-bench/check-set.ts data/humanities/geography/drafts/gNN.json
```

It must print `gNN: fit to list`. Then mark your own seeded answers once more, strictly, against
your own points. Write each set to `data/humanities/geography/drafts/gNN.json` (one object per
file). Do not edit `sets.json`, do not commit, do not push. Report once, at the end.

## The sets

| id | cluster | sub-topic |
|---|---|---|
| g05 | everyday | Neighbourhoods and sense of place |
| g06 | everyday | Sustainable neighbourhoods, hazards and resilience |
| g07 | everyday | Fieldwork: collecting and presenting data |
| g08 | tourism | Why tourism has grown; kinds of tourism |
| g09 | tourism | The impacts of tourism on people and places |
| g10 | tourism | Sustainable tourism and who is responsible |
| g11 | climate | What decides temperature and rainfall; winds and monsoons |
| g12 | climate | Climate change: causes and effects |
| g13 | climate | Tropical cyclones and responding to climate change |
| g14 | tectonics | Plates, their movement and plate boundaries |
| g15 | tectonics | Earthquakes, volcanoes and their effects |
| g16 | tectonics | Living with tectonic hazards: preparing and responding |
