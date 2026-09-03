# Animated lessons — `/app/lesson/[slug]`

Scene-scripted, narrated mini-lessons inside the student portal. No AI at
runtime: a lesson is a committed JSON script, the player is pure client code,
and the voice track is a folder of committed MP3 clips. Phase 1 (2026-09-02)
shipped the engine + the **Binomial Theorem (AM)** pilot (13 scenes, 2 real
bank checks, fully narrated); the voice track landed the same day; phase 2
(2026-09-02) shipped the **plan-billed drafting pipeline** below, so any topic
with approved notes gets a lesson at near-zero cost, gated by a deterministic
verifier and Adrian's scene-by-scene approval.

> **Status (2026-09-02): ADMIN PREVIEW ONLY.** Adrian: "do not put animated
> lesson as student facing yet". The release switch is at the bottom of this
> file — two gate removals.

Lessons live: `binomial-theorem-am` (pilot, narrated + clips),
`quadratic-functions-am` (first pipeline-drafted lesson, "Completing the
Square" — narration authored, clips not yet generated).

## Map

| Piece | Where | Notes |
|---|---|---|
| Schema + validator + narration helpers | `src/lib/lesson-script.ts` (+ `.test.ts`) | Six scene types; `validateLessonScript` collects every error in one pass. The header comment lists the design decisions the player leans on — change schema and player together. |
| Scripts | `data/lessons/<slug>.json` | Scenes + narration + audio paths. Static imports, never fs reads (Vercel tracing). |
| Registry + check resolution | `src/lib/lesson-load.ts` | `RAW_SCRIPTS` map; `usableCheckAnswer` / `resolveCheckScene` run the SAME eligibility gate as the practice `?qid=` deep link. |
| Catalog | `src/lib/lesson-catalog.ts` | The tiny client-safe map entry points read (`lessonForTopic`, `lessonBySlug`); slug / level / topic / minutes. |
| Player | `src/app/app/lesson/[slug]/lesson-player.tsx` | Six scene renderers, three pacings (manual / Auto / 🔊 Voice), speed 1×–3× + pause, the teacher's cursor + spoken-line ribbon, moved-term FLIP, coefficient-space graph morphs, reduced-motion. |
| Voice hook | `src/app/app/lesson/[slug]/lesson-narration.ts` | One `<audio>`, iOS unlock, prefetch (clip + sidecar), clip-driven pacing, playbackRate, pause/resume, the per-frame `clock()`. |
| Spoken-text timing (pure) | `src/lib/lesson-speech.ts` (+ `.test.ts`) | Sentence splitter (TeX/markdown-aware), speaking weights, proportional timing, the sidecar parser, shown↔spoken alignment, cursor states; `PLAYBACK_RATES` + `scaleBeat`. |
| Committed clips | `public/lessons/<slug>/scene-NN[-K].mp3` | Written by the TTS script; Adrian's own takes drop in under the same names. An optional `scene-NN[-K].timing.json` beside a clip (§ Timing sidecars) times its words exactly. |
| Page | `src/app/app/lesson/[slug]/page.tsx` | Resolves check questions server-side; `requireFullPortal` gate. |
| Check recording | `src/app/api/portal/lesson-check/route.ts` | Re-grades server-side, writes `student_attempts` (mastery accrues). |
| Telemetry | `src/app/api/portal/lesson-event/route.ts` | `lesson:<slug>:scene:<n>` / `:done` / `:narrated` in `portal_event_log`. |
| Verification (pure) | `src/lib/lesson-verify.ts` (+ `.test.ts`) | Every rule the gate applies, unit-tested. |
| Authoring tools | `scripts/lessons/*.mjs` | Pull notes · pick checks · verify · register · generate narration. |
| Skill | `.claude/skills/author-lesson/SKILL.md` | The procedure a session follows. |

## Authoring a lesson (phase 2)

Plan-billed: a Claude Code session on Adrian's Mac runs the procedure — the
skill is the spec, the scripts are the tools, Adrian is the checkpoint. Trigger
with "author a lesson on <topic>" / "draft lesson AM Quadratic Functions".

```bash
# 1. the ONLY source of claims — Adrian's approved learning units for the topic
node scripts/lessons/pull-notes.mjs AM Quadratic Functions        # exit 1 if nothing approved → stop

# 2. real bank questions that will grade cleanly as pause-predict checks
node scripts/lessons/pick-checks.mjs AM Quadratic Functions --n 2 # prints candidates + paste-ready stubs

# 3. write data/lessons/<slug>.json  (craft checklist: the skill, § 3; narration on every scene)

# 4. the gate — repeat until PASS with no warnings you can't defend
node scripts/lessons/verify-lesson.mjs quadratic-functions-am     # [--offline] [--require-narration] [--json]

# 5. register (refuses duplicates) + prove coherence
node scripts/lessons/register-lesson.mjs quadratic-functions-am
npx vitest run src/lib/lesson src/lib/notebook && npx tsc --noEmit

# 6. voice clips (idempotent; see § Regenerating audio)
node scripts/lessons/generate-narration.mjs quadratic-functions-am --verify

# 7. commit + push to dev, re-alias → Adrian previews with his admin cookie
#    https://adrianmath-dev.vercel.app/app/lesson/quadratic-functions-am
```

Then the **approval loop**: the session hands Adrian a scene-by-scene summary
in chat (topic · units drawn on · one line per scene · the two checks with
independent working · the verifier line · anything in the notes that looked
wrong). He amends scene by scene; every amendment re-runs step 4 (and step 6
for any scene whose narration changed — delete that scene's clips or pass
`--scene N --force`). Nothing is student-visible at any point in this loop.

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
   pitfalls, declared minutes vs the pacing (narrated runtime at ~2.5 words/s when the script carries narration, else the autoplay beats).
6. **Narration** — present on every scene (a warning by default;
   `--require-narration` makes it an error), spoken English, no TeX,
   6–90 words per entry.
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

## Scene schema (one JSON object per scene)

| `type` | Shape | Sub-steps (`sceneStepCount`) |
|---|---|---|
| `title` | `title`, `promise` | 1 |
| `caption` | `heading?`, `text` (markdown + `$…$`) | 1 |
| `equation-steps` | `heading?`, `intro?`, `steps[]` of `{ tokens[], note? }` — tokens are `{ tex, hl?, id?, from? }` (`from` = moved-term FLIP from an earlier `id`) | one per step |
| `graph-morph` | `states[]` of `{ label, coeffs[] }` (constant term first), `window`, `xLabel?`, `yLabel?` | one per state |
| `annotate` | `tokens[]`, `callouts[]` of `{ target, label, tone? }` | callouts + 1 (expression first) |
| `check` | `qid` (bank question uuid), `prompt?`, `placeholder?`, `why` — the server resolves the question or skips it | 1 (interactive) |

Every scene may also carry the **voice track**:

| Field | Meaning |
|---|---|
| `narration` | Spoken English. A **string** narrates the whole scene; an **array** narrates each sub-step in turn — exactly one entry per sub-step, so the voice and the reveal line up. ≤ 600 chars per entry, no TeX. |
| `audio` | The clip(s) for `narration`, same shape: one `/lessons/<slug>/….mp3` path, or one per entry. Written by the script; `https://` URLs are also accepted. |
| `timing` | Optional (2026-09-03). The word/sentence timing sidecar(s) for `audio`, same shape — one `/lessons/<slug>/….timing.json` path, or one per entry with `null` for a step that has none. Contract in § Timing sidecars. Without it the player times the words proportionally; the player never probes for an undeclared sidecar (no 404 per clip). |

`validateLessonScript` collects every error in one pass (length, TeX
characters, array length ≠ step count, audio without narration, shape
mismatches, off-site URLs). Invalid scripts fail the vitest suite before they
can ship; at runtime an invalid file simply 404s. The author-side `verify`
list is ignored by the validator and the player.

## Narration — authoring rules (Adrian's teaching voice)

- **Plain, warm, one idea per beat.** Short sentences. It is the caption read
  aloud by a tutor, not an essay — the captions stay on screen regardless.
- **Say the maths the way a teacher says it aloud.** "five choose three",
  "two to the power five minus r", "three x, all cubed", "n C r on your
  calculator", "x to the minus r". Never `$…$`, `\frac`, `^`, `_`, `{}` — the
  validator rejects them.
- **Per-step arrays on every multi-step scene.** The voice for a step starts
  the moment that line / state / callout appears. A whole-scene string on a
  multi-step scene still works (the player spreads the steps evenly across the
  clip) but is coarser — use it for single-step scenes.
- **Check scenes narrate the lead-in only** — "Your turn — pause here and work
  it out …" — **never the answer** (a test greps the check narration for the
  answer digit and number-word).
