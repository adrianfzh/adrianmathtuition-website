# Clip pipeline — one-minute explanation clips, made automatically, to the approved standard

**Status:** Step 1 BUILT 15 Oct 2026 (Adrian approved the plan and said "yes" to step 1): the
pipeline for skill clips, run by hand, and the 7 A Math Logarithms clips — admin-only, waiting
for Adrian to watch them. Where it stands and how to run it: **§8**. **Step 2 (question clips)
BUILT 15 Oct 2026**: one command makes a checked clip for any bank question; 10 real A Math
questions made end to end, all 10 passing every check, admin-only, waiting for Adrian's watch —
**§9**.
**Asked for:** Adrian, 15 Oct 2026: *"is there a way to build a pipeline to generate clip solutions almost immediately? like within a few minutes … an automated one with all checks to ensure real good quality? this will highly enhance the app experience"* and *"before you do, can you plan how is it done to make it really good and high quality?"*
**The standard:** `data/lessons/expand-two-brackets-s2.json`, the clip Adrian approved on 9 Oct (*"video is much better now. let's keep to this quality"*). Rules in `docs/LESSONS.md` §A clip, §Word cues, §Narration.
**Why the old one-minute explanation is not good enough:** it is built straight from the marker's steps with no writing step, so the voice reads working instead of teaching, and nothing checks it (`src/lib/explain-clip.ts`, closed to students).

## 1. Two kinds of clip, one pipeline

| Kind | What it explains | When it is made | Reused? |
|---|---|---|---|
| **Skill clip** (the library) | one sub-skill, e.g. "Solving logarithmic equations", with Adrian's own method from his notes | in advance, topic by topic | yes — every student, every question of that skill |
| **Question clip** | how to do THIS question, and where a student usually goes wrong | the first time a student asks for it; ready in about 3–5 minutes | yes — the next student who opens the same question gets it at once |

Both run through the same steps and the same checks. A student who gets a question wrong sees the question clip if it exists, else the skill clip at once, and the question clip is queued.

## 2. The steps (each automatic)

1. **Gather.** The question, its checked solution and answer from the bank, its sub-skill, and Adrian's method for that skill (his notes through the teaching-knowledge layer, `lib/teaching-knowledge.ts`), plus the common mistake for the skill (pitfalls, the marker's error kinds on real papers).
2. **Write** (Opus). One clip script in the existing format (`src/lib/lesson-script.ts`), with the approved clip as the worked example: one board, ≤170 spoken words, each beat says the step then why, one thing moves at a time, the trap named once where it bites, every board action tied to a spoken word (`on`).
3. **Check the rules** (no model, seconds). The existing verifier `scripts/lessons/verify-lesson.mjs` (structure, maths renders, word limits, motion, narration rules) — any error stops the clip.
4. **Check the maths** (no model, seconds). NEW: every line on the board must follow from the line before (an algebra check), and the last line must equal the bank's answer. Today only hand-written spot checks exist, and nothing makes sure every number is covered.
5. **Blind read** (a second Opus that did not write it). Reads the script as a student would and scores: clear, one idea per line, voice matches board, the why is a real reason, nothing a Sec 3 student cannot follow. Below the bar → one rewrite with the reader's notes, then dropped if it still fails.
6. **Voice.** The approved voice (MiniMax `speech-02-hd`, `English_FriendlyPerson`), then word timing (`scripts/lessons/align-narration.mjs`). Checks: the voice says what the script says (speech-to-text round trip ≥ 85 %), and every board action lands within 0.3 s of its word (the 8 Oct complaint was 1.5 s).
7. **Look at it.** NEW: play the clip in a headless browser at phone size, take a picture at every action, and a vision check looks for maths cut off, things overlapping, text too small, the board too crowded — Adrian's rule: look at the rendered thing, not the source.
8. **Release.** See §4.
9. **Log and alarm.** Every clip made or dropped is stamped in `job_runs` with why; a `JOB_RHYTHMS` line alarms when the queue stops moving (docs/OPS.md).

Speed: write ~1 min, checks seconds, blind read ~1 min, voice + timing ~30 s, look ~1 min → **about 3–5 minutes** a clip. Runs on the Fly worker, never in a chat.

## 2b. Ideas taken from elsewhere (15 Oct 2026, Adrian: "do we need to take ideas from the web? say: videotutor.io")

