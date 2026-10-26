# Clip pipeline — one-minute explanation clips, made automatically, to the approved standard

**Status:** Step 1 BUILT 15 Oct 2026 (Adrian approved the plan and said "yes" to step 1): the
pipeline for skill clips, run by hand, and the 7 A Math Logarithms clips — admin-only, waiting
for Adrian to watch them. Where it stands and how to run it: **§8**. **Step 2 (question clips)
BUILT 15 Oct 2026**: one command makes a checked clip for any bank question; 10 real A Math
questions made end to end, all 10 passing every check, admin-only, waiting for Adrian's watch —
**§9**. **Photo questions (no bank row) BUILT 15 Oct 2026** — 3 real hand-in questions made end to
end, every check passed, and a 4th student's photo of the same question given the clip in 18 s —
**§9b**.
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

### The log-equations clip, watches 3–5 (16 Oct 2026) — where it stands

- Rebuilt to Adrian's rules (`data/clip-bibles/_house.md` §2: Herbert Gross pace, the plan shown,
  pieces moving like a teacher's finger, each board opens with the last line, "negative" not "minus",
  a side link instead of a long aside). Draft G4: 4 boards, 28 beats, ~416 words.
- New side clip `log-of-negative-undefined-am` ("Why a log of a negative is undefined"), opened from
  step 4 by a link chip under the board (Beat `aside`); its back button returns to the same step.
- Watch 5 fixes: `2 = 2log₃3 = log₃3² = log₃9` on one line (a piece may move to a later token of its
  own line in a beat scene); "bring the power up", never "fly"; step 4 opens "For log equations, always
  check each answer"; a moving copy keeps its colour AND its line's text size (it fell to the board's
  17 px, so the 9 looked squashed) and scales the same both ways.
- Watch 6: the 2 is explained AT the 2 of `log₃(x−8) + log₃x = 2`, rewriting that line in place (new token
  field `replaces`, beat scenes only — a replacing token takes no room until shown; the tokens it names
  leave the line; the board re-fits and the chalk ink is wiped and re-laid). Draft G5, 28 beats.
- Watch 7 ("the transition to another screen is too sudden"): in a clip, the finished board fades out
  (0.7 s, `SCENE_LEAVE_MS`) and only then does the next board fade in (0.7 s) — every clip.
- Watch 8 ("make the lines move up, like scrolling up, then we don't have to change screen"): the clip is
  ONE scrolling board (scene `scroll: true`, `scrollClipBoard` in the player): the board fills the screen
  down to the slider, keeps the maths full size, and slides up (0.65 s) when the newest line would reach
  the subtitle; older lines fade off the top. Each step's title is a `heading` on its first line; the
  repeated "carry on" lines and beats are gone (draft G6: 11 lines, 26 beats, ~391 words). Voice reused.
- Watch 9: ← / → step back / forward one part of any clip (like a video player). A piece that goes up into
  a power leaves an empty space (`tokenAway` 'held'), so only it moves; the next rewrite of the line
  closes the space (`log₃3²` → `log₃9` replaces the 2 too).
- Watch 10: the board never slides while a piece is moving (the 2 goes up alone, then the board slides);
  the slide is a 1.1 s glide that only goes up in play. Seeking back (← or the slider) draws the board
  afresh at that point, with what earlier parts wrote already written (also anything shown while
  paused) — no stuck "Add Power", no half-written notes.