- Name the source when it is real ("a real O-Level question, from the 2023 GCE
  paper") — it is part of the trust.
- Keep an entry under ~75 words: the pilot's 31 beats run 4–28 s at 1.7–3.1
  words/s (2.5 overall), 1,034 words → 7.0 min of voice.

## Regenerating audio

```
node scripts/lessons/generate-narration.mjs <slug>              # synthesize what's missing
node scripts/lessons/generate-narration.mjs <slug> --dry        # plan only
node scripts/lessons/generate-narration.mjs <slug> --scene 7 --force
node scripts/lessons/generate-narration.mjs <slug> --verify     # ASR round-trip check
```

- Provider: **Gemini TTS** (`gemini-2.5-flash-preview-tts`, voice **Charon** —
  the calm, informative male prebuilt voice) via the existing `GOOGLE_API_KEY`
  in `.env.local`. `--voice` / `--model` / `--style` swap any of the three;
  the script's header lists the 30 voices the API exposes.
  `gemini-3.1-flash-tts-preview` also works but read maths at ~1.6 words/s.
- Output: 24 kHz mono MP3, 40 kbps CBR (~5 KB/s), leading/trailing silence
  trimmed to 150 ms / 300 ms. The pilot's 31 clips total ≈ 2 MB. Two requests
  in flight; `429`/`5xx` back off; daily-quota exhaustion stops the run.
- **Idempotent.** A scene whose clip(s) exist is skipped. To redo one scene,
  delete its files or pass `--scene N --force`. A per-step scene's `audio`
  array is only written once every step's clip exists.
- **`finishReason: "OTHER"` with no audio** — the preview model refuses a
  handful of phrasings deterministically (pilot: one 17-word segment, 5 tries).
  Reword the entry slightly and re-run; the retry loop covers the transient
  cases only.
- `--masters <dir>` keeps a lossless WAV of each clip outside the repo, so a
  bitrate change is a re-encode, not a re-synthesis.
- `--verify` sends each clip through Gemini audio understanding and reports
  what share of the narration's words were heard (whole-word bag match,
  numerals normalised). It is the closest a terminal gets to listening — run
  it after every synthesis; anything under 85 % deserves a real ear.

