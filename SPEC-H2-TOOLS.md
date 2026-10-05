# JC H2 practice tools — "Which method?" and statistics write-ups

Adrian, 5 Oct 2026: *"build the which method drills and stats trainer"*. Built the same day,
**both behind closed switches** (Adrian's cookie and the demo student see them).

## What a student sees

Practice tab → **JC drills** (two rows, under the photo page and above the to-do list).

### 🧭 Which method? (`/app/practice/methods`)

1. Pick an area: Integration · Vectors · Distributions and tests.
2. One card: the START of a question (an integral, a vectors set-up, a probability situation).
3. Three or four approaches. Tap one. **Do not solve.**
4. At once: Right / Not this one (the right one turns green), **Why:** one line, and
   **Not B:** one line on why the tempting wrong one fails (shown when the student chose it,
   or under a right answer). Next.
5. Order: the ones they missed last time first, then unseen, then the ones they got right;
   the same shuffle all day (`lib/h2-tools drillOrder`).

Marked on the phone (the item carries its answer); the attempt is logged in the background.
No model, no cap.

### ✍️ Statistics write-ups (`/app/practice/stats`)

1. A list by kind: Hypotheses · The test statistic · One tail or two? · Conclusions in
   context · Assumptions · Correlation · Regression lines.
2. One item: the situation, the task, "The scheme looks for n points", a box to type in.
3. **Check my answer** → "2 of 3 points there", then each point ✓/✗. A ✗ shows
   **The scheme says** (the scheme's words) and **You wrote** (the line of their answer
   closest to it, or "Nothing on this yet."). Then the **Model answer**, one idea per line.

How a point is checked (`lib/h2-tools.ts`, pure/tested):
- **The rule first, free.** Each point has groups of alternatives; the point passes when
  every group has one alternative inside the normalised answer (lowercase, μ → mu, ≠ → !=,
  LaTeX dollars and backslashes dropped). A `forbid` word ("accept H0", "prove") fails the
  point and no model can overturn it.
- **The cheap model for what the rule missed.** Only the points the rule did not find go to
  `claude-haiku-4-5` with the scheme words, judged strictly the way an H2 marker would; it
  also quotes the student's words for "You wrote". A rule ✓ is never overruled.
- **Cap:** `DAILY_STATS_MODEL_CAP` = 30 model checks a student a Singapore day. Past the
  cap the rule's verdict stands (the student is not told; the rule is the floor).

## Syllabus (revised 9758, first examined 2025)

z-tests only (no t-test), no Poisson, no normal approximation to the binomial, no method of
differences, no induction, no Type I/II error — `.claude/skills/gce-paper/reference/jc-standard-2022-2024.md`
item 13. A drill may name an out-of-syllabus method only as a wrong option whose line says so.

## Where the items come from

Our own wording, each grounded on a **school-prelim** H2 question in the bank
(`source_question_id`; school rows only — `docs/CONTENT-POLICY.md`, national rows are
grounding-only). The committed files are the source of truth:

| file | table | items (5 Oct 2026) |
|---|---|---|
| `data/h2-tools/method-drills.json` | `method_drills` | 132 = 44 integration + 44 vectors + 44 distributions, all live |
| `data/h2-tools/stats-writeups.json` | `stats_writeup_items` | 30 (6 hypotheses, 6 conclusion, 2 test statistic, 6 assumption, 2 tail, 4 correlation, 4 regression) |

`npx tsx scripts/h2-tools/seed.ts --go` upserts both files (stable ids; `status` and
`verify_note` come from the file). Attempts: `h2_tool_attempts` (identity, tool, item,
answer, right or not, `used_model`). All three tables: RLS with no policies, service key only.
Migration `migrations/h2_practice_tools.sql`.

### Checks before an item goes live

- **Drills:** a fresh Opus agent, given only the stem and the options (no key), picks the
  approach and says for every other option whether it is genuinely wrong or also valid.
  Live only when it picks the key AND finds no other valid option (`verify_note` records it).
  5 Oct 2026: 132 of 132 agreed; one stem reworded ("rides 3 stops" → "across 3 gaps"),
  one option's LaTeX fixed; every maths string renders in KaTeX.
- **Write-ups:** an Opus examiner pass re-checked every model answer (decisions recomputed
  against the level / critical values), every point, every forbid list; each item carries
  `tests` (a passing and a failing typed answer) and `h2-tools.test.ts` runs them through
  the rule on every push.

## The switches (`src/lib/portal-beta.ts`)

| switch | state | opens |
|---|---|---|
| `H2_METHOD_DRILLS_OPEN_TO_STUDENTS` | closed | 🧭 Which method? for every JC1/JC2 student |
| `H2_STATS_TRAINER_OPEN_TO_STUDENTS` | closed | ✍️ Statistics write-ups for every JC1/JC2 student |

`h2ToolOpen(tool, account)` → `lib/h2-tools h2ToolVisible`: Adrian's admin cookie and the
demo student (`H2_TOOLS_PREVIEW_IDENTITIES`) always; others only when the switch is open AND
their level is JC. Routes: `GET|POST /api/portal/h2/methods`, `GET|POST /api/portal/h2/stats`
(401 anonymous — health-check `portal-h2-methods`, `portal-h2-stats`).

## Next (not built)

More areas for the drills (differentiation technique, Maclaurin, DEs, series/recurrence,
complex numbers); a "drill my weak spots" order from the student's marked papers; the
write-up items in the Notebook when a marked paper lost a wording mark.