- Watch 11 (17 Oct 2026): routine steps go fast ("for solving of quadratic equations > can go faster … at
  AM level, students should know this well": step 3 is three short beats); a check takes the expression
  FROM the question line (`log₃(x−8)` flies down from line 1, "students may have forgotten"); EVERY
  answer is checked on the board, not only in the voice (x = 9: log₃(9−8) = log₃1, log₃9 ✓); a side
  link (Beat `aside`) opens its clip in a POPUP over the clip (page.tsx loads the side clips; the main
  clip pauses, ✕ / Esc / the end card closes it and the clip carries on). Draft G7: 13 lines, 27 beats.
- Watch 12: no rewrite of a line any more — `log₃(x−8) + log₃x = log₃9` is written on the NEXT line and
  the board scrolls (notes stay); the space the 2 left closes in one 0.6 s glide after it lands; the x = 9
  check names both logs (`log₃(9−8) = log₃1`, then `log₃x = log₃9 ✓`); the slider glides with the voice
  and follows a drag (step "any", thumb from the audio clock each frame), like a video bar. Draft G8.
- Watch 13: whatever was just written is always in full view (an older line scrolls back out of the fade —
  the pink "(rej)"); a finger drag or the mouse wheel looks back up the board WHILE the clip plays on
  (`attachBoardLook`), with "⬇ Back to now" (bottom right) or 4 s untouched gliding back to the writing.
- Watch 14: the slider is a video bar — a touch anywhere brings the thumb to the finger at once and it
  follows the drag, the clip seeks when the finger lifts; ⏪ 10 / 10 ⏩ jump about ten seconds of voice
  (a part's length from its words); "⬇ Back to now" sits just above the subtitle.
- **Rebuilt to the house rules (17 Oct 2026): Solving exponential equations** — one scrolling board,
  13 beats / ~180 words / ~1 min, the law first then each power moves down, factorise-out-x its own
  line, the rounding mistake as the last Watch out. Maths 11/11, blind read pass (6 beats fixed),
  voice 13/13 ≥ 88 %, look 19/19 on the voice, 0 problems. Next to rebuild: Linear Law with logs,
  Growth and decay, Log scales.
- 17 Oct 2026: the exponential clip ends `x = −8.57 (3 s.f.)`, said "correct to three significant figures" (draft R3, recorded after the voice top-up).
- **Rebuilt to the house rules (17 Oct 2026): Linear Law with logs** — one scrolling board, 16 lines, 19 beats,
  ~1.9 min: ln both sides, Add Power highlighted then applied, the power moves down in front of ln e, ln e = 1,
  compare with Y = mX + c by colour, the points from the question, n and A = e⁻¹ = 0.368 (3 s.f.), one
  Watch out (the sign of n). Maths 26/26, blind read pass (6 beats fixed), voice 19/19 ≥ 91 %.
  Player, same day: dragging the slider moves the board live (voice holds while dragging); skip buttons
  are ⏪ 5 / 5 ⏩; the question card is a navy "📝 QUESTION" band over white paper.
- **Gotcha (17 Oct 2026):** when beats are re-ordered or audio refs are dropped before `assemble.mjs`,
  `generate-narration.mjs` re-records EVERY line while `align-narration.mjs` only writes missing
  sidecars — old timings then sit against new recordings and cues fire early. After any voice change,
  run `align-narration.mjs <slug> --force`.
- Same day: the player keeps everything the current part talks about in view (a "focus" from the beat's
  actions); the question card is design B (white card, amber "Question" tag on its edge — Adrian's pick
  of six mock-ups).
- **Rebuilt to the house rules (17 Oct 2026): Growth and decay** — one scrolling board, 11 lines, 14 beats,
  ~1.4 min of voice: the start (t = 0, e⁰ = 1, P₀ = 100), the doubling (P = 200), 200 and 100 move into
  the model, divide, take ln (law first), 7.5k comes down in front of ln e, ln e = 1, k = 0.0924 (3 s.f.),
  one Watch out (P is 200, not 2). Maths 15/15, blind read pass (3 beats fixed), voice 14/14 ≥ 86 %.
- **Rebuilt to the house rules (17 Oct 2026): Log scales** (10 lines, 12 beats, maths 13/13, blind read pass,
  voice 12/12) and **Sketching a log graph** — the first clip with SKETCHES: a line can carry a `graph`
  (`StepGraph` in lesson-script.ts: `fn` in plain maths, bounds, dashed asymptote, labelled points; the
  player's `ClipGraph` draws the curve on in chalk when the line is written). Sketching: 9 lines with 3
  sketches (the shape of ln(−x), the curve against x = 2, the finished sketch with (0, ln 2) and (1, 0)),
  12 beats, maths 22/22, blind read pass (4 beats fixed — "the curve stops at the asymptote" was wrong:
  it only gets close), voice 12/12.
- **Rebuilt to the house rules (18 Oct 2026): Laws of logarithms** — one scrolling board, 7 lines, 16 beats:
  the plan as maths (+ → ×, − → ÷), bases lit, each law first, 5 and 6 then 30 and 10 move into one log
  (M orange, N blue), log₃3 = 1 with its reason, one Watch out on the × sign. Maths 10/10, blind read
  pass (6 beats fixed), voice 16/16 ≥ 89 %. **REVERTED the same night** (Adrian: "badly redone. Before redo is better … screen keep shifting up and down") — the approved first cut is back; a short clip stays one fixed board.
- **18 Oct 2026, after Adrian's watch:** Laws, Growth and decay, Log scales and Sketching are BACK to their
  approved first cuts ("badly redone. Before redo is better … Likewise for clips 5, 6 and 7"). The new-style
  rebuilds stay in git history (and the sketch feature, StepGraph, stays in the player for later). Kept in
  the new style: Solving log equations, Solving exponential equations, Linear Law. The question card now
  shows the whole question; scrolling boards draw the maths smaller.
- 18 Oct 2026: Growth and decay (the approved cut) changed ONLY where Adrian asked: "starts at 100 means when
  t = 0, P = 100"; we need k → k is the power → a log brings it down → e involved → ln, with a 💡 popup to the
  new side clip `why-ln-when-e-am` (lg works too but leaves lg e ≈ 0.434; ln e = 1); make e^7.5k the subject,
  THEN take ln; the power comes down in front of ln e; no Watch out. Then (Adrian: "should show the working of subbing in t=0 and P=100, then showing the working of how P_0 = 100"): t = 0, P = 100 → 100 = P₀e^{k(0)} → 100 = P₀e⁰ = P₀ → P₀ = 100. 15 beats, 10 lines (scrolls), maths 15/15, voice 15/15.
- On the test site only, admin-only. The other 5 Logarithms clips get this style once Adrian passes it
  (the laws clip he called good).

## 8b. "Ask about this step" — BUILT 15 Oct 2026 (admin + preview student)

Adrian, 15 Oct 2026: *"Can students interrupt and ask why ln is used when e is involved? And a model
answer it?"* — then, the same day: *"on a phone, it shouldn't go to another page, experience must be
seamless, a student should be able to continue watching the video, and type a side question, watch
that being reply, while video is still playing and student can see both"*.

- **Under every clip** one button, **💬 Ask about this step**. It opens a chat WITH the clip and
  never pauses it (`clip-ask-panel.tsx`):
  - **Phone**: a sheet over the bottom half of the screen. The clip scrolls up under the top bar and
    the board card shrinks (the CSS `scale` property — the scene's entrance animation owns
    `transform`) until the board and its slider sit above the sheet; it plays on. `fitClipBoard`
    stands down while the sheet is open (`data-chat-sheet`).
  - **Laptop** (≥ 1024 px): a panel beside the clip; the clip slides left and plays on.
  - ✕ (or the button again) closes it.
- **Ready questions** sit above the chat box as chips, for the step ON SCREEN — they change as the
  clip moves on. Written per beat in the lesson JSON (`beats[].asks`, ≤ 3, a student's own words,
  never spoken or drawn); all 7 Logarithms clips have them on every beat (a test checks:
  `src/lib/clip-ask.test.ts`); a beat without `asks` offers "Why this step?" / "Explain this step
  another way". New clips must carry `asks` on every beat (the writer and `assemble.mjs`).
- **What the solver gets** (`lib/clip-ask.ts`): in front of a question, whenever the step changed
  since the last one, the clip's title and topic, its question (`intro`), the board lines written so
  far (TeX, only the written tokens) and the beat's spoken line ("L N" → "ln"). The bubble shows only
  the student's question. Same solver, quota and Questions log as the Ask tab; text only.
- **Switch**: `CLIP_ASK_OPEN_TO_STUDENTS` (`lib/portal-beta.ts`, `docs/SWITCHES.md`). Clips themselves
  are still admin-only for students.
- **Check it**: `node scripts/clips/ask-look.mjs [slug] [--stop N] [--ask K] [--laptop] [--base URL]`
  — opens the clip, opens the chat, taps a question, checks the clip did not pause and moved on, and
  that board + slider and chat are on screen together; the answer only comes on the real site or the
  preview (the chat server answers those origins only). Local production build students can sign
  in to: `node scripts/clips/serve-prod.mjs build` / `start`.
- Kept from the first version: `/app/ask` still accepts a clip hand-over (`takeClipAsk`, "‹ Back to
  the clip", `/app/lesson/<slug>?at=<stop>` opens a clip at a stop) — nothing sends one now.
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
  must be awake for a clip to be made. First live proof 15 Oct 2026: `4a7d4fe8` (partial fractions)
  queued → ready in 10 min 11 s, every check passed. Two faults found on the way and fixed: another
  session's rebuild broke the page mid-look (→ the clip site's own clone), and launchd throttled the
  browser so a 1-minute clip took 4 minutes to play (→ `ProcessType Interactive` + Chrome without
  background timer throttling). Logbook: `question-clips` per clip, `question-clips-worker` hourly
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

### Re-cut to a new rule (15 Oct 2026)

When a standing rule is added after clips were made, the finished clips that now fail the verifier
are RE-CUT, not re-made: `node scripts/clips/recut.mjs <qc-slug | questionId>`. An Opus agent
(`scripts/clips/prompts/recut.md`) changes only the flagged beats' board actions; guards with no
model check that every spoken word, every board line and every voice file is unchanged (so the
recorded voice still fits), and the verifier shows 0 errors and 0 warnings. Then the phone look and
the picture read run again (one more agent round if the pictures show a problem); pass → `ready`
with `gate.checks.recut`, fail → the stored clip stays the earlier version. About 2 minutes a clip,
no voice money. First use: Adrian's second watch (commit 351565df — a mistake said is shown as a red
✗ note, "the base" lights the bases) flagged 12 question clips. **Result (15–16 Oct 2026): 11 re-cut**
in 1½–9 min each (qc-10efe9bc, 1a9842f6, 46db0804, 4a7d4fe8, 5827cfef, 8e1c35ef, a118ba7c,
c9e82111, d7be01de, dc60d635, fe586b67) — every one through the look and the picture read again;
**1 re-made** (qc-4e8ec758: both beats near its trap already held two things, so the ✗ note had no
room without new words — the worker re-made it under the new rules, ready in 16 min). All 12 now
show 0 findings. One picture read flagged a raised "ʳ" drawn as a tick in a note (a second read
passed it); writers are now told to avoid ʳ ⁿ ᵏ in notes.

### Re-voice in the current voice (16 Oct 2026)

Adrian picked a new clip voice on 16 Oct 2026 ("can the voice be more upbeat?" … "use voice C":
MiniMax `English_FriendlyPerson`, emotion happy, speed 1.1 — the defaults of
`generate-narration.mjs`). New clips get it automatically. Finished clips are re-voiced with
`node scripts/clips/revoice.mjs <qc-slug | questionId>`: words and board guarded unchanged, every line
re-recorded, timing redone, the speech round trip (a low line → recorded again once), the files under
a NEW folder (`question-clips/<id>/v<time>/`, so a phone never mixes cached old and new), then the
phone look again (every board move on its word). No writing model; ≈ 2½ min and ≈ US$0.09 a clip.
Fail → the stored clip keeps the old voice. **Result (16 Oct 2026): 13 of 15 ready clips re-voiced**
(speech round trip ≥ 85 % on every line, every board move on its word). The other 2 were re-made
by the worker instead: qc-225d1e85 (the new subtitle strip covered part of a working line — a
layout clash with the new player, not a voice fault) and qc-b3002e82 (made by a test run whose
working files were not kept, so there was nothing local to re-voice from). qc-b3002e82 turned out
to be a photo question identical to qc-10efe9bc, so the worker copied that (re-voiced) clip in 16 s.
**qc-225d1e85 is FAILED for now**: under the new player a beat whose spoken line wraps to three
subtitle lines covers the board's last working line (the player reserves less room than a 24-word
line needs). Reported to the session that owns the subtitles; `fit.mjs` now fails a plan whose maths
sits under a 24-word subtitle (`--shot <dir>` saves what it measured), so new plans leave room. **Fixed 16 Oct 2026**:
the player now plays a spoken line in pieces of ≤ 72 characters (never more than two subtitle lines,
f0877f92); qc-225d1e85 re-made by the worker in the new voice, every check passed (11 min). All 15
ready clips are in voice C.

### Not done / next

- **Adrian watches** — the first 20 question clips, 👍 / 👎 on each (§4); the switch stays off.
- **The queue worker runs on the Mac** (above) — it stops when the Mac sleeps; moving it to the Fly
  worker (Chrome, ffmpeg, sympy and a copy of the site to play the clip on) would keep it going.
- **Photos a student uploads** (no bank row): BUILT 15 Oct 2026 — §9b.
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

## 9b. Photo questions — BUILT 15 Oct 2026 (admin + preview student)

Adrian, 15 Oct 2026: clips for ANY question a student uploads, not only bank questions. Until now
the 🎬 door on a marked paper showed only when the marking matched the paper to the bank.

### What is different from a bank question

A bank question comes with a checked answer and solution. A photo question has neither, and the
marker's own reading of it (`result_json.results[].marking_output.question.prompt`) is a SHORT
retelling — it drops words and sometimes numbers ("Matrix P of prices at stores A and B…"). So
three steps run first, then the bank pipeline of §9 unchanged:

| Step | What | Check |
|---|---|---|
| Photo read | the hand-in photos of that question (plus the page before, in case it starts there) are fetched from `student-files`, shrunk to 2000 px, and an Opus agent copies the PRINTED question word for word, ignoring the handwriting (`prompts/photo-read.md`); it names the level and one topic from the canonical list | refused when not on the photos, cut off, or a value unreadable; **every number the marker read must be in the photo reading** (`numbersMissing`) — else refused (`reading`) |
| Same question? | `text_hash` = sha-256 of the normalised reading (`questionTextHash`: case, spaces, `$`, `\left`, `\dfrac`, `[3]` taken out) | a READY clip with the same hash → copied (`same_as`), no drafting, no voice — **18 s** |
| Two blind solves | two Opus agents, each reading only `solve-input.json` (the question and level), solve it (`prompts/blind-solve.md`; sympy allowed) and give each part's answer in sympy | `answers-agree.py`: roots as sets, ranges as sets of reals, points entry by entry, expressions by simplify(a − b) = 0, decimals rounded alike — **any part not agreed → refused (`unchecked`)**; nothing is guessed |
| Then §9 | the agreed answer becomes `answer.bank` for the independent maths check; solve A's working is the "bank solution" the planner reads | plan → maths → fit → two drafts → blind read → rules → voice → look → pictures, exactly as §9 |

The usual refusals still apply before any solve (figure, graph, show-that, words, > 2 parts).

### Where it lives

- `question_clips` (migration `migrations/question_clips_photo.sql`, applied 15 Oct): the foreign key
  to `questions` is gone; new columns `source` ('bank' | 'photo'), `origin` {run_id,
  question_number}, `question_text` (the photo reading), `text_hash`, `same_as`. A photo clip's id is
  `photoClipId(run, number)` — a stable uuid, so the marked page finds its own door with no lookup.
- Command: `node scripts/clips/question-clip.mjs --run <marked run id> --q <number>` (or the row id
  once queued — the worker runs photo rows the same way as bank rows).
- Door: on `/app/marking/<id>`, every lost-marks question the bank match did NOT cover gets the 🎬
  door (`photoClipIdsForRun`); Adrian's "Make a clip" posts `{photo: {run, q}}` and
  `enqueuePhotoClip` queues the row. A student only ever sees a READY clip, and only once
  `QUESTION_CLIPS_OPEN_TO_STUDENTS` is on (admin + preview student until then).
- `/admin/question-clips` shows a photo clip as "📷 photo, Q<n>" linking to the marked paper, with
  its photo reading and the three new checks.

### The 3 (15 Oct 2026) — every check, per clip

Links (log in on the preview first): `https://adrianmath-dev.vercel.app/app/clip/q/<id>`.

| Clip id | From (marked paper, question) | Question (read off the photo) | Topic | Result | Photo read | Two solves | Maths | Fit | Read (lowest) | Rules | Voice (worst line) | Look (cues worst) | Pictures | Time | Voice US$ | Agent runs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `1a9842f6` | A MATH TKGS Paper 1, Q3 | Express $\frac{2x+3}{(x-1)(x^2+4)}$ in partial fractions. | Partial Fractions | **ready** | ✓ | ✓ $\frac{1}{x-1}-\frac{x-1}{x^2+4}$ both | ✓ 30/30 | ✓ | ✓ 4 | ✓ | ✓ 90 % | ✓ 0.15 s | ✓ 19 | 14 min 50 s | 0.083 | 9 |
| `c9e82111` | A MATH TKGS Paper 1, Q1 | A line $3x + y = k$ meets the curve $y = x^2 - 2x + 3$ at only 1 point. Find $k$. | Nature of Roots (new bible) | **ready** | ✓ | ✓ $k = \frac{11}{4}$ both | ✓ 19/19 | ✓ | ✓ 4 | ✓ | ✓ 89 % | ✓ 0.15 s | ✓ 16 | 17 min 5 s | 0.083 | 10 |
| `10efe9bc` | ADRIANMATH 2026 AM P1 Set 1, Q1 | $y = x^2 - 2kx + 3k$: (a) complete the square, minimum point $M$; (b) $k$ for which $M$ lies on $y = 2x - 6$ | Quadratic Functions (new bible) | **ready** | ✓ | ✓ (a) $(k, 3k-k^2)$ (b) $k=-2, 3$ both | ✓ 19/19 | ✓ | ✓ 4 | ✓ | ✓ 90 % | ✓ 0.15 s | ✓ 18 | 10 min 26 s | 0.079 | 10 |
| `b3002e82` | AMATH set 1 paper 1 (another student), Q1 | the same question, read off a different student's photo | Quadratic Functions | **ready — copied** from `10efe9bc` | ✓ | — | — | — | — | — | — | — | — | **18 s** | 0 | 1 |
| `3c6e9f0e` | 2025 Amath Paper 1, Q2 | the set of $k$ for which $y = kx^2 + 2x + k + 1$ is completely below $y = x + 1$ | Nature of Roots | **refused** — the working is a chain of inequalities, and the maths check has no inequality kind | ✓ | ✓ $k < -\frac12$ both | — | — | — | — | — | — | — | 2 min | 0 | 5 |

The two readings of the same printed question by different students (306 and 308 characters) hashed
alike — the normalising did its job on a real pair.

**Fixes the runs forced** (both in `answers-agree.py`, before any clip was made from them): a point
`(k, 3k − k²)` was compared as a number (always "different") — points now compare entry by entry; a
decimal answer printed by sympy as `2.65000000000000` counted 14 places — trailing zeros are dropped.

**Cost per photo clip**: the bank clip's cost (§9) plus three agent runs (the reading, two solves,
≈ 1 min together); voice ≈ US$0.08. A copy for the next student costs one reading (≈ 20 s).