### Adrian's own voice — the drop-in path

Record each entry as its own take and save it over the same file name —
`public/lessons/<slug>/scene-07-3.mp3` is step 3 of scene 7, `scene-08.mp3`
is a whole-scene take (mono MP3, any bitrate; `.m4a` also passes the
validator — change the path in the JSON if the extension changes). Re-run
nothing: the player only ever reads the `audio` paths, and the generator skips
files that exist. The narration text in the JSON is the script to read from.

## The player

Three pacings, one control row (header pills), plus a speed and a pause that
belong to the two timed pacings:

- **Manual** — tap the card / Continue; ‹ steps back one beat. Every sentence
  on the card sits at full ink.
- **▶ Auto** — silent timer beats per scene type (`beatDuration`), each
  divided by the playback rate. The sentences of the current beat's prose
  wake one after another across the beat (no underline — there is no voice
  to sweep with).
- **🔊 Voice** — the clips set the pace: a per-step clip ending advances one
  step, a whole-scene clip ending moves to the next scene (after a 650 ms
  beat, `NARRATION_BEAT_MS`, ÷ rate). Positions without a clip fall back to
  the Auto timers, so a half-narrated lesson still flows; a clip that fails
  to load falls back the same way. Checks: the lead-in plays on entry, the
  answer gate holds, the answered "why" gets its 3.6 s beat (÷ rate), then
  on. Tapping ahead stops the current clip and starts the next position's.
  ‹ becomes a video-style ⏮: restart this scene, or the previous scene from
  its top. Muted keeps the clock (the clip plays muted; the cursor and the
  ribbon keep moving). Reduced-motion users get the voice too. Auto and Voice
  are exclusive; the Auto pill becomes the mute pill while Voice is on.
- **Speed (2026-09-03)** — a pill showing the rate (`1×`) opens a row of six
  chips: 1× · 1.25× · 1.5× · 2× · 2.5× · 3× (`PLAYBACK_RATES`). It sets the
  element's `playbackRate` with `preservesPitch = true` **and** divides every
  silent beat (`scaleBeat`: Auto timers, the 650 ms breath, the 3.6 s "why"
  beat), so silent and voiced pacing speed up together; a rate change
  mid-beat rescales the remainder. Persisted as `lsn:rate` (same try/catch +
  `useSyncExternalStore` store as `lsn:narrated`); default 1×; the pill turns
  navy-text when off 1×. The row is anchored to the whole pill group, so it
  never runs off a phone's left edge (measured 278 px wide at 390 px). ⚠ A
  new `src` runs the media load algorithm, which resets `playbackRate` to
  `defaultPlaybackRate` — the hook sets BOTH and re-applies after every src
  assignment (a replayed clip came back at 1× until it did, browser run
  2026-09-03). Chrome holds 3× with pitch preserved; WebKit historically
  clamps pitch-preserved rates lower — untested here, listen on the iPhone
  before trusting 2.5×/3× there.
