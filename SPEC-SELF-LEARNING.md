# SPEC — Ready for the next test (the self-learning loop, companion first)

*Agreed with Adrian in the design talk of 8 Oct 2026. **Status: DESIGN — nothing built.**
Everything here stays closed to students until he opens it (`docs/SWITCHES.md`). No paid
spend without his word. Build order is §11; each step is shown to him before the next.*

## 0. The frame (decided)

- **The aim is still "no tutor at all"** (Adrian, 8 Oct 2026) — a student who learns with
  the app alone, the parent the only person in the loop.
- **But it is built first as the companion to his physical tuition.** Adrian: *"let's build
  the app as a companion tool for the physical tuition first. All students are required to
  use it. And we can iterate on what works and what doesn't work."* The no-tutor product is
  made later, from the parts his own students used.
- **The hook is the student's next school test.** Adrian: *"this seems interesting. It's
  demand driven."* A student comes because a test is coming, not because the app nags.
- **Ship something simple first, then iterate** (his words).
- Because he still teaches and answers for results, the Building doctrine's "what stays
  human" is **unchanged**. The edit for a no-tutor product (§12) is proposed only when
  that product is about to open.

Why not the plain "lesson → quiz" path as the product: Adrian called it *"very generic,
like what most learning apps do"*, and students already get that free, and compulsory, on
the school's SLS. What SLS does not do: mark the student's own handwritten work, prepare
them for their own school's next test, or tell the parent anything.

## 1. The loop

```
Enter the test: date + topics
        │
        ▼
  ┌─ Try a paper ◄──────────────────────────┐
  │       │                                 │
  │       ▼                                 │
  │   Marked, topic by topic                │
  │       │                                 │
  │   fine (70%+) ─────► nothing to revise; │
  │                      all fine → the next paper is HARDER
  │   shaky (40–69%) ──► a Practice Again sheet on that topic
  │   very weak (<40%) ► revise the topic in full (§4)
  │       │                                 │
  │       └──── when the revising is done ──┘
  │
  └─ or: Revise a topic first (§4)

Aim: a decent mark (60% or more) by paper 3.
```

The three numbers (70, 40, 60) are settings, his to change.

