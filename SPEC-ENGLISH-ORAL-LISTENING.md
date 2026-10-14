# English — listening and oral practice (Paper 3 and Paper 4)

Adrian, 8 Oct 2026: *"let's build both listening and oral"*. Steps 7 and 8 of
[`docs/HANDOFF-ENGLISH-BUILD.md`](docs/HANDOFF-ENGLISH-BUILD.md). **Built the same day, all three
CLOSED** — Adrian's cookie and the preview student only.

## The paper (checked against `docs/rubrics/1184_y26_sy.pdf`, not from memory)

| Paper | Part | Marks | What happens |
|---|---|---|---|
| 3 Listening, about 45 min | Section A | 22 | several recordings, each heard **twice**; multiple choice, matching, filling in a graphic organiser |
| | Section B | 8 | one informational recording, heard **once**; a simple note-taking task |
| 4 Oral, about 20 min (10 of them preparation) | Part 1 Planned Response | 15 | a video clip and a prompt on a screen; the candidate plans, then speaks for **up to 2 minutes**. Response /10 (development and organisation of ideas · expression of ideas) + Delivery /5 (pronunciation · fluency · intonation) |
| | Part 2 Spoken Interaction | 15 | a discussion with the examiners on a topic related to the clip; one band table (perspectives · vocabulary and structures, with pronunciation · engagement in the discussion) |

The band tables are in `data/rubrics/english-1184-oral.json`, word for word from the document.

## 1. Spec

### Listening — `/app/languages/listening`

- **A set** is one file in `data/english/listening/` (`ls..`): our own script (speakers and lines),
  the questions, the key, and one line per question saying where the answer was heard. Shapes and
  checks: `src/lib/english-listening.ts` (`listeningProblems`).
- **Question types**: `choice` (A–D), `match` (each item takes one letter from a shared list),
  `fill` (a graphic organiser or a note — one to three words or a number).
- **The pilot is one whole Paper 3**: `ls01` recount 6 + `ls02` conversation 7 + `ls03` explanation 9
  = Section A 22, and `ls04` notes = Section B 8.
- **The student** plays the recording. The words are NOT on the page. Section A plays twice,
  Section B once — the page counts the plays. Then **Check my answers**.
- **Marked by the key, on the spot, no model.** A `fill` answer is right when it matches a listed
  answer after tidying (case, punctuation, a leading a / an / the); a word of six letters or more
  may be one letter out, and the page then shows the spelling.
- **After the check**: ✓ or ✗ per question, the answer, the line it was heard in, the total, and
  **What was said** (the script) with free replays.
- **Audio**: the lessons' voice (MiniMax `speech-02-hd`, `English_FriendlyPerson`) for the narrator
  and the first speaker; a second MiniMax voice for the other speaker in a conversation. One MP3 a
  set, committed under `public/english/listening/` like lesson clips
  (`node scripts/english-own/speaking-audio.mjs`).

### Oral — `/app/languages/oral`

- **A set** is one file in `data/english/oral/` (`or..`): a picture we generated
  (`public/english/oral/<id>.jpg`), a description of it in words (what the reader is given — it
  cannot see the picture), the planned-response prompt, and three spoken-interaction prompts
  (never about what anyone in the picture says).