### Made by hand from a photo Adrian sent (25 Oct 2026)

Adrian sent a photo of a student's attempt: *"able to create a clip to explain this question?"* The
automatic pipeline would refuse it (three parts, a "show that", and no approved Kinematics notes), so
it was made by hand with the skill-clip recipe (§8 + `_house.md` §6) as a lesson slug:
**`oscillating-dot-am`** — `/app/lesson/oscillating-dot-am` (admin + preview student). The question
is in the bank (`3fd0c2a4`, A Math Kinematics: a dot on a 120 cm screen, x = a sin nt, period 6 s);
the student got (a) and (b) and stopped on (c) at "when t = 6/4". The clip: the plan
`x → dx/dt → d²x/dt²` pinned in the corner; "what it says" (each letter lit, the A–O–B picture with
120 cm across and 60 each side); (a) −1 ≤ sin nt ≤ 1 ⇒ −a ≤ x ≤ a, a = 120/2 = 60, period 2π/n = 6
⇒ n = π/3 (why 2π/n: a drop-down); (b) v = 20π cos(πt/3), max speed 20π cm/s; (c) THE TRAP — "at A"
is the END of the swing: the picture again with x = −60 at A, so sin(πt/3) = −1, no t needed (why
t = 1.5 is the other end: a drop-down), acceleration 20π²/3 = 65.8 cm/s² (3 s.f.). 18 lines, 30
beats, 458 words, ~2.6 min. Checks: maths 29/29 (derivatives by `identity`); two storyboard reviews
(1 must both runs — "divide by sixty" said with no move → reworded), then two passes; voice once,
30/30 heard (worst 85 %; `asr-score` now reads "cm"/"centre" and "one hundred and twenty");
look at 1280 × 640: 0 problems; phone look first failed — **a long 3-part question card pushed the
board under the bottom bar (board bottom 907 > 783 px)** → the card's question cut to its story-free
wording (every number kept; board bottom 775 px), phone look 46/46 cues, 0 problems; review with
phone frames: 1 must (the corner plan covered the long heading) → heading "What it says". Not
promoted.
**Adrian's first notes (26 Oct 2026), all three applied the same day** (rules in `_house.md` §2): "include
the diagram on the board straight away" → the screen picture is the first line; "the front part before
what the question says seems unnecessary" → no question read-out, no corner plan; "animation that shows
how the dot moves from O to A to O to B to O and how the graph draws out … then how to find the values of
unknowns from the graph" → a NEW board figure, the **swing** (`EquationStep.swing` + the `swing` action,
`ClipSwing` in `lesson-player.tsx`, test `lesson-swing.test.ts`): the path A–O–B upright beside an x–t
graph labelled x = a sin nt, the dot going O → A → O → B → O in 6 s while the curve is drawn at its height
(a dashed line joins them), then 60 / −60, A at the top, B at the bottom and "one oscillation: 6 s" appear
and light as (a) reads a = 60 and the period 6 off the graph (A's side positive, so at A x = 60, sin = 1,
and the student's t = 1.5 is when it first gets there — a drop-down). 32 beats, 458 words. Storyboard
reviews: musts (label the curve; say "magnitude"; "part A"/"point A"/"constant A" heard alike → "the first
part", "point A") fixed, then two passes. Voice: the changed lines re-recorded, 32/32 heard. Looks: the
figure first pushed its own line into the top fade (phone board only ~276 px under the question card) →
the figure shortened to 128 px; phone and 1280 × 640 both 0 problems. Review with phone frames 0 must; gate
green. Waiting for Adrian's notes.

**`line-misses-curve-am`** (25 Oct 2026) — `/app/lesson/line-misses-curve-am`. Adrian: *"create a clip
to explain this too"* — a photo of his own red/blue marking of a student's (c): the bank's `b071686f`
(A Math, the curve y = (4x + 2)/(x + 1) for x > −1; (c) the line y = c does not meet it — by writing
it as a + b/(x + 1), explain why c ≥ 4). The clip follows HIS chain from the ink, in his order: the
question (x > −1 lit; the curve drawn on a side sketch; "y = c is a horizontal line" drawn on it);
`Explain why c ≥ 4` written; the plan `y = a + b/(x+1)` in the corner; divide — y = (4(x+1) − 2)/(x+1),
the split line, y = 4 − 2/(x+1), a = 4, b = −2; the sign chain one line each (x > −1 ⇒ x + 1 > 0,
2/(x+1) > 0, −2/(x+1) < 0, y = 4 − 2/(x+1) < 4); "think graph is below y = 4" — the dashed y = 4
over the curve; "think y = c horizontal line must be 4 and above" — the line y = c SLIDES: c = 1 cuts
the curve (a dot), c = 4 still misses (the curve never touches 4 — why c = 4 is allowed, said at
that step), c = 5 misses; c ≥ 4 boxed. 11 lines (scrolls), 19 beats, ~1.8 min. **New for every clip:**
a side sketch may leave out the corner shapes (`inset`; the `shape` stage then draws the curve on),
and may carry `hline` — a horizontal line that slides between heights (`{do: "sketch", line: i}`)
with a dot wherever it meets the curve; `chain-check.py` gains `ineq` (an inequality true on the
whole domain) and `misses` (the values of c for which y = c misses the curve — it fails "c > 4").
Checks: maths 20/20; storyboard reviews 2 must (write the aim; show the split line) → 0 → 0; voice
once, 19/19 heard (worst 94 %); the 1280 × 640 look first hid the split line under the top fade (a
note under the line above, then two tall fractions in one beat) → the note became a highlight and
the next line waits for the next beat (voice unchanged). Reviews with phone frames: 2 must (c = 4 on
the dashed y = 4 — both labels crossed mid-slide → the line slides in 0.65 s, labels outlined; the
4x + 4 − 2 = 4x + 2 working only said → a note) → 2 must (the curve "goes down forever near x = −1"
with no x = −1 drawn → a new sketch `edge` stage, a dashed vertical line; "it equals four" said a beat
before the 4 → beats 8–9 re-worded, two lines re-recorded) → pass (0 must; shoulds left for Adrian:
"so it cancels" → "dividing top and bottom by x + 1 leaves four", light the −2 as b, drop the "sign
of b/(x+1)" sentence). Test site: phone 27/27 cues, 0 problems; 1280 × 640: 0 problems. **Gate green
25 Oct 2026.**
**Adrian's first notes (26 Oct 2026), all five applied the same day** (rules in `_house.md` §2, `writer.md`,
`reviewer.md` item 19): "say it does not intersect the curve" (not "misses"); "don't have to read the
question, but explain what the question is asking" (beat 1 now says what it is about); "do long division
instead" — the division drawn the way he writes it and built ROW BY ROW as it is said (new: `write` with
`inside` writes one piece of a token; pieces some write names stay hidden until then), then "quotient plus
remainder over x + 1" gives y = 4 − 2/(x+1), the −2 lit as b; "put the equation y=(4x+2)/(x+1) beside the
graph" (new sketch `label`, a stacked fraction beside the curve); "i can't scroll up to the very top" while
it plays → fixed in the player for every clip (the look-back may go past the faded top strip under the
corner plan; checked in a browser at beat 13: the first line in full view). Voice re-recorded (19 lines,
19/19 heard). Not promoted. Waiting for more notes.

### The player layout for clips (Adrian, 15 Oct 2026)

*"can we have the whole question on one side, then the explanation part by part on another side,
then the voice transcript at the bottom of the clip, like how youtube have subs, then the drag
slider at the bottom, after the clip"* — built in `lesson-player.tsx`:
- **Laptop (≥ 1024 px)**: a question clip shows the WHOLE question in a panel on the left (photo
  clips: the reading they were made from; bank clips: the bank text), the board on the right. The
  panel steps aside while the "Ask about this step" chat is open, so the chat still has its room.
- **Phone**: no room beside or above the board, so a 📄 pill in the header lays the whole question
  over the board; a tap closes it.
- **Subtitles** (every clip): the spoken line in a dark strip over the bottom of the board, words
  lighting up as they are said. The board keeps that strip clear, so no working is covered.
- **The slider** is last, under the clip.
- To make room, `fitClipBoard` may now shrink the maths to 0.56 (≈ 14 px on a phone, was 0.7) and
  shrinks the gaps between lines with it (down to a quarter) before the board would run under the
  phone's bottom bar.

### Not done / next (photo questions)

- **Inequalities**: "find the set of values of k" questions are refused — `chain-check.py` needs an
  inequality kind (each line's solution set equals the one before) before they can be checked. Many
  Nature of Roots / Quadratic Inequalities questions are this shape.
- **Only A Math topics with approved notes** (15 today: Logarithms, Indices, Surds, Polynomials,
  Partial Fractions, Binomial, Nature of Roots, Quadratic Functions/Inequalities, Simultaneous
  Equations, Linear Law, Coordinate Geometry, Circles, Plane Geometry, Trig Applications); the rest
  are refused `no-notes` like bank questions. E Math has no approved notes yet.
- **Asking happens on press**: a photo clip is made when Adrian presses "Make a clip" on the marked
  paper (or the command). Making one for every lost-marks question automatically after marking is
  the next step once he has watched these.
- **Practice photos** (`practice-photo`, `portal_generation_log.seed_text`) are not wired: those
  questions become generated bank rows already, so they take the bank door.
- **The clip site** (port 3211) runs from its own clone (`~/dev/adrianmath-clip-site`); the door code
  reaches it when that clone is updated — the pipeline itself only needs the clip page, which did
  not change.

10. **The new player layout** (whole question beside the clip on a laptop / behind 📄 on a phone,
    YouTube-style subtitle over the board's foot, slider last — built in the photo-clips session,
    a9566614): the 7 Logarithms clips had no question box, because only question clips passed one.
    Now a clip script carries `question` (the whole question as his notes set it), the lessons page
    passes it, and `look.mjs` checks the question shows, the subtitle never covers written maths and
    the slider is below the board (`--width 1280` plays a laptop). Re-played on the preview,
    15 Oct 2026: all 7 pass at 390 × 844 (📄 button) and at 1280 × 800 (question panel) — every board
    move on its word (worst 0.18 s), no look problems.

- **18 Oct 2026 — side point: clip sheet vs written drop-down, on trial.** Adrian: "how about instead of a popup clip, we have a written explanation (drop down)? put that in too, and i compare which is better?". `Beat.aside.read` (string[], ≤ 10 lines ≤ 140 chars, checked in `lesson-verify.ts`) shows a "📖 Read why instead" chip beside the 💡 clip chip; it drops a card of the lines under the board and pauses the clip. Growth and decay (beat 7) has both. **Picked the same day: "Keep the written drop-down, drop the popup clip."** An aside with `read` now shows only the written chip; log equations' "log of a negative" point got its `read` lines too. The two side clips (`why-ln-when-e-am`, `log-of-negative-undefined-am`) stay in the catalogue but nothing links to them.

- **18 Oct 2026 — Log scales: why we start by subtracting.** Adrian: "62-50=10 lg ... needs to be further explained. it is unclear why this step works and why start from this step". Draft W2 (= W1 with its blind-read fixes baked in; the old `fixed_beats` kept under `history` in `blind-read.json`): two new board lines, `50 = 10lg(I_p/k)` and `62 = 10lg(I_d/k)` (plan checks `form`), then a beat on why (we want I_d/I_p, k unknown, subtracting joins the logs and k cancels), then the subtraction line. Everything else unchanged. Re-voiced (all lines, align `--force`); b2/b5 recorded twice (b5 had dropped "is"). Gate: rules, maths 10/10, read, look.

- **18 Oct 2026 — two checks that stand in for Adrian (his "build #1 / build #2").** Why: each clip still took ~10 of his notes; most were the same few kinds (said but not shown, not explained, not lit, no picture, phone layout).
  - **#1 said but not shown** — `src/lib/clip-said-shown.ts` (+ test), wired into `clipIssues` (a warn fails the gate's `rules`). Spoken numbers → digits ("sixty-two" → 62, "zero point six nine three" → 0.693), letter names → subscripts only when the clip uses them ("I P" → I_p, "P nought" → P_0), "I D over I P" → the fraction; each must be on the board (lines, notes, pinned steps, sketch labels) by the end of its beat; the first beat (reading the question) is exempt; counts ("four steps", "step one", "base ten") are skipped. **Calibration: flags all 5 old cuts Adrian corrected for this; the 7 current clips pass.**
  - **#2 the stand-in reviewer** — `scripts/clips/review.mjs` + `scripts/clips/prompts/reviewer.md`: Opus 5.5 reads the house rules + a beat-by-beat storyboard (voice, what the board adds on which word, what it shows after) + up to 24 phone frames from look.mjs, returns `{verdict, findings[{beat, rule, severity must|should, problem, fix}]}` → `data/clip-runs/<slug>/review.json`; the gate's `review` check needs no `must`, newer than the lesson. ≈ 12–22k tokens in, 2–3k out a clip. **Calibration (text only, old cuts from git): it gave Adrian's own note on 6 of 6** — Growth "write t = 7.5, P = 2 × 100", Log scales "why start from 62 − 50", "explain the question first", "light I and k / show the substitution", Sketching "draw the graph", "list the four steps / the four shapes first". Caveat: those notes are now IN the house rules it reads, so this shows it applies the rules, not that it finds new kinds of note. Controls: Log scales (approved) → 0 must; Solving log equations (approved) → 1 must ("move it across … becomes plus" is the bring-it-across shortcut — a fair note, left for Adrian).
  - Next: run both on the next topic (Indices) built in one go, and count Adrian's notes (target ≤ 2 a clip, from ~10).
- **18 Oct 2026 — the one-shot test, Indices clip 1 (`same-base-compare-powers-am`, Adrian: "build the Indices clips in one go with both checks … but let's do it one by one").** Written straight to the house rules from note 108.27 (5^(x+2) = 25^(x−1)): 2 steps pinned and lit, the plan as maths, 25 = 5² lit and written, Times power named, the 2 moved into the power, why equal bases mean equal powers, the powers moved down, 2 + 2 = 2x − x, x = 4 boxed. Said-shown: 0. Stand-in review, text: pass, 3 should (2 taken: 25 = 5² note, the 2 + 2 line). With 23 phone frames: 1 must + 4 should — both "must"-level points were false alarms (a piece caught mid-move read as "a stray 2"; "only the left 5 lit" when both were) → the reviewer's brief now says so. The count of Adrian's notes on it is the measure.
- **18 Oct 2026 — Indices clip 2 (`solving-by-substitution-am`, note 108.28: 4^x − 3(2^x) + 2 = 0).** 4 steps pinned and lit; 4 = 2² with Times power; 2^{2x} = 2^{x×2} = (2^x)² = a² with m = x, n = 2; 3(2^x) = 3a; a² − 3a + 2 = 0 → (a − 2)(a − 1) → a = 2 or 1, "2^x > 0: both allowed"; a = 2: 2^x = 2 = 2^1 ⇒ x = 1 (the ⇒ on the reason); a = 1 → x = 0; boxed. The stand-in reviewer's musts fixed over 4 rounds (said-not-shown (2^x)² = a² and 3a; pointing back up a scrolled board; the key step's middle line). **Seen: the reviewer is not deterministic** — one run passed, the next found a new (fair) must; run it twice and take the union of musts before calling a clip done.
- **19 Oct 2026 — Indices clip 3 (`compare-powers-two-unknowns-am`, note 108.06: two unknowns from one identity → x = 3, y = 4), built alone in a fresh session, the recipe in order (review before recording).** Board: question; the plan as maths a^□ b^△ = a⁹ b¹ ⇒ □ = 9, △ = 1; Step 1 power first ((M/N)² note, then Times power, 2(x+1) written, then expanded); Step 2 group the same bases; Step 3 Minus power, brackets kept; Step 4 each power tidied (minus a bracket flips every sign inside); the bare b written as b¹; Step 5 the powers moved down, one equation per base ("Why?" drop-down: take b = 1, then a = 1); Step 6 solved together, fast; boxed. 18 lines (the scroll cap), no steps strip, no Watch out. Storyboard reviews: 2 runs pass → after the shoulds were taken, 1 must (the squared-fraction middle line skipped) → fixed → 1 must ("= 1" written a beat late) → fixed → 2 passes. Voice recorded; then the phone review passed but said the Step 4 chains printed small → the collected powers moved into the next line and the voice re-recorded once (two beats dropped, one changed). Recurring should we left: "light which a sits over which a" — a \dfrac is one token, so its top and bottom cannot light apart.
- **19 Oct 2026 — Indices clip 4 (`split-the-power-am`, note 108.15: (3ⁿ⁺¹ − 3ⁿ⁻²)/(3ⁿ⁻¹ − 3ⁿ⁺²) = −1/3), built alone in a fresh session, the recipe in order.** Board (one expression, line by line, scrolls): the question read top then bottom; why nothing cancels yet (drop-down: only a factor of the whole top and bottom cancels); "Plan: 3ⁿ(□)/3ⁿ(△) = □/△"; every power split (Add power in reverse, each of the four terms lit as named); the common mistake 3ⁿ + 3 at that step; 3ⁿ taken out; cancelled; a negative power is one over (3 − 1/9)/(1/3 − 9); 26/9 over −26/3; times its flip; boxed −1/3. Storyboard reviews: 1 must each run (the plan line read as part of the chain → labelled "Plan:"; the jump to the calculator hid 3⁻² = 1/9 → that line added) → two passes. Voice recorded once (3 lines timed out and were re-run). Phone review: pass; its shoulds taken without changing the voice (no jump back up to the question during the splits; the flip line written). **Adrian's first note, same day: "for this last part here can just use calculator"** → the (3 − 1/9)/(1/3 − 9) and flip lines removed (cancel → 26/9 over −26/3 → −1/3), two voice lines re-recorded; the rule is in `_house.md` §2, `writer.md` and `reviewer.md` §11.
- **19 Oct 2026 — Indices clip 5 (`evaluate-10-to-the-x-am`, note 108.23: 2ˣ⁺² × 5²ˣ⁻¹ = 5ˣ⁻¹ → 10ˣ = 1/4), built alone in a fresh session, the recipe in order.** Board (one equation, 11 lines, scrolls): the question; `10^x = ?` (why not find x: a written drop-down); the key fact 10ˣ = 2ˣ × 5ˣ (Same power); the plan said (put 2ˣ beside 5ˣ, glue); fives grouped; Minus power with brackets + the common mistake at the step; brackets opened; 5⁻ˣ; split the power of 2 and the negative power flips (one line, as in his notes); cross multiply; 2ˣ × 5ˣ moves into 10ˣ; ×4 = 1; boxed 1/4. Storyboard reviews: 1 must in both runs (lighting the key fact far up a scrolled board) → fixed → passes. Voice once, ASR 24/24. Phone look: one look-back at the scrolled-off question removed. Phone review pass, gate green. **Adrian's four notes the same day** (find 10ˣ not x; "we need 2^x times 5^x … the base is 2 and the other base is 5"; 5^(2x−1) seen flying down under 5^(x−1); say why + name the property) → applied, saved in `_house.md` §2, `writer.md`, `reviewer.md` §14. New in the player: a token's `into` (a piece lands inside part of the next line, e.g. a fraction's bottom) and `fromPiece` (a flight starts from a piece); a flying piece keeps its KaTeX look. Voice re-recorded, gate green. Then his move notes the same evening (equation written again and the move inside it; smooth; under first, then tidy; the fraction line drawn once under) → **approved: "good, this animation is good. remember it for future clips"** — the reference move, `_house.md` §2.
- **20 Oct 2026 — Exponential graphs re-made on Adrian's second notes:** question y = 2e⁻³ˣ + 1; side-sketch stages `stretch` (the morph) and `shift` (curve AND horizontal asymptote slide, `asymptote.labelAfter`); corner labels one per corner; the shape cut where it would leave the window after its shift. **Player bug fixed for every clip:** `Tex` passed a fresh `{__html}` each render, and React 19 rebuilt every piece of maths on each player tick — a lit `\htmlClass` piece flickered ("the highlight for e and x flickers"). Gate green.
- **21 Oct 2026 — Surds clip 1 APPROVED** (Adrian: "great, the clip is good. make sure you remember what we have learnt today for future sessions"). It is now the reference for teaching a NEW method — `_house.md` §6 "The reference for teaching a NEW method" lists the order (word → plan as the move → the new object written as a sentence → do it → the form → the squares → THEN why) and the look/check lessons.
- **20 Oct 2026 — Surds clip 1, Adrian's fourth notes, applied:** "a lot of blinking and enlarging momentarily … usually a highlight will do" → the player no longer pulses a token on a highlight in a clip (`lesson-board.tsx`, all clips); "the bottom has two surd terms"; `Conjugate of √5 + √3 is √5 − √3` written as one line, its + and − lit as the how is said. Rules in `_house.md` §2. Two voice lines re-recorded.
- **20 Oct 2026 — Surds clip 1, Adrian's third note, applied:** "show sqrt 5 - sqrt 3 is the conjugate, then explain from there; then … the multiplication … expand, point out that the bottom is in the form a^2-b^2; then do the multiplication; say that's why it works" → `Conjugate: √5 − √3` is a board line written first; why-it-works said only after (√5)² − (√3)² → 5 − 3. Rule `_house.md` §2 "Write it, do it, THEN say why it works" (replaces the second-note order rule). Voice re-recorded (16 lines).
- **20 Oct 2026 — Surds clip 1, Adrian's second notes, both applied:** the plan "the same value, written with no surd in the bottom" ("not useful, confusing") → the plan names the move, `Plan: × conjugate/conjugate`; "show the multiplying … by the conjugate first before saying why it works" → the × conjugate line is written before "why it works". Rules in `_house.md` §2, `writer.md`, `reviewer.md` item 18. Voice re-recorded (17 lines).
- **20 Oct 2026 — Surds clip 1, Adrian's first notes, both applied:** (1) "plan can't be seen at the top right hand corner > it's partially covered (why is this happening again?)": the corner box was padded for a one-line plan and a fraction plan touched its border → `.lsn-corner` padding 9 px top / 7 px bottom (`lesson-player.tsx`); (2) "no need to say multiply by root five alone … just go straight to saying if there are two terms below, multiply by the conjugate, and explain what is the conjugate and why multiplying by the conjugate works" → opening re-cut: when, what, why ((a + b)(a − b) = a² − b² + squaring removes the root; the worked expansion in a drop-down); voice re-recorded. Rules in `_house.md` §2, `writer.md`, `reviewer.md` item 18.
- **20 Oct 2026 — Surds clip 1 (`rationalise-conjugate-am`, skill 3.4, note 107.13 on his worked example 107.14: 2/(√5 + √3) = √5 − √3), built alone in a fresh session, the recipe in order.** 8 lines, scrolls, ~2 min; plan `…/no surd` in the corner; the conjugate's middle sign lit; (a + b)(a − b) = a² − b² with a, b lit in colour. Storyboard: 1 must (a said-not-written /2 line) + a corner false alarm → `review.mjs` storyboard now marks a `corner` line. The 640-tall laptop look caught 8 hidden-while-talked-about (notes between tall fraction lines) → notes moved/dropped, voice unchanged. Lesson for fraction-heavy clips: on a short window a tall line + a note + the next line barely fit under the corner plan — keep notes off the lines the next beat pairs. Waiting for Adrian's notes (`_house.md` §6).
- **20 Oct 2026 — Indices clip 7 (`laws-of-indices-am`, skill 3.1, notes 108.01 + 108.03; his notes have no worked example, so a real school question: bank `8006348c`, [(98/3)⁻³ × ∛9] ÷ 7/2 = 2ˣ3ʸ7ᶻ → x = −2, y = 11/3, z = −7), built alone in a fresh session, the recipe in order.** One expression line by line (11 lines, scrolls, ~3 min): negative power flips, ÷ 7/2 = × 2/7, 98 = 2 × 7², the bottom is the root, Same power + Times power, every bottom MOVES up as a negative power (`fromPiece` + `into`, two pieces per move), Add power per base, the full equation written again and each base pair lit, x, y, z written as said, boxed. Storyboard reviews: 1 must (the right side scrolled off at the compare) then 3 musts (x, y, z said before written) → fixed → two passes. Voice once, 30/30. Phone review pass; one note under the subtitle while said → two notes merged, cue moved (voice unchanged); gate green. **Adrian's notes the same day:** the talked-about part was half hidden on a short laptop window → player fix (`scrollClipBoard`: no fade band at the very top) + the look also at `--width 1280 --height 640`; the plan floats in the top-right corner (new step field `corner`, `lesson-script.ts`; the strip under it kept empty once the board scrolls). Waiting for Adrian's notes (`_house.md` §6).
- **20 Oct 2026 — Indices clip 6 (`exponential-graphs-am`, note 1081.04: sketch y = 3e²ˣ), the first Indices graph clip, built alone in a fresh session, the recipe in order.** Copies Sketching (corner shapes, empty axes, pinned steps, the lift). New: `sketch.to` (the lifted shape stretches into the question's curve on the `shift` stage), a horizontal asymptote on the side sketch, the Why? chip at the bottom corner when steps are pinned, chain-check kinds `none` (no real solution) and `limit`, and exponential families in `shape`. Gate green; waiting for Adrian's notes (`_house.md` §6).
- **19 Oct 2026 — Adrian: "do it" (both points left).** (1) A highlight can light pieces INSIDE a token: `inside: "<name>"` lights the `\htmlClass{lsn-pc-<name>}{…}` parts (KaTeX trust is on), in `tone` orange/sky — Compare powers lights the a's orange and the b's blue in the question's a⁹b and in the grouped fraction, then the a and b powers in the same colours. (2) The 💡 Why? chip shrinks to a small faded 💡 once its step is more than one beat past, so it stops covering the maths that scrolls past the corner (still tappable).
- **19 Oct 2026 — Compare powers brought up to Adrian's same-day rules** (given in the clip-1 session): (a^{x+1})² straight to a^{2x+2} on the same line; "since the base is the same, the powers must be the same, hence …"; the simultaneous solve in one line (5 working lines dropped, 18 → 12 lines); no step numbers in the voice or titles. Voice re-recorded each time (≈ US$0.10). look.mjs now gives a long clip ~15 s a beat (load 11 on the Mac ran a 31-beat clip out of the fixed 4-minute window). Gate green.
- **19 Oct 2026 — Compare powers re-cut as ONE equation line by line** (Adrian, watching it: "you don't have to do the powers first separate on another line, just make the equation go line by line, explaining along the way, having separate explanations break the flow > only do it if a concept is really complex"): the power done in place (Times power note), grouped, Minus power with brackets, the brackets opened inside the powers ("minus a bracket flips every sign inside"), collected, b¹; no side lines, no section titles; 10 lines, 21 beats, about 2 minutes. a⁹ and b¹ light on their own when each base is compared. Rule added to `_house.md` §2 + writer/reviewer briefs. Storyboard reviews 2 × pass; phone review 0 must, 0 should; gate green.
- **19 Oct 2026 — Compare powers, Adrian's next three notes:** the brackets explained with the common mistake AT that step ("make sure you put brackets because its minus … a common mistake is students not putting brackets so they got their signs wrong") + a `✗ Common mistake: no brackets` note — lesson-verify now lets a `✗ Common mistake:` note sit at its step (only `✗ Watch out` must come last); "add up like terms"; `Comparing powers of a:` / `of b:` labels on their own lines. Rules in `_house.md` §2, reviewer brief items 12–13. Voice re-recorded; gate green.

