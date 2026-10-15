# Clip pipeline — one-minute explanation clips, made automatically, to the approved standard

**Status:** PLAN, 15 Oct 2026, waiting for Adrian's yes. Nothing built.
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
