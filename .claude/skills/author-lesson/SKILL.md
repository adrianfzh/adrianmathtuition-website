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
  circle / box / arc, `note` a handwritten aside, `focus`, `clear`), each with
  `on` = the WORD of the beat's `say` it belongs to (§ 3b; `at`, a guessed
  fraction, is the older way). Say the thing, then move the thing. Give every token the pen touches an `id`. A check keeps one
  beat (the lead-in). A beat scene carries NO `narration` / `audio` — they
  derive. Set `"theme": "chalk"` for the board look (the exemplar is
  `data/lessons/quadratic-functions-am.json`).
- **On the board themes: WORDS ARE WRITTEN, MATHS APPEARS** (2026-09-05,
  docs/LESSONS.md § Themes). A chalk tip writes every prose field letter by
  letter in Kalam; typeset maths (`$…$` inside prose, every equation token)
  chalk-dusts in on its beat and is never traced. What this asks of you:
  · **Put the words in prose fields and the maths in tokens** — a `write` on a
    prose field buys a hand; a `write` on a token buys a puff of dust. Prose
    that is really an equation ("$x^2-3x+2$" alone in an `intro`) gets neither.
  · **Keep a written field short.** It is drawn over the remainder of its
    clip, so a 40-word paragraph on a 4-second beat writes at a scribble. One
    idea per beat is already the rule; this is why.
  · **A `note` is written too**, in chalk yellow — so it reads as an aside in
    Adrian's hand. Keep it under ~10 words, not the 140-character maximum.
  · **`highlight` is a change of chalk on the board** (the token's colour moves
    to the tone, with a glow), not a coloured box — so a highlight on a whole
    line reads as "this bit is in yellow now", and one on a single token is
    what you want.
  · **`mark` colours are fixed by kind**: underline = cyan (pointing),
    circle = yellow (attention), box = pink (the answer). Choose the kind for
    the meaning, not the colour.
- **`verify`** lists on every scene that computes something: `equals` for
  numbers, `equiv` for identities in x, `state` for graph states. If a number
  appears on screen, the verifier should be checking it.
- Plain-text fields (lesson `title`, scene `title`, every `heading`,
  `placeholder`, axis labels) render literally — no `$` there.
- `level` = bank level (AM/EM/JC/S1/S2); `topic` = the EXACT canonical string
  from `lib/canonical-topics.ts`; `slug` = `<topic-kebab>-<level>`.

## 3b. The voice says the step plainly (Adrian, 8 Oct 2026)

Adrian: *"The content of the voice is not good. Some content does not explain directly.
Need clear direct explanation, and simple but effective animation."* This replaces the
1 Oct "engagement pass" — its question-before-every-reveal and relief lines are what he
was hearing. Write every beat's `say` to these rules (full text + three before/after
lines: docs/LESSONS.md § Narration):

- **What we do, then why.** The step first ("Add nine over four."), the reason second,
  in its own short sentence ("Then subtract it, so the value does not change.").
- **Short sentences, one idea each.** ≤ 24 words a beat in a clip, ≤ 40 in a long lesson.
- **No warm-up.** No "Hi", "Today we learn", "Here's the recipe", "Let's go".
- **No rhetorical questions.** If the voice would answer it itself, say the answer.
- **No cheering, no filler.** No "Simple, right?", "See?", "Easy.", "That's it."
- **Do not restate the screen.** No "as you can see". The board shows the line; the
  voice says what was done and why.
- **The trap in one plain sentence, at the step where it bites.**
- **No story, no plot.** The maths is the only thing on the board.
- **Nothing added to the claims** — § 1's notes are still the only source.
- **Singapore register**: everyday words a parent would not wince at.
- No student-facing text names a model or names Adrian.

`verify-lesson` flags the mechanical half (`directIssues`): a `?`, a warm-up opener, a
cheer, pointing at the screen.

**Animation — one thing moves at a time, and it is the thing being spoken about.**

- **Cue every action after a beat's first to its WORD:** `"on": "x squared"` — a word or
  short run of words of that beat's own `say`. Not `at` (a guessed fraction).
- **One new thing per beat** (two at most), each on its own word, the words at least half
  a second apart. If two things must appear, that is usually two beats.
- **One pointing gesture at most** beside it (an arc, an underline, a box).
- `mark` kinds `arc` / `arc-under` join two tokens ("this times that").
- No character and no stickers unless Adrian asks for them on that clip.

## 3c. A clip — one concept in about a minute (Adrian, 8 Oct 2026)

*"the video must be very short, one concept at a time."* Set `"kind": "clip"`,
`"theme": "chalk"`, `"minutes": 1`.

- ONE `equation-steps` scene, no title scene, no check, no caption paragraphs. A short
  `heading` (the concept's name) and the working.
- 7–10 beats, ≤ 24 words each, ≤ 170 words in all.
- ≤ 6 tokens a line, ≤ 4 lines — it must read on a 358 px board at the clip's larger size.
- § 1 (approved notes) and § 2 (checks) do not apply to a clip Adrian asks for by name;
  every number on the board still gets a `verify` assertion.
- The exemplar is `data/lessons/expand-two-brackets-s2.json`.
- **Look at it on a phone-sized screen before calling it done.**

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

Voice clips first (idempotent; MiniMax `English_FriendlyPerson` is the default since
1 Oct 2026 — no `--voice` needed; after a rewrite of the `say` lines delete the lesson's old
clips, they belong to the old words):

```bash
node scripts/lessons/generate-narration.mjs <slug>            # writes beats[].audio  (PAID — ask Adrian first, say roughly how much)
node scripts/lessons/generate-narration.mjs <slug> --verify   # ASR round-trip, ≥ 85 % a clip
node scripts/lessons/align-narration.mjs <slug> --report      # free, local: times every word → the sidecars the `on` cues read
```

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