Looked at videotutor.io (interrupt-and-ask videos, captions, live diagrams, a mascot and a presenter, "in seconds"). PROPOSED, pending Adrian's yes:
- **Ask about this step** — pause at a beat, one tap opens our chat with the question and that beat's step already in it.
- **Captions** — the spoken line under the board (students watch with the sound off).
- **Live graphs** — graph scenes for graph / trigonometry / calculus skills, not only equation steps.
NOT taken: a character or presenter (the approved clip has none, 9 Oct), and "in seconds" (the 3–5 minutes are the checks; a made clip is instant for every later student).

**From AI short-drama production lines** (Adrian, 15 Oct 2026: *"basically like production lines of how animation films or people use AI to make short dramas … especially the chinese companies"*). PROPOSED:
- **Make two, keep the best** — the writer drafts 2 versions; the blind reader picks the clearer, then the checks run on it.
- **A series look** — fixed board layouts and stock phrases per topic, so a topic's clips look and sound like one series.
- **Numbers decide** — where students stop a clip or press "Still confused" sends that clip back for a rewrite.

**From AI short-drama workflow tutorials** (Adrian sent 7 on 15 Oct 2026 — AI Master, feicaiclub "Opus 5.5 as director", Xuan Studio, CyberJungle "Bible skill file", AI漫劇 tutorials). Their line: pick script → break it down → prepare assets → shoot → sound + edit → watch the cut and revise; a series "bible" every step reads; controlled "film set" work instead of re-rolling; "expensive is cheap" (the cheaper model cost more in rework); hook first, then binge. PROPOSED for us:
- **A bible per topic** (`data/clip-bibles/<topic>.md`): Adrian's method and words from his notes, board layout, notation, the topic's traps. Writer and blind reader both read it.
- **Board plan before words**: step 2 splits into (2a) the beat plan — what is on the board each beat, maths-checked (step 4) — then (2b) the narration. No voice money on a plan that fails.
- **First line = the point** (what this clip fixes), no warm-up.
- **Play the next** clip of the topic after "Now try one".
- **Best model for writing** — rework costs more than the call.
Not needed: face/scene consistency — our board is drawn by code, identical every time.

## 3. Learning from Adrian

- Every clip has a 👍 / 👎 + "what's wrong" for Adrian, and a "This helped / Still confused" for students.
- Each of Adrian's notes becomes a line in a rules file the writer and the blind reader both read (like the marking learning loops) — the same mistake is not made twice.
- A clip students mark "still confused" more than its skill's average goes back to the writer with their feedback.

## 4. Release — when does a student see a clip?

- **First 20 clips:** Adrian watches each one; nothing reaches students.
- **Then:** a clip that passes every check goes to students at once; Adrian gets a weekly sample of 5 to watch, and the switch pauses itself if he marks more than one in ten as not good enough (the same shape as the marking release, CLAUDE.md doctrine).
- Behind a switch `CLIP_PIPELINE_OPEN_TO_STUDENTS` (lib/portal-beta.ts) until he says.

## 5. Build order, each step usable on its own

1. **The pipeline for skill clips**, one A Math topic (Logarithms, 7 sub-skills): steps 1–7, run by hand on the worker. Adrian watches the 7 clips.
2. **Question clips** on request from the practice page and marked papers (admin only), with the queue and the 3–5 minute promise.
3. **The feedback buttons and the rules file** (§3).
4. **Scale:** every A Math sub-skill, then E Math, Sec 1, Sec 2; JC after.
5. **Retire** the old one-minute explanation (`explain-clip.ts`) once question clips cover marked papers.

## 6. Cost (estimate, to be measured on step 1)

About two Opus calls and one voice call per clip — roughly US$0.30–0.60 a clip. A skill library for A Math (~150 sub-skills) ≈ US$50–90 once. Question clips are made once per question and reused.

## 7. Red lines

- No model names, no "AI", no source paper names in anything a student sees or hears.
- Adrian's method, not a textbook's: where his notes teach a way, the clip uses it.
- A clip that fails a check is never shown — no "close enough".
- Voice money (MiniMax) is spent only on clips that passed steps 3–5.

## 8. Step 1 — BUILT 15 Oct 2026: skill clips, A Math Logarithms

### How to run it (one topic, by hand; every file is in the repo)

