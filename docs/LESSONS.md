# Animated lessons — `/app/lesson/[slug]`

Scene-scripted, narrated mini-lessons inside the student portal. No AI at
runtime: a lesson is a committed JSON script, the player is pure client code,
and the voice track is a folder of committed MP3 clips. Pilot: **The Binomial
Theorem (AM)** — `/app/lesson/binomial-theorem-am`, 13 scenes, 2 real bank
checks, fully narrated.

> **Status (2026-09-02): ADMIN PREVIEW ONLY.** Adrian: "do not put animated
> lesson as student facing yet". The release switch is at the bottom of this
> file — two gate removals.

## Files

| What | Where |
|---|---|
| The script (scenes + narration + audio paths) | `data/lessons/<slug>.json` |
| Schema, validator, narration helpers — pure, tested | `src/lib/lesson-script.ts` (+ `.test.ts`) |
| Static registry + check-question resolution | `src/lib/lesson-load.ts` |
| Entry-point map (slug / level / topic / minutes) | `src/lib/lesson-catalog.ts` |
| Server page: the admin gate + check resolution through the practice eligibility gate | `src/app/app/lesson/[slug]/page.tsx` |
| The player (six scene renderers, three pacings) | `src/app/app/lesson/[slug]/lesson-player.tsx` |
| The voice hook (one `<audio>`, unlock, prefetch, pacing) | `src/app/app/lesson/[slug]/lesson-narration.ts` |
| Committed clips | `public/lessons/<slug>/scene-NN[-K].mp3` |
| TTS generator + transcription check | `scripts/lessons/generate-narration.mjs` |
| Telemetry + check recording | `/api/portal/lesson-event`, `/api/portal/lesson-check` |

Adding a lesson = author the JSON, register it in `lesson-load.ts`
(`RAW_SCRIPTS`), add a row to `lesson-catalog.ts`, run the narration script.
The coherence test fails if any of the three drift apart.

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

`validateLessonScript` collects every error in one pass (length, TeX
characters, array length ≠ step count, audio without narration, shape
mismatches, off-site URLs). Invalid scripts fail the vitest suite before they
can ship; at runtime an invalid file simply 404s.

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

Three pacings, one control row (header pills):

- **Manual** — tap the card / Continue; ‹ steps back one beat.
- **▶ Auto** — silent timer beats per scene type (`beatDuration`).
- **🔊 Voice** — the clips set the pace: a per-step clip ending advances one
  step, a whole-scene clip ending moves to the next scene (after a 650 ms
  beat, `NARRATION_BEAT_MS`). Positions without a clip fall back to the Auto
  timers, so a half-narrated lesson still flows; a clip that fails to load
  falls back the same way. Checks: the lead-in plays on entry, the answer
  gate holds, the answered "why" gets its 3.6 s beat, then on.
  Tapping ahead stops the current clip and starts the next position's.
  ‹ becomes a video-style ⏮: restart this scene, or the previous scene from
  its top. Muted keeps the clock (the clip plays muted). Reduced-motion users
  get the voice too. Auto and Voice are exclusive; the Auto pill becomes the
  mute pill while Voice is on, so the header keeps its width.
- **Audio unlock (iOS Safari / Chrome autoplay policy).** One `<audio>`
  element serves the whole lesson. It is first `play()`ed inside a user
  gesture — the 🔊 pill tap, the "▶ Play with voice" poster on the card (shown
  when Voice was remembered from a previous visit), or any Continue/card tap
  (which unlocks with 10 ms of silence and lets the next position's clip
  start on its own). After that, programmatic `play()` with a new `src` is
  allowed, which is what lets scene→scene auto-advance keep talking. A
  `NotAllowedError` puts the poster back. The next clip is prefetched into a
  blob URL so scene entry never waits on the network.
- **Preferences** persist in `localStorage` (`lsn:narrated`, `lsn:muted`,
  behind try/catch, read through `useSyncExternalStore` so SSR never
  mismatches). Auto is deliberately not remembered.

## Telemetry (`portal_event_log`, bounded kinds)

`lesson:<slug>:scene:<n>` (scene entered) · `lesson:<slug>:done` ·
`lesson:<slug>:narrated` (the first real clip started — once per visit).
Voice adoption = `narrated ÷ scene:0`. Check answers are recorded by
`/api/portal/lesson-check` into `student_attempts` (first attempt only).

## Tests (`src/lib/lesson-script.test.ts`)

Validator negatives for every rule above; the pure narration helpers; the
pilot's shape (13 scenes, two checks, verified coefficient rows); every pilot
scene narrated with per-step arrays on every multi-step scene; check
narration never contains the answer; every clip present in `public/` and a
real MP3 (ID3 tag or frame sync), total under the asset budget; catalog ↔
script coherence.

## Release switch

1. `src/app/app/lesson/[slug]/page.tsx` — remove the `requireFullPortal()`
   call (students land on `/app` while it is there).
2. `src/app/app/practice/page.tsx` — the `lessonsVisible` prop
   (`fullPortalVisible()`) hides the "▶ Learn this topic first" row from
   students; pass `true` / drop the prop.
3. Add a `timed('lesson-audio', …)` probe to `/api/health-check` (HEAD one
   clip, expect 200 + `audio/mpeg`) — the repo rule for every new
   student-facing surface.
4. Update the status line in `IDEAS.md` and at the top of this file.