- **Part 1 — planned response.** The picture and the prompt → a preparation timer (10 minutes, "I
  am ready" skips it) with a box for notes that stay on the phone → Record, stops by itself at
  2:00 → the recording is stored → turned into words → **"This is what we heard"**: the student
  fixes any word that was heard wrong → the words are read against the Response table → the report.
- **Part 2 — spoken interaction.** Three prompts, each played aloud (and shown), each answered
  aloud (up to 1:30), then the same "what we heard" step and ONE report.
- **The report** (the essay report's shape, top to bottom): the band line → your ideas, each
  ✓ developed or ◐ only stated → how it was organised → up to three habits (count + one example
  from the student's own words + the fix) → up to three stronger ways to say a sentence they said →
  one thing for next time → what you said.
- **What is judged**: what was said — ideas, development, organisation, vocabulary, structures.
  **Not judged, and not mentioned**: pronunciation, fluency, intonation. Part 1 shows the Response
  band with its marks ("Band 4 · 7–8 of 10") because the syllabus marks Response by itself. Part 2
  shows the band and its two lines about ideas and discussion with **no marks**, because that
  table's marks include pronunciation.
- **Red lines**: no someone else's video or picture; no model or person named; no disclaimer;
  a quote in the report must be words the student really said (the belt drops the rest); the
  reader never sees the recording, only the words.

### Worked example (Part 1 report, cut short)

> **Response: Band 3 · 5–6 of 10** — Response has some development and organisation.
> **Your ideas** ✓ Cleaning the beach helps sea animals — you gave the turtle example.
> ◐ "It is fun with friends" — stated, no reason or example.
> **Habits** Tense ×3: "yesterday we go" → "went".
> **Say it better** "It is very good for the environment" → "It keeps plastic out of the sea" — it names the benefit.
> **Next time** Give each reason one example from your own life.

## 2. Tools

| Job | Where |
|---|---|
| Listening rules (pure, tested) | `src/lib/english-listening.ts` |
| Oral rules, prompts, the belt (pure, tested) | `src/lib/english-oral.ts` |
| Built data the app reads | `data/english/speaking-sets.json` ← `npx tsx scripts/english-own/build-speaking.ts`; `src/lib/english-speaking-data.ts` |
| Audio and pictures | `scripts/english-own/speaking-audio.mjs`, `scripts/english-own/oral-pictures.mjs` → `public/english/` |
| Listening door | `POST /api/portal/english/listening` → `english_practice_attempts` kind `listening` |
| Oral door | `POST|GET /api/portal/english/oral`, `src/lib/english-oral-store.ts`, table `english_oral_attempts` (`migrations/english_oral.sql`) |
| The recording | private bucket, key `oral/<identity>/<attempt>/<n>.<ext>` (`lib/student-files`), readable only by its owner and Adrian; erased with the account |
| Speech into words | **Prototype only — to be replaced before opening (§Speech into words without Google).** Gemini on the Google key the site already has (the same call as the end-of-lesson voice note): `transcribeSpeech`. About half a US cent a two-minute recording. The words are written exactly as spoken, slips included |
| The reading | the plan queue (`plan_reads`, kind `english-oral`, model alias `opus`) — never the paid key |

## 3. Checkpoints

- The student confirms the words before they are read — a misheard word must never come back as a
  language slip.
- Nothing here goes out to a parent; the report is the student's own practice.
- Opening any of the three switches is Adrian's decision. Before the oral ones open: he has tried
  it with his own voice, the privacy page says recordings of a student's voice are kept, and the
  retention rule below is agreed.

- **Silence must never become words.** Given a silent recording, the transcriber once returned a
  fluent 560-word speech (8 Oct 2026). Two guards: the phone measures the microphone's level and
  refuses a recording with no sound in it; the server treats words that could not have been said in
  the time (over about 4.5 a second), or that loop, as nothing heard (`plausibleSpeech`, tested).

## 4. Trigger

Nothing is scheduled. Listening is instant. An oral report is picked up by the worker's one-minute
`plan-reads` lane.

## 5. Log + alarm

- Health-checks `portal-english-listening` and `portal-english-oral` (the anonymous 401 and the
  pages). The existing `plan-reads` check alarms when a report has waited over 20 minutes.
- Caps: 6 oral reports a student a day (`DAILY_ORAL_CAP`); a recording is at most 2:00 / 1:30 and
  4 MB.

## ⚠️ Before oral opens to students (Adrian, 8 Oct 2026)

Adrian: *"for oral, only remind to put in privacy when opens up. we are not opening up oral now"*.
Oral stays closed and the privacy page is NOT changed now. On the day either oral switch is
flipped, in the same change:

1. The privacy page gets a line saying a student's **voice recordings** are kept, and **for how
   long** (suggested: 30 days, then only the words are kept — the deleting is not built yet).
2. The consent wording at sign-up covers **a child's voice**.
3. **Build the no-Google speech route first** (Whisper `small.en` on our own worker — §Speech into
   words without Google, DECIDED). The Gemini call is the closed prototype only; Adrian does not
   want to pay Google.

## Switches (`src/lib/portal-beta.ts`, all `false`)

`ENGLISH_LISTENING_OPEN_TO_STUDENTS` · `ENGLISH_ORAL_OPEN_TO_STUDENTS` (Part 1) ·
`ENGLISH_ORAL_INTERACTION_OPEN_TO_STUDENTS` (Part 2). Each is seen by Adrian's cookie and the
preview student. They sit inside the Languages family, itself closed.

## What stays human

- **Standard**: the SEAB tables. Delivery is an examiner's ear; the app does not stand in for it.
- **Novelty**: a report whose quotes the belt had to drop, or a recording with no words in it, is
  shown as such — never smoothed into a band.

## First trial (8 Oct 2026, on the preview site, a made-up student voice)

- Listening: plays, counts the plays, marks by the key, shows the spelling note and the script.
- Oral Part 1: a 43-second answer with planted slips came back word for word, slips kept, in about
  5 seconds; the feedback arrived in under a minute, twice, Band 3 both times, and every quote was
  the student's own words (the belt dropped nothing).
- Oral Part 2: the same speech given to all three prompts was told "the points are linked to a
  question nobody asked you".
- How it was tested: puppeteer at phone size as the preview student, with `getUserMedia` replaced
  by a stream that plays a sound file. Chrome's own fake microphone gave silence — do not trust it.
- NOT tested: a real microphone on a real iPhone, a real student's accent, a noisy room.

## Speech into words without Google — the comparison (8 Oct 2026)

Adrian's goal this week is to stop paying Google. The Gemini call above stays only as the closed
prototype. Tried instead: the open Whisper model run on our own machine (`faster-whisper`, 2
processor threads, its built-in silence filter on). Script and the spoken texts:
`scripts/english-bench/stt/` (`bench.py`, `texts.json`).

Eight recordings: four made-up student answers (a girl's and a boy's voice from the lessons' voice
maker, 16–43 seconds, 18 grammar slips and 7 local words planted) — clean, with noise through a
poor microphone, 25 % faster, quiet with an echo — plus 30 seconds of silence and of noise alone.

| Way | Words wrong | Planted slips kept | Local words right | Time, all 8 | Silence | Cost a recording |
|---|---|---|---|---|---|---|
| Gemini 2.5 Flash (the prototype) | 1.3 % | 21 of 25 | 11 of 12 | 34 s | nothing heard | about half a US cent |
| Whisper `small.en`, our machine | 1.3 % | 20 of 25 | 10 of 12 | 35 s | nothing heard | nothing |
| Whisper `base.en`, our machine | 1.7 % | 16 of 25 | 11 of 12 | 12 s | nothing heard | nothing |
| Whisper `tiny.en`, our machine | 3.5 % | 19 of 25 | 9 of 12 | 8 s | nothing heard | nothing |

- `small.en` matches Gemini. The slips every way "lost" are ones the ear cannot tell apart
  ("who touch the" / "who touched the"); "char kway teow" was missed by most.
- Times are on this Mac. The Fly worker's two shared processors are slower — an ESTIMATE of one to
  two minutes for a two-minute answer on `small.en`; not measured there.
- **Honest limit:** these are clean made-up voices. No real Singapore student's voice was tested;
  none can be had without a student (or Adrian) recording one.
- Not tested: the phone's own speech recognition. It needs a real phone; on Android it sends the
  voice to Google anyway, and it is missing inside an installed app on an iPhone.

### DECIDED (8 Oct 2026): Whisper `small.en` on our own worker — to be built when oral is about to open

Chosen by the session Adrian made responsible for routine calls, after this comparison. **Not
built now**, on purpose: Adrian has said oral is not opening now; the worker is carrying twins, the
row finder and marking on one processor and ran out of memory once this week; and other sessions
are changing the bot and the worker. The Gemini prototype stays as it is, closed.

When it is built:

- **Where:** the Fly worker, in the same `plan-reads` lane that already reads the words. The
  worker's image gains the speech model; rolling that out restarts the worker, so time it when no
  marking is running (memory `bot-deploys-kill-inflight-marking`).
- **What changes for the student:** today the words show in about 5 seconds and the student fixes
  a misheard word BEFORE the feedback. On the worker the words and the feedback arrive together a
  few minutes later, so "This is what we heard" moves INSIDE the feedback, with a "some words are
  wrong" door that takes the corrected words and reads again.
- **Keep:** the silence guards (`plausibleSpeech`, the phone's level check) and Whisper's own
  silence filter (`vad_filter`); words written exactly as spoken.
- **Still to measure before it opens:**
  1. a real Singapore student's voice (or Adrian's), three answers, both ways side by side;
  2. time and memory on the worker itself for a two-minute answer — the one-to-two-minute figure
     above is an estimate from a Mac, and the worker has already run short of memory once.

## More papers — made ahead, checked, "New paper" at three levels (14 Oct 2026)

Adrian, 14 Oct 2026: *"yes"* — more listening papers, made in advance and checked, handed out by a
**New paper** button, at three levels. Then (same day, through the English portal session): keep 2–3
ready a level and refill at once; a shared pile; cost limits; *"can we review the papers to sift out
the good quality ones automatically?"*

### The paper and the levels

- **A paper = a whole Paper 3**: Section A three recordings (6 + 7 + 9 = 22 marks, heard twice: a
  talk, a conversation with a matching task, an explanation with a graphic organiser), Section B one
  talk (8 notes, heard once). The exam format is the same at every level.
- **Easier** — slower voice (speed 0.85, longer pauses); every answer said once, plainly; no trap.
- **Standard** — like the exam (speed 0.95); a wrong detail at most mentioned in passing (≤2 traps a part).
- **Harder** — normal speed (1.05, short pauses); speakers change their minds or correct themselves
  in every part, so the final answer must be caught (≥1 trap a part, ≥6 a paper).
- A question's `trap` = the wrong words exactly as said. Checked: it is said, it is never an accepted
  answer, the page never sees it.

### Where things are

| Job | Where |
|---|---|
| Rules (pure, tested): paper checks, levels, Singapore-word check, copy check, blind reader, guesser, reviewer checklist, which paper next, the pile and the caps, retiring | `src/lib/english-listening-papers.ts` |
| The papers | table `english_listening_papers` (`migrations/english_listening_papers.sql`): `checked` → `ready` (recorded) · `rejected` (thrown away, reasons kept) · `retired` |
| Reads, saving, stock, retiring | `src/lib/english-listening-store.ts` |
| The recordings | public bucket `english-audio`, `listening/<lp001-1>.mp3` — MiniMax, joined without ffmpeg (`src/lib/mp3-join.ts`, `src/lib/english-listening-voice.ts`) |
| Student pages | `/app/languages/listening` (New paper ×3 levels · Your papers · the first paper) → `/new?level=` → `/paper/<lp001>` → `/<lp001-1>` |
| The worker's door | `GET|POST /api/agent/listening-papers` (admin auth = the worker's token) |
| The worker's job | bot `scripts/listening-papers.js`, `worker/fly/jobs.sh` `listening-papers` (peek every minute; switch on `/admin/switches`) |
| A session's batch | `npx tsx scripts/english-own/listening-papers.ts brief|prompts|save|voice|list|stock|retire` |
| Adrian's list | `/admin/listening-papers` (the pile, the month against the cap, every paper and why one was thrown away or retired) |

### The pile and the limits

- Every paper is **shared by all students**. Each level keeps **3** papers ready (or being recorded),
  so New paper is instant. **New paper** = the oldest ready paper at the level the student has not started.
- One more is made when the **keenest** student at a level has **2 or fewer** left — the pile grows
  with the keenest student's use, not with the number of students.
- When a student takes a paper the worker's one-minute look sees it; one paper takes roughly 15–30
  minutes to write, check and record. A paper that fails any check is thrown away and remade.
- **Limits** (`english-listening-papers.ts`): at most **1 new paper a day because of any one student**
  (`PER_STUDENT_PER_DAY`); **30 a month** in all (`MONTHLY_CAP`, thrown-away ones count) — shown on
  `/admin/listening-papers`.
- **Cost of one paper**: writing, checking and reviewing = plan only (no paid key). The voice =
  MiniMax `speech-02-hd`, US$1 per 10,000 characters; a paper is about 7,500 characters ≈ **US$0.75**
  (Harder a little more). 30 a month ≈ US$23.
- **Recording is ON** (`VOICE_NEW_PAPERS = true`, Adrian 14 Oct 2026: "yes" to the cost). The first
  batch costs: Easier ≈ US$0.55, Standard ≈ US$0.73, Harder ≈ US$0.80 a paper (10 papers ≈ US$6.80).
  Off = a kept paper waits as `checked` and is never served.
- The worker's door is on the website, so the worker makes papers only once this is on **www**
  (a promote); until then its look gets no answer and it makes nothing.

### The checks — every one must pass before a paper is kept

1. **Mechanical** (`paperProblems`): four parts, 22 + 8 marks, a conversation in Section A, each part
   180–480 words, 5–10 questions, a fill-in answer said word for word, traps as the level allows.
2. **Singapore words** (`sgUnlisted`): every local place, food or everyday word must be in
   `src/lib/sg-say.mjs` (Adrian's 37, settled 14 Oct 2026); people's names from `PLAIN_NAMES`. A
   capitalised word that is neither (nor an ordinary English word) is flagged — the writer picks a
   listed one; a new word is added only after Adrian has listened (`speaking-audio.mjs --check-sg`).
3. **Our own words** (`sharedRuns`): no run of 8 words shared with another paper, or (from a session)
   with the language bank.
4. **The blind reader** (Opus, fresh): gets the script and the questions, no key — must match the key
   on every question.
5. **The guesser** (Sonnet, fresh): gets the choice and matching questions with NO script — more than
   half right = the paper can be passed without listening → thrown away.
6. **The reviewer** (Opus, fresh): the whole paper with its key against the checklist below. Every
   item must pass.

### The reviewer's checklist (`REVIEW_ITEMS`)

| Item | Passes when |
|---|---|
| `real-task` | each part feels like a real Paper 3 task, with the exam's kinds of question |
| `natural-speech` | it sounds spoken — contractions, short turns — not written prose read out |
| `one-answer` | every question has exactly one clear answer in the script, and the key gives it |
| `fair-distractors` | wrong options and traps are fair: mentioned or plausible, no trick of wording, no outside knowledge |
| `level-fits` | Easier plain · Standard like the exam · Harder changes of mind to catch |
| `length-timing` | each recording about 2–3 minutes; questions in the order heard; fill-ins 1–3 words or a number |
| `sg-words` | every local word is one the voice was taught; names easy for an English voice |
| `suitable` | nothing awkward or unsuitable for a 15-year-old (no romance, alcohol, violence, brands, real public figures) |

**Examples**

- ✅ *Pass, Standard.* A conversation about a class outing: "We'd have to split the class" →
  matching letter B. Escape room "twenty-eight dollars each" mentioned before the cooking class at
  "twelve dollars" — one trap, said in passing, fair. Every item passes.
- ❌ *`one-answer` fails.* "When does the workshop start?" — the speaker says "doors open at nine, we
  begin at half past". Key: 9.30; but "nine" is an equally fair reading of "start". Thrown away.
- ❌ *`level-fits` fails, Easier.* "The talk is on Friday — oh no, sorry, it moved to Thursday."
  A change of mind belongs in Harder; an Easier paper says "The talk is on Thursday." Thrown away.

### After use — student results retire weak papers (`weakPaper`, `retireWeakPapers`)

Each student's FIRST try at a part counts. With at least 8 tries a question:
- a question **15 % or fewer** get right → retired ("unclear, or the key is wrong");
- a **Harder** paper where **every** question is 95 %+ right → retired ("too easy for Harder");
- of 6+ students who began it, **60 %+ stopped halfway** → retired.

A retired paper stops being served, shows on `/admin/listening-papers` with its reason, and the
pile refills. Run at the start of every worker run (`POST {action:'retire'}`) — runs happen as
students use papers, which is when results change.

### The first batch (14 Oct 2026, written in a session on the plan)

- 10 papers written (3 Easier, 4 Standard, 3 Harder), each by its own writer. **2 passed every check
  first time.** The rest were sent back with the reasons, up to three rounds:
  - the guesser (no recording) got 9–12 of 13–14 on all three Easier papers — the right answer was
    the sensible one. Rewritten, the guesser fell to 0–2. This is the check that mattered most;
  - the reviewer caught: a smoking detail (cigarette ends), a line given to the wrong speaker, a
    Standard paper with changes of mind (Harder's job), questions out of recording order, a fill-in
    with a second fair answer, a contradiction inside a conversation;
  - the copy check threw two away for stock phrases shared with another paper ("let me take you
    through it step by step") — reworded; the brief now warns writers off them;
  - two of my own mistakes, fixed in the checklist: the reviewer's word counts disagreed with the
    brief's (Easier is read slowly, so 210–300 words is right), and English place words ("East
    Coast"), "CCA" and "Mdm" (the voice says "Madam") were failed as untaught Singapore words.
- Every blind reader matched the key on every kept paper. Kept papers: `/admin/listening-papers`.

### Health and logs

- Health-check `listening-papers-pile`: the worker's door answers 401 to a stranger; once recording is
  on, every level has a ready paper.
- The worker stamps `job_runs` `listening-papers` on every real run (kept or thrown away, and why).
  No `JOB_RHYTHMS` line: it runs on demand (`docs/OPS.md` — queue workers get none); the pile check
  is the alarm.

## Not built

- A silent video clip as the stimulus (the exam uses a clip; the pilot uses a still picture).
- Follow-up prompts that react to what the student just said (the three prompts are fixed).
- A bench for the oral reading (seeded transcripts at a known band, the same answer read twice).
- Deleting a recording after a set time — recommendation: keep 30 days, then keep only the words.
- More oral sets: the pilot is 3. (More listening: §More papers.)