- **Pause / resume (2026-09-03)** — a ⏸/▶ pill in both timed pacings (space
  bar on a keyboard; hidden in Manual, disabled while the Voice poster is
  up). Pausing freezes the clip **and** whichever beat is running (the Auto
  beat, the post-clip breath, the check beat) with its remaining time;
  resume continues from exactly there — the same clip at the same
  `currentTime`, the same remainder — never a restart and never a re-lock
  (pausing a clip before its `play()` settled rejects with `AbortError` →
  `superseded` → the position stands, the classification the tap-to-advance
  fix relies on). A position change while paused (Continue, ‹) releases the
  pause and moves on — navigation is always "go on". Tapping the **card**
  while paused resumes in place instead of advancing (a quiet "⏸ Paused ·
  tap to resume" chip sits top-right). A backgrounded tab still pauses and
  resumes on its own, unless the student had paused it themselves. Mode
  changes release a pause.
- **The teacher's cursor (2026-09-03)** — the prose on the card comes alive
  as the voice reads it, the way a teacher builds a slide, never karaoke.
  The card's prose (caption text, the title's promise, an equation step's
  note, an annotate callout's label and its intro, a check's prompt) is
  split into sentences (`splitSentences`: never inside `$…$`, `**…**`,
  brackets; abbreviations, decimals and initials survive). The sentence
  being spoken sits at full ink under a slim amber underline that sweeps
  along it at the spoken pace (`--sweep`, a bottom-anchored gradient, runs
  on as one line across a wrapped sentence); sentences still to come wait at
  40 % opacity and lift 4 px + fade (300 ms) into place as their moment
  arrives; spoken ones settle to 85 %. **Never animated:** equation tokens
  (they arrive per step already), graph-morph labels and captions (TeX /
  summary), the equation-steps intro (the question stays at full ink), the
  check question itself. Narration text ≠ on-screen text, so on-screen
  sentences map onto the spoken timeline one-to-one when the counts match,
  else proportionally by character weight (`alignShownToSpoken`; punctuation
  carries a pause weight). Per-step narration animates that step's prose
  only — earlier steps settle, later ones wait; a whole-scene clip on a
  multi-step scene walks every step's prose in order. The cursor runs 120 ms
  ahead of the voice so the eye is there first.
- **The spoken-line ribbon** — under the card in Voice mode (fixed 42 px
  slot, so the controls never jump): the narration sentence being said, an
  amber rule on its left, its words brightening slate → navy as the voice
  reaches them. This is the exact "words as they are spoken" feel, without
  touching the maths on the card.
- **Timing source**, in order: (a) a timing sidecar the script declares
  (§ Timing sidecars); (b) proportional timing from `audio.duration` ×
  character weight. Driven from `audio.currentTime` in one `requestAnimationFrame`
  loop — playbackRate and pause are honoured for free — and written straight
  onto the DOM (`data-state`, `--sweep`, `data-on`); React re-renders only
  when the ribbon's sentence changes. `prefers-reduced-motion`: the opacity
  states stay, the lift and the sweep go.
- **Audio unlock (iOS Safari / Chrome autoplay policy).** One `<audio>`
  element serves the whole lesson. It is first `play()`ed inside a user
  gesture — the 🔊 pill tap, the "▶ Play with voice" poster on the card (shown
  when Voice was remembered from a previous visit), or any Continue/card tap
  (which unlocks with 10 ms of silence and lets the next position's clip
  start on its own). After that, programmatic `play()` with a new `src` is
  allowed, which is what lets scene→scene auto-advance keep talking. A
  `NotAllowedError` puts the poster back. The next clip (and its sidecar) is
  prefetched into a blob URL so scene entry never waits on the network.
- **Preferences** persist in `localStorage` (`lsn:narrated`, `lsn:muted`,
  `lsn:rate`, behind try/catch, read through `useSyncExternalStore` so SSR
  never mismatches). Auto and pause are deliberately not remembered.

### The header on a phone (measured 390 × 844, 2026-09-03)

One row in every state. Long labels are `sm:`-only; a phone gets the icon
and the fill colour. Left to right after ‹ (36 px) and the truncating title:

| State | Pills (width) | Title width |
|---|---|---|
| Manual | ▶ Auto (58) · 🔊 Voice (66) | ~180 px |
| Auto on | 1× (30–33) · ⏸ (30) · Auto on (62) · 🔊 Voice (66) | ~95 px |
| Voice on | 1× (30–33) · ⏸ (30) · 🔈 (34) · 🔊 Voice, filled (66) | ~123 px |
| Speed row open | 278 px row of chips 26–42 px each, right-aligned under the pills | — |