**Stronger students** (Adrian, 8 Oct: *"Fine > give harder papers > push score higher —
aim for top students, who are usually self starters"*): a student who is fine on every
tested topic gets a harder next paper, and the aim moves up. Build after the basic loop.

### Worked example — Mei, Sec 2

- Monday. Mei enters: *WA3, Friday 23 Oct, Expansion + Factorisation.* The app says
  **"11 days to your test. 3 papers to be ready."**
- She tries Paper 1 that evening (30 min, on paper), photographs it. Marked: **11 / 25**.
  - Expansion 8/10 → fine.
  - Factorisation (common factor, grouping) 3/8 → very weak → **revise in full**.
  - Factorisation (quadratics) 3/7 → shaky → **Practice Again sheet**.
- Tue–Thu: two revision sessions on factorising (§4), then the sheet.
- Saturday: Paper 2 → **16 / 25**. Quadratics still shaky → another sheet.
- Wednesday: Paper 3 → **19 / 25** (76%). The screen shows 11 → 16 → 19 and what was fixed.
- Thursday night: her Notebook shows **"Your 7 cards for Friday's test"** (§6).
- After the test she photographs the real paper. The app marks it, shows what the work
  fixed, and asks for the next test.

### The plan fits the days left

| Days to the test | The plan |
|---|---|
| 10 or more | Paper 1 now · Paper 2 about half-way · Paper 3 two or three days before |
| 5 to 9 | Paper 1 now · Paper 2 two days before |
| 4 or fewer | One paper and its sheets. The app does not pretend there is time for three |

## 2. Entering the test

- The student (or a parent) enters the date and ticks the topics from their level's list.
  Today only Adrian can key a test in (Airtable `Exams`, with Tested Topics); that stays,
  and a student's own entry is added beside it.
- The countdown sits at the top of Home (`app/exam-countdown.tsx` exists, closed behind
  `EXAM_PREP_OPEN_TO_STUDENTS`).
- Two doors under it: **Try a paper** · **Revise a topic**.

## 3. The papers

- **Short.** About 30 minutes and 25 marks, only on the tested topics. A student will do
  three short papers; they will not do three full ones.
- **Three different papers at the same level**; harder ones for the student who is fine.
- Done on paper, photographed, marked by the existing marking (`docs/MARKING.md`).
  Handwritten marking is not instant, so the screen says plainly when it will be back.
- Which bank rows may be served is `docs/CONTENT-POLICY.md` + `lib/serve-gate.ts` — our own
  questions first.
- **Instant help on a marked paper**: every wrong question opens help at once — the worked
  answer now, the short clip (§8) when the clips are ready. Adrian: *"students at this
  phase want instant help … videos that are not too long will also calm their nerves."*

## 4. Revise a topic in full — the session

One session = one step of the topic's map (§5). About 20 minutes.

1. **Worked example**, shown one line a tap, with the idea in two lines at the top.
2. **Try one**, with "Stuck? Next step" (built, open — `lib/proof-ladder.ts`).
3. **Five on your own.** No help. The final answer is typed and checked at once.
   **Pass = 4 of 5.**
4. Not passed → **look at the example again → a new five** (Adrian's rule) → then §7.

The end screen says four things: done · the score · one thing to watch (their real slip)
· what is next.

Parked on purpose (his words in brackets):
- **A one-minute clip as the first step** — waits for §8 (*"that lesson engine needs
  fixing. It is not good enough yet"*).
- **Piece-by-piece input with arrows** — *"too guided — perhaps more for younger students"*.
- **Writing on the screen** (finger on a phone, pencil on an iPad) — wanted, added after
  the first step works; the final answer stays typed so the check is instant and never
  misread. Reading the saved working to name the wrong line costs a little per read and
  needs his word.

## 5. The topic map — the flow of learning

Adrian, 8 Oct 2026: *"need to build the topics mapping (flow of learning for each topic),
like solving a puzzle or leveling up in a game."* **Noted, not designed.** A map is the
ordered steps of a topic, which step opens which, and which older skills sit underneath.
The raw material exists: the `subgroups` table sorts the bank into small skills per topic.
The game feel needs a picture for him before anything is built.

### The first map — Sec 2 expansion and factorisation (agreed)

| Step | Skill | Underneath |
|---|---|---|
| 1 | Expand one bracket and collect like terms | negative signs · like terms |
| 2 | Expand two brackets | step 1 · negative signs |
| 3 | Perfect squares, (a + b)² | step 2 |
| 4 | Difference of squares, (a + b)(a − b) | step 2 |
| 5 | Take out a common factor | common factor of two numbers |
| 6 | Factorise a difference of two squares | step 4 · square numbers |
| 7 | Factorise by grouping (four terms) | step 5 · negative signs |
| 8 | Factorise a quadratic (the cross method) | step 2 · number pairs · negative signs |

The four Sec 1 skills underneath: multiplying terms with negative signs (−3 × −2x) ·
collecting like terms · one bracket · common factor of two terms.

Left out of the first version: "hence" questions, divisibility proofs, algebraic fractions.

What the bank holds (8 Oct 2026): about 370 school questions across these skills, about
half with full working; only 67 of our own (3 to 6 per skill). A session needs roughly 10
of our own per skill, so more must be written (twins, plan-billed) before students use it.

## 6. The Notebook — what they keep

Adrian: *"a notebook for them to keep track of their progress, and the notes they want to
write. Many students write notes — especially girls. Would be a hook."*

- The test brings them in; the Notebook is what they keep. (A list that waits to be opened
  does not pull: "Questions to retry" held 197 entries and no student tried one.)
- Every passed step writes one card by itself: the method, their own correct working, the
  slip they used to make (`SPEC-NOTEBOOK-V2.md` §2).
- Progress per topic sits beside their own notes and their marked work.
- Bring notes in: a photo of a handwritten page files itself under its topic.
- The night before: **"Your N cards for Friday's test"** — the before-the-paper page
  (built, `SPEC-NOTEBOOK-V2.md` §4) filled with their own cards. Later: "quiz me on my notes".
- Never lost: anything written is saved on our side at once.
- **We do not rebuild Goodnotes or Notability.** We build what they cannot do, because
  they do not know the student's marks.

## 7. Stuck — keep finding ways

Adrian: *"a tutor would keep finding ways so that student understands."* The app never
moves on from a stuck student. Stuck = not passed twice on one step. Then, in order:

1. **Check what is underneath.** Four quick questions on that step's "underneath" skills
   ("Let's check something first"). A weak one is taught first, then back to the step.
2. **Point at the line.** Read the student's working and name the wrong line.
3. **Make the step smaller.** (x + 3)(x + 2) with no minus signs, then one, then two.
4. **Explain it a different way.** Numbers first (23 × 14), or the box picture.
5. **Let the student ask**, in their own words, about this exact step.
6. **Stop for today, come back fresh.** The next session opens on the smaller version.
7. **The app learns.** When ways 1–5 all fail, Adrian is told; a new way is written for
   that step and every later student gets it.

Wording rule: the student never reads "failed" or "weak". Ways 2 and 5 cost a little per
use — off until he says.

## 8. Short clips — its own job

Adrian: *"the video must be very short, one concept at a time"*; and on today's engine:
*"The voice and the animation is not synchronized perfectly yet. And the content of the
voice is not good. Some content does not explain directly. Need clear direct explanation,
and simple but effective animation."* Fixed in a separate session (started 8 Oct 2026);
this loop runs without clips and they slot into §3 and §4 when he is happy with one.

## 9. Where Adrian comes in (the companion)

- **Required** for every tuition student. What a student must do between two lessons, and
  how he sees who did it, is **the next decision — still open**.
- Before each lesson he sees, per student: the test and days left, the paper marks, the
  weakest topic. The lesson goes where the app found the hole (`📌 Next lesson`,
  `SPEC-STUDENT-FIRST.md` §15).
- The parent's weekly note (wording his; the WhatsApp sender is another session's build):
  **still open.**

## 10. Rules that bind every screen

`CLAUDE.md`: readability (one idea per line, the result stands out) · no disclaimers ·
never name a model · the app says "your tutor" or "we", never his name.

## 11. Build order — small steps, each shown to him first

1. **One step on a phone**: "Expand two brackets", the §4 session, admin only.
2. **Enter a test + the countdown + the two doors**, admin and the preview student.
3. **A short paper from the tested topics**, and the topic-by-topic sorting after marking.
4. **The other seven steps** of the first map (content: examples, more of our own questions).
5. **The plan that fits the days left**, and the 11 → 16 → 19 screen.
6. **Notebook**: a card per passed step, progress per topic, "your cards for the test".
7. **Stuck**: ways 1, 3, 4, 6, 7; then 2 and 5 on his word.
8. **His view before a lesson.**
9. **Harder papers** for the student who is fine.
10. Later: clips slot in (§8) · writing on screen · the topic map's game feel (§5) ·
    the parent's note · more topics.

Each new surface gets a `*_OPEN_TO_STUDENTS` switch (`docs/SWITCHES.md`) and a health check.

## 12. Still open

- What "required" means each week (§9).
- The parent's weekly note.
- The topic map's look (§5).
- For the later no-tutor product only: the doctrine edit (the company answers, a way to
  reach a person, a refund rule, the voice of the note), and the two company reminders in
  `CLAUDE.md` (customer data from first sign-up; credits).
