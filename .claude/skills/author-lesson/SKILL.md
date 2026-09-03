---
name: author-lesson
description: Draft an animated portal lesson (/app/lesson/<slug>) for one (level, topic) from Adrian's APPROVED notes, gated by the deterministic verifier and his scene-by-scene approval. Trigger on "author a lesson on <topic>", "draft lesson <level> <topic>", "animated lesson for <topic>", "lesson script for <topic>". Plan-billed — the session writes the script itself, no API call. NOT for printable notes or worksheets (create-teaching-notes / create-worksheet) and NOT for the Learn-player units (/notes) — this produces the scene-scripted animated lesson only.
---

# Author an animated lesson (plan-billed)

You produce ONE file, `data/lessons/<slug>.json` — a `LessonScript` (schema:
`src/lib/lesson-script.ts`) — plus its registry + catalog lines, verified clean,
**admin-preview only**. Adrian approves it scene by scene; releasing lessons to
students is a separate decision he makes once (docs/LESSONS.md § Release). You
never touch that gate.

Read before writing: `src/lib/lesson-script.ts` (the header comment says what
the player leans on), `data/lessons/binomial-theorem-am.json` (the exemplar —
study its scene craft), `docs/LESSONS.md` § Authoring.

## 1. Source of claims — pull the approved notes

```bash
node scripts/lessons/pull-notes.mjs <LEVEL> <Topic words…>
# e.g. node scripts/lessons/pull-notes.mjs AM Quadratic Functions
```

Exit 1 = no approved units → **stop** and tell Adrian the topic must be approved
on /notes first; a lesson is never drafted from unvetted notes. Otherwise this
printout is the lesson's entire source of truth:

- Every mathematical claim, formula, worked example and "trap" in the script
  traces to an approved unit (core / example / autopsy / try). Re-sequence,
  compress, animate, add connective prose — but never introduce a method,
  formula or shortcut the units don't teach.
- Reuse the units' actual numbers for worked examples (the exemplar used the
  notes' own examples) so Adrian recognises his teaching on screen.
- A unit that looks wrong to you is a **Novelty** signal: keep it out of the
  lesson and put it in the hand-off. Never quietly "fix" his notes in a lesson.

## 2. Pick the checks — real bank questions that grade cleanly

```bash
node scripts/lessons/pick-checks.mjs <LEVEL> <Topic words…> --n 2
```

It applies the practice eligibility gate + `usableCheckAnswer`, drops
multi-part / ± / "shown" answers, and ranks number and coordinate answers
first (a symbolic answer only ever grades "unclear"). Choose 2 (3 at most):

- the exact skill the lesson teaches, on a real prelim/GCE question when one exists;
- different sub-skills if the pool allows; single-part; recent.
- **Work each question yourself** and confirm the bank answer before using it —
  that working, in one line, becomes the scene's `why`.

Paste the printed stubs into the script and write `prompt` / `placeholder` /
`why` in Adrian's voice (coaching, not a solution; `why` is the reveal).

## 3. Write the script — craft checklist (what the pilot established)

Shape: 10–14 scenes, ≈ 4 min; open on `title`, close on a `caption`; two checks,
the first only after the move has been shown in worked steps, never two in a row.

- **`caption`** = one idea. Three short paragraphs (`\n\n`), ≤ ~500 chars,
  inline `$…$` only. Use it for: the why-this-matters opener, the trap that
  costs marks (from an autopsy unit), the closer that names the loop.
- **`graph-morph`** = a *parameter family*: one curve, 3–5 states, each state
  a coefficient array (constant first) of a real polynomial the label names.
  Window must show every curve's turning point; x-range ≤ 12, y-range ≤ 24.
  Put a `verify` `{ "expr": "(x-2)^2 - 4", "state": 2 }` on every state so the
  label and the coefficients can't drift apart.
- **`annotate`** = *naming the parts* of one formula: 3–5 tokens with ids, one
  callout per part, one tone each. The formula sheet line, the general term.
