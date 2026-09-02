# Animated lessons — `/app/lesson/[slug]`

Scene-scripted, computed animation (no AI at runtime, no video files): a
committed JSON script per topic, interpreted by a client player. Phase 1
(2026-09-02) shipped the engine + the Binomial Theorem pilot; phase 2
(2026-09-03) shipped the **plan-billed drafting pipeline** below, so any topic
with approved notes gets a lesson at near-zero cost, gated by a deterministic
verifier and Adrian's scene-by-scene approval.

**Admin-preview only until Adrian releases them** — see § Release.

## Map

| Piece | Where | Notes |
|---|---|---|
| Schema + validator | `src/lib/lesson-script.ts` | Six scene types; `validateLessonScript` collects every error in one pass. The header comment lists the design decisions the player leans on — change schema and player together. |
| Scripts | `data/lessons/<slug>.json` | Static imports, never fs reads (Vercel tracing). |
| Registry + check resolution | `src/lib/lesson-load.ts` | `RAW_SCRIPTS` map; `usableCheckAnswer` / `resolveCheckScene` run the SAME eligibility gate as the practice `?qid=` deep link. |
| Catalog | `src/lib/lesson-catalog.ts` | The tiny client-safe map entry points read (`lessonForTopic`, `lessonBySlug`). |
| Player | `src/app/app/lesson/[slug]/lesson-player.tsx` | Moved-term FLIP, coefficient-space graph morphs, autoplay beats, reduced-motion. |
| Page | `src/app/app/lesson/[slug]/page.tsx` | Resolves check questions server-side; `requireFullPortal` gate. |
| Check recording | `src/app/api/portal/lesson-check/route.ts` | Re-grades server-side, writes `student_attempts` (mastery accrues). |
| Telemetry | `src/app/api/portal/lesson-event/route.ts` | `lesson:<slug>:scene:<n>` / `:done` in `portal_event_log`. |
| Verification (pure) | `src/lib/lesson-verify.ts` (+ `.test.ts`) | Every rule the gate applies, unit-tested. |
| Authoring tools | `scripts/lessons/*.mjs` | Pull notes · pick checks · verify · register. |
| Skill | `.claude/skills/author-lesson/SKILL.md` | The procedure a session follows. |

Lessons live: `binomial-theorem-am` (pilot), `quadratic-functions-am`
(first pipeline-drafted lesson, "Completing the Square").

## Authoring a lesson (phase 2)

Plan-billed: a Claude Code session on Adrian's Mac runs the procedure — the
skill is the spec, the scripts are the tools, Adrian is the checkpoint. Trigger
with "author a lesson on <topic>" / "draft lesson AM Quadratic Functions".

```bash
# 1. the ONLY source of claims — Adrian's approved learning units for the topic
node scripts/lessons/pull-notes.mjs AM Quadratic Functions        # exit 1 if nothing approved → stop

# 2. real bank questions that will grade cleanly as pause-predict checks
node scripts/lessons/pick-checks.mjs AM Quadratic Functions --n 2 # prints candidates + paste-ready stubs

# 3. write data/lessons/<slug>.json  (craft checklist: the skill, § 3)

# 4. the gate — repeat until PASS with no warnings you can't defend
node scripts/lessons/verify-lesson.mjs quadratic-functions-am     # [--offline] [--require-narration] [--json]

# 5. register (refuses duplicates) + prove coherence
node scripts/lessons/register-lesson.mjs quadratic-functions-am
npx vitest run src/lib/lesson src/lib/notebook && npx tsc --noEmit

# 6. commit + push to dev, re-alias → Adrian previews with his admin cookie
#    https://adrianmath-dev.vercel.app/app/lesson/quadratic-functions-am
```

Then the **approval loop**: the session hands Adrian a scene-by-scene summary
in chat (topic · units drawn on · one line per scene · the two checks with
independent working · the verifier line · anything in the notes that looked
wrong). He amends scene by scene; every amendment re-runs step 4. Nothing is
student-visible at any point in this loop.

### What the verifier checks (`scripts/lessons/verify-lesson.mjs`)

Exit 0 only with zero errors. It bundles the app's own modules with esbuild so
there is exactly one validator, one eligibility gate and one answer checker.