| Step | What | Tool | Model? |
|---|---|---|---|
| 1 Gather | the topic's sub-skills (`subgroups`), Adrian's approved notes, the approved pitfalls | `node scripts/lessons/pull-notes.mjs AM Logarithms` · `teaching_knowledge` RPC | no |
| Bible | `data/clip-bibles/<topic>.md` — his method + words per sub-skill, notation, spoken forms, traps, stock phrases | written by the session (Opus) from the notes | Opus |
| 2a Board plan | `data/clip-plans/<slug>.json` — the lines (tokens + ids), each line's maths in sympy, the answer, an outline of beats | written by the session (Opus) | Opus |
| 4 Maths | every line follows from the line before (an equation's every solution solves the next line; an expression keeps its value; roots = the solutions, a rejected root breaks a log, kept roots solve the question); the answer holds and its numbers are on the last line | `/usr/bin/python3 scripts/clips/chain-check.py <slug>` | no |
| 2b Two drafts | two writers, each blind to the other, write `beats` (say + word-cued actions) on the checked board | Claude Code agents, `scripts/clips/prompts/writer.md` → `data/clip-runs/<slug>/draft-A.json`, `draft-B.json` | Opus × 2 |
| 5 Blind read | a fresh agent picks the clearer draft, scores 6 things 1–5, fixes small beats; pass = every score ≥ 4 | `scripts/clips/prompts/blind-reader.md` → `blind-read.json` | Opus |
| Assemble | board copied from the plan (never the draft) + the picked beats → `data/lessons/<slug>.json`; register | `node scripts/clips/assemble.mjs <slug>` · `node scripts/lessons/register-lesson.mjs <slug>` | no |
| 3 Rules | the lesson verifier (structure, KaTeX, word limits, motion, narration rules); 0 errors AND 0 warnings | inside `node scripts/clips/gate.mjs <slug>` | no |
| 6 Voice | MiniMax `speech-02-hd` `English_FriendlyPerson`, word timing, speech round trip (≥ 85 % a line — re-scored with number words = digits) | `generate-narration.mjs`, `align-narration.mjs`, `generate-narration.mjs --verify > data/clip-runs/<slug>/asr.txt`, `node scripts/clips/asr-score.mjs <slug>` | no (paid voice) |
| 7 Look + cues | plays the clip at 390 × 844 with the voice on; per board action: when it fired vs its word (gate 0.3 s), a picture, and measurements — cut off, overlap, maths < 12 px, under the bottom menu bar; then an agent looks at every picture | `node scripts/clips/look.mjs <slug>` (needs `npm run dev` or `next start`) | Sonnet (pictures) |
| Record | one record per clip, every check | `node scripts/clips/gate.mjs <slug> --voice` → `data/clip-runs/<slug>/gate.json` | no |

Captions: the spoken line already runs under the board while the voice plays; since 15 Oct a clip
watched with the sound OFF shows each beat's line under the board too (`lesson-player.tsx`).

### The 7 clips (15 Oct 2026) — every check, per clip

Admin-only (`/app/lesson/<slug>` sits behind `requireFullPortal`; no student switch opened).
Each teaches one sub-skill with Adrian's own worked example from his approved notes.

| Clip | Beats · words | Rules | Maths (line checks) | Board = plan | Blind read (pick, lowest of 6 scores) | Voice heard | Cues on the voice (fired, worst vs word) | Look problems |
|---|---|---|---|---|---|---|---|---|
| `laws-of-logarithms-am` | 7 · 100 | ✓ | ✓ 8/8 | ✓ | ✓ A, lowest 4 | ✓ worst 100 % | ✓ 9/9, worst 0.15 s | ✓ 0 |
| `solving-log-equations-am` | 8 · 113 | ✓ | ✓ 7/7 | ✓ | ✓ A, lowest 4 | ✓ worst 90 % | ✓ 12/12, worst 0.15 s | ✓ 0 |
| `solving-exponential-equations-am` | 9 · 123 | ✓ | ✓ 7/7 | ✓ | ✓ A, lowest 4 | ✓ worst 91 % | ✓ 11/11, worst 0.15 s | ✓ 0 |
| `linear-form-with-logs-am` | 8 · 151 | ✓ | ✓ 15/15 | ✓ | ✓ A, lowest 4 | ✓ worst 89 % | ✓ 13/13, worst 0.15 s | ✓ 0 |
| `growth-and-decay-am` | 7 · 133 | ✓ | ✓ 10/10 | ✓ | ✓ A, lowest 4 | ✓ worst 88 % | ✓ 11/11, worst 0.15 s | ✓ 0 |
| `sketching-log-graphs-am` | 10 · 151 | ✓ | ✓ 13/13 | ✓ | ✓ B, lowest 4 | ✓ worst 87 % | ✓ 14/14, worst 0.15 s | ✓ 0 |
| `log-scales-am` | 8 · 112 | ✓ | ✓ 8/8 | ✓ | ✓ B, lowest 4 | ✓ worst 86 % | ✓ 9/9, worst 0.15 s | ✓ 0 |
What each teaches (Adrian's notes unit in brackets): laws — log₃5 + log₃6 − log₃10 = 1, "plus means
multiply" (109.1) · log equations — log₃(x − 8) = 2 − log₃x, x = 9, x = −1 rejected (109.28) ·
exponential equations — 7ˣ⁻¹ = 5ˣ⁻³, x ≈ −8.57, keep the minus (109.42) · straight-line form — ln y
against x through (2, 3), (4, 7) for y = Ae^(−nx): n = −2, A = e⁻¹ (Linear Law 115.185) · growth and
decay — doubles every 7.5 h from 100: k ≈ 0.0924 (1082.15) · sketching — y = ln(2 − x), the four steps
(1082.07) · log scales — 62 dB vs 50 dB: 10^1.2 ≈ 15.8 times (1082.25).

**What the checks caught on the way** (each fixed before the clip passed): the look found the
straight-line board and the decibels board taller than a phone screen (top hidden under the header /
bottom under the menu bar) and a margin note rendered tiny; the blind reader rewrote 8 beats (e.g. "log
of X times X minus eight" heard as "X squared minus eight"); the reader flagged "Step three, draw that
shape" on a board that cannot draw a log curve — it now says "draw that shape on your paper". The first
speech round trip scored 6 lines under 85 % only because the transcript writes "8.57" where the script
says "eight point five seven" — `asr-score.mjs` re-scores on digits, all real words matched.

**What the cue number does and does not prove.** It is measured in a real browser playing the real
voice: every board action fired 0.15 s before the word the timing file gives for it (the head start is on
purpose). The word times themselves come from `align-narration.mjs` (pauses heard by ffmpeg, words dealt
by length — good to about 0.1 s inside a stretch of speech, exact after a pause); nothing yet checks them
against an independent word clock.

### Real cost (step 1)

- **Voice:** 57 lines, 4,282 characters on MiniMax `speech-02-hd` — under US$0.50 for all 7.
- **Speech round trip:** 57 short Gemini Flash transcriptions — a few cents.
- **Writing, blind read, picture read:** plan-billed Claude Code agents, no API money — two Opus writers
  (≈ 120 k tokens each, all 7 clips), one Opus blind reader (≈ 130 k), one Sonnet picture reader (≈ 190 k,
  79 pictures); the board plans and the bible were written by the session itself.
- **Time:** about 3 minutes per clip of agent time when the 7 run together; checks seconds; voice
  ≈ 1 minute per clip; the look ≈ 1 minute per clip (it plays the clip).
- So the §6 estimate holds for voice (US$0.07 a clip); the model part is plan usage, not dollars, while
  it runs as Claude Code agents.

### Next (not done in step 1)

- **Adrian watches the 7** — 👍 / 👎 + "what's wrong" per clip (§3) is not built yet; his words go into
  the bible's rules by hand for now.
- **Captions on a tall board:** the spoken line (and, since 15 Oct, the sound-off caption) sits UNDER the
  board — on these taller boards it falls below the phone screen. Next: put the caption inside the board's
  bottom edge.
- **A live log graph** for the sketching clip (graph-morph draws polynomials only).
- **Play next** clip of the topic from "Now try one" (§2b) — not built.
- **Run on the Fly worker** instead of by hand, `job_runs` stamp + `JOB_RHYTHMS` line (§2 step 9).
- The look's picture read should run AFTER the final look (step 1 ran it on an earlier set while fixes
  were landing; the session re-read the final pictures itself).

### Adrian's first watch (15 Oct 2026, on his phone) — what changed

His notes, in order, and what was done (all are now rules in the bible §1b and the writer's
instructions, so the next topic starts with them):

1. *"Annotation … with arrow pointing leftwards seem to point to nowhere … put an up arrow so that
   arrow points exactly where it needs to be."* → in a clip, a note with `near` is drawn with an ↑
   under the centre of its token (`placeClipNotes`, `lesson-player.tsx`; `NoteSlotView pointAt`).
2. *"Would be good if the log rules are placed beside so that students can see which rule is used."*
   → every line made by a law carries the law as its note, in his names (Add Power, Minus Power,
   Bring down power, log_a a = 1, Take ln, Un-log).
3. *"Show the intermediate step for the second step (shifting over to the other side)"* and
   *"show the intermediate step of taking lg on both sides. That's the key step."* → every move his
   notes write as a line is a board line: log equations, exponential equations, growth and decay
   (`ln e^(7.5k) = ln 2`) and Linear Law (`ln y = ln A + ln e^(−nx)`) gained a line.
4. *"Perhaps an overall idea that to solve the equation is to compare logs at the end first."* →
   the log-equations clip says the aim second, and writes it under the question.
5. *"A drag slider to allow students to go to any parts they want on the clip."* → a clip shows a
   slider (one stop per beat) instead of the progress dot; dropping on a beat shows the board up
   to it and the voice starts that beat.
6. *"This question is actually under the topic linear law — indicate that. And also compare the
   equation with Y = mX + c, where Y = ln y and X = x … then show clearly that −n is the gradient m
   and ln A is the vertical intercept."* → the clip is now "Linear Law with logs" (catalog topic
   Linear Law), on two boards: compare with Y = mX + c in matching colours, Y = ln y, X = x, then
   m = −n and c = ln A; the second board reads m and c off the line. Plans may now have two boards
   (`boards`, each line's `board`, each beat's `board`).
7. *"Can students interrupt and ask why ln is used when e is involved? And a model answer it?"* —
   the §2b "Ask about this step" idea → BUILT 15 Oct 2026, §8b.
8. *"Able to generate these solution clips when a student uploads any question? And retain such
   quality?"* — §5 step 2 (question clips) → BUILT 15 Oct 2026, §9.

**After the re-cut (15 Oct 2026, same day):** all 7 pass every check again — rules, maths
(log equations 8/8, exponential 9/9, growth 11/11, Linear Law 19/19 line checks), board = plan,
blind read (each changed clip re-read by a fresh reader; lowest score 4), voice (re-voiced: log
equations, exponential, growth, Linear Law), cues 0.15 s, and the look, which now also fails a board
taller than the phone screen. The current numbers are in `data/clip-runs/<slug>/gate.json` (the
table above is the first cut). Extra voice for the re-cut: about 3,000 characters, under US$0.35.
New in the player: a clip board that would run below the screen scales its maths down to fit
(`fitClipBoard`, never under 70 %); boards carrying laws set their lines closer.

## 8b. "Ask about this step" — BUILT 15 Oct 2026 (admin + preview student)

Adrian, 15 Oct 2026: *"Can students interrupt and ask why ln is used when e is involved? And a model
answer it? Possible to make it interactive like that?"*

- **Under every clip** (below Continue) one button, **💬 Ask about this step**. A tap pauses the clip
  and opens the beat's ready questions plus **✏️ Type my own question**.
- **Ready questions** are written per beat in the lesson JSON (`beats[].asks`, ≤ 3, a student's own
  words, never spoken or drawn). All 7 Logarithms clips have them on every beat; a beat without
  `asks` offers "Why this step?" / "Explain this step another way". The clip writer should add `asks`
  to every beat of new clips (a test checks the 7: `src/lib/clip-ask.test.ts`).
- **The hand-over** (`lib/clip-ask.ts`): the clip writes the context to sessionStorage and opens
  `/app/ask`. Ask starts a FRESH chat (never the restored one), sends the tapped question at once
  (or focuses the box for "my own"), with the context in front of the FIRST question only: the
  clip's title and topic, its question (`intro`), the board lines written so far (TeX, only the
  written tokens), and the beat's spoken line ("L N" → "ln"). The bubble shows only the student's
  question. The answer is the normal Ask solver (same stream, quota, Questions log).
