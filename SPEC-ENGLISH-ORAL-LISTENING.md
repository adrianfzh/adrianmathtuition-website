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
| Speech into words | Gemini on the Google key the site already has (the same call as the end-of-lesson voice note): `transcribeSpeech`. About half a US cent a two-minute recording. The words are written exactly as spoken, slips included |
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

**Recommended:** Whisper `small.en` on the Fly worker, in the same lane that already reads the
words. No Google, no new key, no cost a recording, and the voice never leaves our own systems.
The price: the words are no longer ready in five seconds, so "This is what we heard" moves from
before the feedback to inside it, with a "some words are wrong" door that re-reads. Not built —
it changes the student's steps and the worker's image, so it waits for a yes.

## Not built

- A silent video clip as the stimulus (the exam uses a clip; the pilot uses a still picture).
- Follow-up prompts that react to what the student just said (the three prompts are fixed).
- A bench for the oral reading (seeded transcripts at a known band, the same answer read twice).
- Deleting a recording after a set time — recommendation: keep 30 days, then keep only the words.
- More sets: the pilot is 4 listening sets and 3 oral sets.