- **`equation-steps`** = *a substitution assembling*: ≤ 6 tokens per line (a
  token is a unit that moves or lights up — merge glyphs that move together),
  ≤ 7 steps, `note` = one plain sentence. Give a token an `id` where a later
  line will show it *moved*; on that later line use `from: "<id>"` — that is
  the moved-term animation, the reason this engine exists. Highlight (`hl`)
  the term the eye should follow; keep tones consistent across the scene
  (amber = the thing being worked, sky = the square/structure, emerald = the
  answer).
- **`check`** = pause-predict on a real question: placed right after the move
  has been taught, `prompt` coaches the first step, `placeholder` shows the
  answer's shape (`k = ?`, `(h, k)`), `why` is the one-line working.
- **`narration`** on **every** scene: spoken English in a teacher's voice,
  6–90 words, no TeX, no `$`, no backslashes — say "x minus two, all squared".
- **Prefer `beats`** (2026-09-04, docs/LESSONS.md § The beat model): cut the
  narration into ≤ 40-word ideas — `{ "say": …, "do": [actions] }` — and cue
  each beat's actions to ITS clip (`write` a token / line / paragraph, `reveal`,
  `highlight`, `move` the FLIP, `morph` a graph state, `mark` underline /
  circle / box, `note` a handwritten aside, `focus`, `clear`), with `at` = the
  fraction of the sentence where the object should move. Say the thing, then
  move the thing. Give every token the pen touches an `id`. A check keeps one
  beat (the lead-in). A beat scene carries NO `narration` / `audio` — they
  derive. Set `"theme": "chalk"` for the board look (the exemplar is
  `data/lessons/quadratic-functions-am.json`).
- **`verify`** lists on every scene that computes something: `equals` for
  numbers, `equiv` for identities in x, `state` for graph states. If a number
  appears on screen, the verifier should be checking it.
- Plain-text fields (lesson `title`, scene `title`, every `heading`,
  `placeholder`, axis labels) render literally — no `$` there.
- `level` = bank level (AM/EM/JC/S1/S2); `topic` = the EXACT canonical string
  from `lib/canonical-topics.ts`; `slug` = `<topic-kebab>-<level>`.

## 4. Verify until clean

```bash
node scripts/lessons/verify-lesson.mjs <slug>
```

Fix every error. Treat warnings as errors unless you can say in the hand-off
why one stands. The gate checks: structure (the app's own validator), every
KaTeX unit, your `verify` assertions, graph windows, the craft rules above,
narration, and each check question against the live bank (eligibility, a
short official answer that grades against itself, level/topic).

## 5. Register and prove it

```bash
node scripts/lessons/register-lesson.mjs <slug>     # refuses duplicates
npx vitest run src/lib/lesson src/lib/notebook     # catalog ↔ registry ↔ script coherence
npx tsc --noEmit
```

## 6. Preview

Commit + push to `dev` per repo policy (three code files + the JSON together),
re-alias the preview, then the URL Adrian opens is

    https://adrianmath-dev.vercel.app/app/lesson/<slug>

His admin cookie sees it; students see nothing (the `requireFullPortal` gate).
Locally: `npm run dev`, sign in at `/admin`, open `http://localhost:3000/app/lesson/<slug>`.

## 7. Hand-off — scene-by-scene, for approval

Give Adrian, in chat (not a file):

1. Topic · slug · minutes · which approved units the lesson draws on (ids).
2. One line per scene: `#n type — heading — what it teaches / what moves`.
3. The two checks: qid · source · the question in one line · bank answer ·
   your independent working.
4. The verifier's summary line (`PASS — 0 errors, N warnings`) and every
   warning left standing, with why.
5. Anything you noticed in the notes that looked wrong (Novelty) — verbatim.
6. The preview URL, and the sentence "nothing is student-visible until you release lessons".

Then stop. Amendments come back scene by scene; re-run the verifier after each.

## Rules

- Never edit `lesson-script.ts` to fit a lesson; if the schema is genuinely
  short of a scene type, say so in the hand-off.
- Never touch `requireFullPortal` on `/app/lesson/[slug]` or the `lessonsVisible`
  prop on the practice page — release is Adrian's call, made once.
- Never invent or hand-edit a check `qid`; never keep one the verifier rejects.
- No `job_runs` stamp: this is on-demand authoring Adrian triggers, not a rhythm.