- **Back**: a "‹ Back to the clip" bar above the chat → `/app/lesson/<slug>?at=<stop>`; the clip
  opens at that stop (the slider's numbering) and plays on.
- **On a laptop** (screen ≥ 1024 px wide; Adrian, 15 Oct 2026: *"on a laptop, show the answer beside
  the clip; keep the phone as it is"*): no new page — the chat opens in a panel beside the clip
  (`clip-ask-panel.tsx`, same solver, text only), the clip slides left to make room and stays
  paused; a later question at another step carries that step's board. ✕ closes it. Phones keep
  the Ask page and the back button. `ask-look.mjs --laptop` checks it.
- **Switch**: `CLIP_ASK_OPEN_TO_STUDENTS` (`lib/portal-beta.ts`, `docs/SWITCHES.md`). Clips themselves
  are still admin-only for students.
- **Check it**: `node scripts/clips/ask-look.mjs [slug] [--stop N] [--ask K | --own]` against
  `next start -p 3210` — opens the clip at the stop, taps the button and a question, waits for the
  answer, taps back, prints JSON + pictures.

## 9. Step 2 — BUILT 15 Oct 2026: question clips (admin + preview student)

Adrian, 15 Oct 2026: *"These videos are a good start, but able to generate these solution clips when
a student upload any questions? And retain such quality?"*

### What it is

- **One command makes one clip for one bank question**, with no hand edits:
  `node scripts/clips/question-clip.mjs <questionId>` (needs the site running with the local env:
  `.claude/launch.json` "Next.js Prod (local env)", port 3211 — `.env.production.local` holds masked
  values, and a dev server's live reloads stop a clip mid-play).
- **Kept once, played for everyone after**: table `question_clips` (one row per question: status
  queued → making → ready / refused / failed, every check, seconds, cost, Adrian's verdict); the voice
  in the public `lesson-audio` bucket under `question-clips/<id>/`. Page `/app/clip/q/<id>` plays it.
- **Doors** (admin + preview student; switch `QUESTION_CLIPS_OPEN_TO_STUDENTS`, off): "🎬 Watch the
  clip" under a maths question's worked solution on Practice, and under a lost-marks question on a
  marked paper when the marking matched the paper to the bank (`bankQuestionsForRun`). Adrian also
  gets "Make a clip". A student only ever sees a READY clip.
- **Adrian's list**: `/admin/question-clips` — every clip, its checks ✓/✗, minutes, voice cost, ▶,
  and 👍 / 👎 + "what's wrong" (§3, stored on the row).
- **Queue**: "Make a clip" queues the row; `scripts/clips/question-clip-worker.mjs` claims the oldest
  and runs the command (one at a time; a crashed run is re-queued once). **ON since 15 Oct 2026
  (Adrian: "Yes, switch on the clip worker on this Mac")** — two launchd jobs on Mac B:
  `com.adrianmath.questionclips` (the worker, log `/tmp/questionclips.log`) and
  `com.adrianmath.questionclips-site` (the 3211 site it plays clips on, log
  `/tmp/questionclips-site.log`). The site runs from its OWN clone, `~/dev/adrianmath-clip-site`
  — the first live test failed its look because another session rebuilt the main checkout while
  the clip played. After the clip player or `/app/clip` changes: `cd ~/dev/adrianmath-clip-site &&
  git pull -q && npx next build`, then `launchctl kickstart -k gui/$UID/com.adrianmath.questionclips-site`.
  Plists in `scripts/clips/`; `launchctl unload ~/Library/LaunchAgents/<file>` stops them. The Mac
  must be awake for a clip to be made. Logbook: `question-clips` per clip, `question-clips-worker` hourly
  (JOB_RHYTHMS 3 h); health check `question-clips` (a ready clip's voice is served; nothing waits
  over 2 h).

### The steps, each checked (the skill-clip steps of §8, plus four)

| Step | What | Check |
|---|---|---|
| 1 Gather | the bank row, its sub-skill filing, refusals first | `lib/question-clip preRefuse`: figure, graph/sketch, show-that/proof, words, > 2 parts, out of syllabus (whole or a part), national rows, unchecked twins, not AM/EM |
| Bible | the topic's bible, written ONCE by an Opus agent from Adrian's APPROVED notes (pull-notes) + approved pitfalls; `data/clip-bibles/_house.md` holds the rules every topic shares (his first-watch notes made general) | no approved notes → refused (`no-notes`) |
| 2a Plan | Opus plans the board and runs the maths check itself until it passes, or refuses | `scripts/clips/prompts/question-plan.md` |
| 4 Maths | `chain-check.py` again, independently, with `answer.bank` = the bank's answer verbatim | every line follows; every number of the bank's answer is on the last line. New kinds: `system` / `system_step` / `solution` (unknowns found together), sympy functions (`binomial`, `diff`), exact roots |
| **Fit** (new) | the plan rendered at 390 × 844 BEFORE any writing: a stand-in note under every line, each board at its fullest | 16 px spare above the bottom bar, nothing cut at the side, ≤ 2 boards; too tall → the planner splits or shortens (`scripts/clips/fit.mjs`) |
| 2b Drafts | two Opus writers in parallel, each running the verifier on its own draft (`draft-check.mjs`) until PASS | — |
| 5 Read | a fresh Opus reader picks, fixes what words can fix, scores the FIXED clip | every score ≥ 4; up to 2 rewrites, each read by a fresh reader; else failed |
| 3 Rules | assemble (board copied from the plan) + the lesson verifier | 0 errors, 0 warnings; board = the checked plan |
| 6 Voice | MiniMax voice, word timing, speech round trip | every line ≥ 85 % (scorer now reads "a half" = 1/2, "times" = *) |
| 7 Look | plays the stored clip at phone size; then a Sonnet agent looks at every picture | cues ≤ 0.3 s; nothing cut/overlapping/tiny/below the screen; pictures clean |
| Record | `question_clips` ready / failed with the reason; `job_runs` | — |

### The 10 (15 Oct 2026) — every check, per clip

All 10 passed every check on their last run. Links for Adrian (log in on the preview first):
`https://adrianmath-dev.vercel.app/app/clip/q/<id>` — or open the list at
`https://adrianmath-dev.vercel.app/admin/question-clips`.

| Question (bank) | Topic | Result | Maths | Fit | Read (lowest) | Rules | Voice (worst line) | Look (cues worst) | Pictures | Time | Voice US$ | Agent runs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `010271e0` Given that $(1-2x)^n = 1 + bx + 112x^2 + \dots$, find the value of $n$… | Binomial Theorem | **ready** | ✓ 20/20 | ✓ | ✓ 4 | ✓ | ✓ 86 % | ✓ 0.15 s | ✓ | 14 min 37 s | 0.079 | 8 |
| `46db0804` The coefficient of $x^3$ in the expansion of $(10 + kx)\left(2 - \frac… | Binomial Theorem | **ready** | ✓ 9/9 | ✓ | ✓ 4 | ✓ | ✓ 89 % | ✓ 0.15 s | ✓ | 8 min 41 s | 0.083 | 6 |
| `e7ebb728` The curve has the equation $y = x^2 - 4x + 7$. A line with gradient 1 … | Differentiation (Tangents and Normals) | **refused** — no-notes: no approved notes for AM Differentiation (Tangents | —  | — | —  | — | —  | —  | — | 0 min 2 s | 0 | 0 |
| `8e1c35ef` Solve the equation $3 - 2e^x = e^{-x}$.… | Indices | **ready** | ✓ 18/18 | ✓ | ✓ 4 | ✓ | ✓ 88 % | ✓ 0.15 s | ✓ | 6 min 50 s | 0.077 | 5 |
| `fe586b67` Solve the equation $2\log_3 p + \frac{1}{\log_{27} 3} - 1 = \log_3(8p … | Logarithms | **ready** | ✓ 13/13 | ✓ | ✓ 4 | ✓ | ✓ 94 % | ✓ 0.14 s | ✓ | 12 min 55 s | 0.084 | 7 |
| `a118ba7c` Solve the equation $\log_3 x-2\log_9 3=\log_9(x+4)$.… | Logarithms | **ready** | ✓ 13/13 | ✓ | ✓ 4 | ✓ | ✓ 92 % | ✓ 0.15 s | ✓ | 20 min 37 s | 0.083 | 8 |
| `225d1e85` Express $\frac{4}{x^{2}(x + 2)}$ in partial fractions.… | Partial Fractions | **ready** | ✓ 26/26 | ✓ | ✓ 4 | ✓ | ✓ 94 % | ✓ 0.15 s | ✓ | 10 min 9 s | 0.079 | 6 |
| `5827cfef` The expression $2x^3 + ax^2 + bx + 10$, where $a$ and $b$ are constant… | Polynomials | **ready** | ✓ 19/19 | ✓ | ✓ 4 | ✓ | ✓ 90 % | ✓ 0.15 s | ✓ | 13 min 1 s | 0.083 | 6 |
| `4e8ec758` Solve the equation $2x^3 - 7x + 2 = 0$, leaving non-rational roots in … | Surds | **ready** | ✓ 30/30 | ✓ | ✓ 4 | ✓ | ✓ 92 % | ✓ 0.15 s | ✓ | 16 min 11 s | 0.083 | 6 |
| `dc60d635` A right circular cylinder has a volume of $(6 + 2\sqrt{3})\pi$ cm$^3$ … | Surds | **ready** | ✓ 17/17 | ✓ | ✓ 4 | ✓ | ✓ 86 % | ✓ 0.15 s | ✓ | 8 min 22 s | 0.09 | 6 |
| `d7be01de` Express $(4 - \sqrt{3})^{2} - \frac{5}{2 - \sqrt{3}}$ in the form $p +… | Surds | **ready** | ✓ 24/24 | ✓ | ✓ 4 | ✓ | ✓ 89 % | ✓ 0.15 s | ✓ | 11 min 27 s | 0.099 | 8 |

**Time: median 12 min 11 s a clip (6 min 50 s – 20 min 37 s), NOT the 3–5 minutes aimed for.** Where
it goes: the plan ≈ 1 min, two writers ≈ 1½–3 min, the blind read ≈ 1½–2 min, each rewrite + re-read
≈ 3–4 min, voice ≈ 1 min, the look ≈ 1½ min (it plays the whole clip). Ways to shorten, not done:
start the voice while the look of an earlier clip runs; one writer instead of two when the first
read passes; the reader at medium effort. A made clip is instant for every later student.

**Cost per clip**: voice ≈ US$0.08 (MiniMax, ~800 characters); the speech round trip a few cents;
the agents run on the Claude plan (≈ 5–8 agent runs, ≈ US$4.8 a clip at list price — not charged
while it runs as Claude Code agents, but that is the bill if it ever moves to the API).

**Runs it took to get here**: 45 runs over these 10 questions while the pipeline was fixed (many
stopped by hand mid-run). The fixes, each found by a check on a real question:
1. The planner was told to put the law beside a line as a line note — the lesson format has no such
   note; the rule beside the step is the writer's `note` action (all plans failed the rules).
2. The blind reader numbered its fixed beats from 0; the assembler counts from 1 — a fix landed on
   the wrong beat. Now said plainly in the reader's prompt; a "0" key is read as 0-based.
3. Writers at medium effort, one rewrite: no clip passed the read. Back to step 1's shape: writers
   and reader at high effort, up to two rewrites, and the reader fixes what words can fix and scores
   the fixed clip (as it did on the 7 Logarithms clips).
4. "3 things appear in one beat", "175 words": writers and readers now run the verifier on their
   own drafts before handing in (`scripts/clips/draft-check.mjs`).
5. Boards taller than a phone: the long question in the intro, then the rule notes, made boards
   run under the bottom bar — caught by the look AFTER the voice was paid for. The fit check now
   runs on the plan, with the worst case drawn.
6. A dev server's live reloads (another session editing the player) stopped a clip mid-play; the
   look now runs on a production server.
7. The speech scorer counted "1/2" for "a half" as a miss (76 % on a correctly spoken line).
8. The picture read caught a "·" missing from a handwritten note (the hand font has no dot) —
   writers now use ×.

**Refused (recorded, not retried)**: `e7ebb728` (tangent to y = x² − 4x + 7) — Adrian's
Differentiation notes are not approved yet, so there is no bible to write from. Every
Differentiation, Integration, Kinematics and most Trigonometry topics are in the same state today
(0 approved units) — their questions are refused until he approves those notes on /notes.

### Not done / next

- **Adrian watches** — the first 20 question clips, 👍 / 👎 on each (§4); the switch stays off.
- **The queue worker runs on the Mac** (above) — it stops when the Mac sleeps; moving it to the Fly
  worker (Chrome, ffmpeg, sympy and a copy of the site to play the clip on) would keep it going.
- **Photos a student uploads** (no bank row): not built. The marked-paper door shows only when the
  paper matched the bank. A photo-read question needs a checked answer first — that is the next
  piece.
- **Graphs, proofs, words, figures** are refused (above); a "show that" could later land on the
  given result as its last line.
- **"Ask about this step"** (§8b) is not switched on for question clips (its "back" link goes to
  `/app/lesson/<slug>`), and writers do not yet add `asks` to question-clip beats.
- **3–5 minutes**: see Time above.
9. *"When you say plus means multiply, that's when you can just highlight log5+log6, then bring in
   the property right under this line, then the next line shows log(5x6), then the next line is
   log30, then so on."* → the laws clip re-cut in exactly that order (and the same for the minus);
   in a clip a `highlight` now STAYS lit — yellow chalk — through its beat and the next (it was a
   0.9 s glow that had faded before the eye got there): `lesson-board.tsx` 2b, `BoardPulse.beat`.
