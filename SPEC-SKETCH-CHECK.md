# 📈 The graph-sketch checker — SPEC

**Built 5 Oct 2026** (Adrian: "build … the graph sketch checker"). **Behind a CLOSED switch:**
`H2_SKETCH_CHECK_OPEN_TO_STUDENTS = false` in `src/lib/portal-beta.ts`. Adrian's admin cookie
and the demo student see it. Flip it to open it to every JC1 / JC2 student.

## What it does

"Sketch …, labelling all features" is in nearly every H2 paper, and it always loses marks.

1. The student picks the graph:
   - a past question from our list (`data/sketch-check/questions.json` — 26 school prelim,
     promo and mid-year questions with a fully numeric function, never a national row), or
   - types the function they were given, or
   - photographs the question (the bot reads the function off it).
2. They sketch on paper and photograph it.
3. They get back, in about 15 seconds:
   - the photo with the red pen: ✓ or ✗ beside every asymptote, intercept, turning point
     and piece of the curve, and a note with the right label where one is missing or wrong;
   - "Not on your sketch" for anything not drawn at all;
   - the correct sketch with every feature labelled, drawn by the figure registry;
   - a checklist in plain words, wrong first;
   - what a mark scheme would take off. No mark is kept — this is practice.

Doors: the "JC drills" section on the Practice tab → `/app/practice/sketch`; a result is
`/app/practice/sketch/<id>`.

## How it stays honest

Three parts, kept apart on purpose:

| Part | Who | Where |
|---|---|---|
| The maths: every feature of the function | computed, never asked of a model | bot `lib/sketch-features.js` |
| Reading the photo | one Gemini vision call, **blind** — never told the answer | bot `ai/sketch-checker.js` `READ_PROMPT` |
| The judgement: right / unlabelled / wrong / missing | pure code | bot `lib/sketch-check.js` |

- **The maths.** The function is scanned finely; poles, roots and turning points are refined
  by bisection; tails give horizontal or oblique asymptotes. Values are written exactly when
  they are a small fraction or a ± b√k surd, else to 3 s.f. Every feature then goes through
  the `function-graph` family's own gate, which re-derives it from the expression. A feature
  the gate refuses is never checked against a student (`refused` on the row).
- **The read is blind.** The model lists every dashed line, every marked point, every label
  exactly as written (with its numeric value), and every piece of the curve with how each
  end finishes. It does not see the computed features, so it cannot "find" a label that is
  not there.
- **Matching an unlabelled mark.** A sketch has no scale, but it keeps ORDER along each axis.
  Labelled marks match by value; unlabelled ones match the computed feature in the same
  left-to-right place. A point that is two features (a y-intercept that is the maximum) is
  one dot, matched once.
- **Pieces.** Read pieces are placed into the gaps between the vertical asymptotes the
  student drew; two read pieces in one gap are one piece (the model saw a pen lift).
- **Which side of a slanted asymptote** a pencil line runs is often too close to see on a
  photo, so that alone is a "?" check, never a lost mark.

### Statuses

`ok` · `unlabelled` · `wrong` (labelled with the wrong value) · `rough` (not 3 s.f.) · `half`
(one coordinate of a turning point) · `not-exact` (the question asks for exact values) ·
`missing` · `extra` (a line that is not an asymptote) · `check` (shape side, not counted).

### What a scheme would take off

One line per mark group with anything not `ok` / `check`: the shape mark, the asymptotes
mark, the axial-intercepts mark, the turning-points mark, the end-points mark. A question
only checks the groups it names (`asks` in the JSON); the shape is always checked.

## Why instant, not the queue

One photo, one vision call (~5–10 s, ~US$0.02), nothing to plan. So it runs like the
humanities reader: the website inserts a `queued` row and pings the bot (`202`), the bot
writes the row in the background, the page polls every 4 s. Cap: `DAILY_SKETCH_CAP` = 10 a
Singapore day (Adrian's cookie is not capped).

## Files

Website
- `src/lib/sketch-check.ts` (pure, tested) — the question list, the typed-function reader,
  the cap, the page's report helpers.
- `src/lib/sketch-check-store.ts` — stores the photo under the student's own
  `handins/<identity>/sketch-<id>.jpg` (so `/api/files` serves it to them only), inserts the
  row, pings the bot.
- `src/app/api/portal/sketch-check/route.ts` — POST hand-in, GET one / the list.
- `src/app/app/practice/sketch/` — the form, the list, the result page.
- `data/sketch-check/questions.json` — the question list.
- Supabase `sketch_checks` (migration `migrations/sketch_checks.sql`).
- Health-check: `portal-sketch-check` (401) and `bot-sketch-check` (the bot route answers 400
  to an empty body).

Bot
- `lib/sketch-features.js`, `lib/sketch-check.js` (pure, `test/sketch-check.test.js`).
- `ai/sketch-checker.js` — the blind read, the question-photo reader, the red-pen image.
- `POST /api/sketch-check` in `handlers/webchat.js`.

## Tested

Five plausible student sketches with deliberate faults (unlabelled oblique asymptote, a
missing asymptote, a sign-wrong turning point, decimals where exact values were asked, a
piece on the wrong side of its asymptote) plus one fully right sketch: every fault was
caught and the right one came back clean. Read variance seen in testing: on a sketch whose
curve is drawn ON its slanted asymptote, the side can flip between reads — hence the "?".

## Not built (next, if wanted)

- Drawing in the app instead of on paper.
- Transformation questions (sketch y = f(|x|), 1/f(x) from a GIVEN graph): no function to
  compute from. They would need the given graph's features as the spec — the
  `curve-sketch-from-features` family is the place to start.
- Questions with unknown constants (a, k): no numbers to compute.