Gaps are 6 px between pills, 10 px around the title. "The Binomial Theorem"
truncates to "The Binomial Th…" once the timed pills are up; that is the
accepted trade for keeping every control on one row.

## Timing sidecars — the contract (2026-09-03)

A sidecar times one clip's words so the cursor and the ribbon follow the
voice exactly instead of proportionally. **No sidecars exist yet** — which
provider produces them (Gemini's audio understanding with timestamps, a
forced aligner such as whisperX/aeneas over the committed MP3, or Adrian's
own recording tool) is Adrian's decision; the player ships the fallback and
this contract so that decision is a script, not a player change.

- **File:** `public/lessons/<slug>/scene-NN[-K].timing.json`, beside the
  clip it times, and **declared** in the scene's `timing` field (same shape
  as `audio`; `null` per step without one). The player never probes for an
  undeclared sidecar. `validateLessonScript` checks the shape; the vitest
  suite checks every declared file exists and parses.
- **Body:** seconds, clip-relative, at 1× (the player reads the clip's own
  `currentTime`, which already runs at the playback rate):

  ```json
  {
    "words":     [["Welcome.", 0.00, 0.52], ["In", 0.61, 0.70], ["the", 0.70, 0.78]],
    "sentences": [[0.00, 0.52], [0.61, 4.80]]
  }
  ```

  `words` = `[text, startSec, endSec]` for the narration's whitespace-separated
  tokens **in order** (punctuation attached as written — the player pairs
  them positionally with `narration.split(/\s+/)`, so a count mismatch
  ignores the words); `sentences` = `[startSec, endSec]` per sentence of the
  narration's own split (`splitSentences`). Either key may be omitted:
  sentences without words spread the words proportionally inside each
  sentence; words without sentences derive the sentences from the narration
  split. Starts must be non-decreasing, `0 ≤ start ≤ end`. Anything
  malformed → `null` → the proportional fallback, never a broken lesson
  (`parseTimingSidecar`).
- **Loading:** fetched with the clip's prefetch, cached per URL for the
  visit; a 404 or bad JSON is remembered as "no sidecar".

## Telemetry (`portal_event_log`, bounded kinds)

`lesson:<slug>:scene:<n>` (scene entered) · `lesson:<slug>:done` ·
`lesson:<slug>:narrated` (the first real clip started — once per visit).
Voice adoption = `narrated ÷ scene:0`. Check answers are recorded by
`/api/portal/lesson-check` into `student_attempts` (first attempt only).

## Tests

`src/lib/lesson-script.test.ts`: validator negatives for every schema rule;
the pure narration helpers; the pilot's shape (13 scenes, two checks, verified
coefficient rows); every pilot scene narrated with per-step arrays on every
multi-step scene; check narration never contains the answer; every clip
present in `public/` and a real MP3 (ID3 tag or frame sync), total under the
asset budget; catalog ↔ script coherence for every registered lesson.
`src/lib/lesson-verify.test.ts`: the arithmetic parser, `equiv`/`state`
sampling, graph-window sanity, craft rules, narration rules, answer classes.
`src/lib/lesson-speech.test.ts`: the six rates + `scaleBeat`; the sentence
splitter (TeX, bold, brackets, abbreviations, decimals, initials — and a
round-trip over every prose field of every registered lesson); speaking
weights; proportional timing; the sidecar parser (contract + every
off-contract shape → null); shown↔spoken alignment (equal counts, weighted
shares, a sidecar gap); cursor states and the lead. Schema tests for
`timing` live in `lesson-script.test.ts` (shape, `.timing.json` paths, the
cue carrying it, declared files present).

## Release switch

1. `src/app/app/lesson/[slug]/page.tsx` — remove the `requireFullPortal()`
   call (students land on `/app` while it is there).
2. `src/app/app/practice/page.tsx` — the `lessonsVisible` prop
   (`fullPortalVisible()`) hides the "▶ Learn this topic first" row from
   students; pass `true` / drop the prop.
3. Turn `--require-narration` on in the verifier and generate clips for every
   registered lesson (the pipeline's scripts already carry `narration`).
4. Add a `timed('lesson-audio', …)` probe to `/api/health-check` (HEAD one
   clip, expect 200 + `audio/mpeg`) — the repo rule for every new
   student-facing surface.
5. Update the status line in `IDEAS.md` and at the top of this file.