1. **Structure** — `validateLessonScript`; slug must equal the file name.
2. **KaTeX** — every token `tex` and every `$…$` / `$$…$$` fragment of every
   MathText/markdown field renders with `throwOnError` (same macros as
   `lib/math-markdown`). Plain-text fields (title, headings, placeholder, axis
   labels) must NOT contain `$` — the player prints them literally.
3. **Assertions** — the script's own `verify` lists (below).
4. **graph-morph** — finite coefficients, every curve enters the window, a
   quadratic's turning point is on screen, x-range ≤ 12 / y-range ≤ 24 (the
   player draws a gridline per integer).
5. **Craft** — canonical level/topic (verbatim), 8–16 scenes, title first,
   caption last, ≤ 6 tokens per equation line, ≤ 7 steps, ≤ 4 callouts, the
   first check after scene 4, no back-to-back checks, markdown-in-MathText
   pitfalls, declared minutes vs the autoplay pacing.
6. **Narration** — present on every scene (warning until the narration layer
   lands; `--require-narration` makes it an error), spoken English, no TeX,
   6–90 words.
7. **Checks** — each `qid` fetched from the bank: passes `practiceEligibility`,
   has a top-level `answer` that `checkTypedAnswer` grades against itself, is
   single-valued (no multi-part / ± / "shown"), matches the lesson's level,
   carries the lesson's topic. `--offline` downgrades this to a warning.

### `verify` — machine-checked claims

An author-side list on any scene (the validator and the player ignore it):

```json
"verify": [
  { "expr": "C(5,3) * 2^2 * 3^3", "equals": 1080 },
  { "expr": "-9/4 + 2", "equals": "-1/4" },
  { "expr": "2(x + 5/4)^2 - 17/8", "equiv": "2x^2 + 5x + 1" },
  { "expr": "(x-2)^2 - 4", "state": 2 }
]
```

- `equals` — plain arithmetic, evaluated by `lib/lesson-verify.evalExpr`, a
  small parser (never `eval`): `+ - * / ^` or `**`, brackets, juxtaposition
  (`2x`, `3(x-2)`), `sqrt abs C choose nCr fact min max`, `pi`. Paper
  precedence: `-2^2 = -4`. `at: { "n": 5 }` fixes other symbols.
- `equiv` — two expressions in `x` (or `var`) agree at 16 sample points.
- `state` — graph-morph only: the expression IS `states[i]`'s polynomial.

Rule of thumb: if a number appears on screen, an assertion should be checking it.

### Answer grading for checks

Checks grade locally + server-side through `lib/notebook.checkTypedAnswer`.
Phase 2 added **coordinate points** (`(2, 8)`): ordered tuples, brackets
optional when typing, labels tolerated (`h=2, k=8`), a clean mismatch is
`wrong`. Bare comma lists (`2, 5`) remain unordered root lists. Still
deferred: a ± normaliser, symbolic equivalence (an expression answer only ever
grades `unclear`) — `pick-checks` ranks those answer shapes last for that reason.

### Craft — the short version

One idea per caption. A graph-morph is a parameter family (states = coefficient
arrays of real polynomials, labels naming them, a `state` assertion per state).
An annotate names the parts of one formula. An equation-steps scene shows a
substitution assembling: ≤ 6 tokens per line, `id` on the token that will
move, `from` on the line where it lands. A check comes right after the move
has been taught, with a `prompt` that coaches the first step and a `why` that
is the one-line working. Narration on every scene, spoken English. Full
checklist: `.claude/skills/author-lesson/SKILL.md` § 3.

## Release

Two removals make lessons student-visible (Adrian's call, made once):
`requireFullPortal()` in `src/app/app/lesson/[slug]/page.tsx` and the
`lessonsVisible` prop on `src/app/app/practice/page.tsx`. Until then Adrian's
admin cookie previews every registered lesson at
`https://adrianmath-dev.vercel.app/app/lesson/<slug>`; students see nothing,
and the practice topic sheet's "▶ Learn this topic first" row stays hidden.

Before release also: narration/audio layer merged (the `narration` key every
phase-2 script already carries), `--require-narration` on in the verifier, and
a `timed('lesson', …)` health-check probe for the page.
