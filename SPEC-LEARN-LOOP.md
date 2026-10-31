# 🔁 The learning loop — SPEC

> **Where things stand (31 Oct 2026):** STAGE 1 BUILT, behind `LEARN_LOOP_OPEN_TO_STUDENTS`
> (closed — only the preview student `portal-teste@example.com` has it). One topic: A Math
> Binomial Theorem, at `/app/learn-loop/am-binomial`. Waiting for Adrian to try it as the
> preview student. The database change `migrations/learn_loop_attempts.sql` (adds `'portal-loop'` to the
> `student_attempts.attempted_via` check) was APPLIED 31 Oct 2026; a loop answer now saves (checked: row 37). Stage 2 (clips per question type, more topics, opening it) not started.

## What Adrian asked for

30 Oct 2026: *"can we build this loop now. Video clip explanation for a type of question, then
present with question, they write on iPad or on paper, submit, get marked > wrong, explain, do
another question, until okay then next question."* → 31 Oct: *"Yes, build stage 1"* (stage 1 =
one topic to prove it; he picked nothing else, so A Math Binomial Theorem, the topic the session
had just made a 12-minute block for).

Why (same conversation): his students want immediate results and have short attention spans;
the loop gives a result every question, in small steps.

## The loop

1. **The clip.** Before any question in the topic, a card offers the topic clip
   (`lib/lesson-catalog` slug, `binomial-theorem-am`) with "Skip to the questions". The clip opens
   at `/app/lesson/<slug>?loop=<key>`; its back / "Start the questions" buttons return to the loop.
   The lesson page lets a loop clip through for anyone with the loop (`learnLoopOpenFor`).
2. **One question type at a time**, in the bank's teaching order (`subgroups.order_index`, then
   id; only `visibility = 'all'` types). The page lists them: ✓ done · ● now · ○ to come.
3. **A question of that type** the student has never answered in the loop
   (`POST /api/portal/loop {action:'next'}` → the `practice_next` RPC with `p_subgroup`, excluding
   their loop answers and the ones shown this visit). A row the grader cannot mark (`gradableRow`)
   or that part-syllabus hides (`studentRow`) is skipped and drawn again.
4. **The answer**, three ways: ✍️ **Write here** (a blank lined page — Pencil or finger; once a
   Pencil touches it a finger scrolls instead; pen / eraser / undo / clear / more space;
   `answer-pad.tsx`), 📷 **Photo** of paper working, ⌨️ **Type**. MCQ questions show A–D chips.
   The written page is sent as a picture, exactly like a photo.
5. **Marked at once** by the ordinary practice grader (`/api/portal/practice/grade` with
   `loop: { topic, subgroupId }`, about 30 s; an MCQ by rule). The grader checks the switch, that
   the type belongs to the topic, that the question is filed under the type, and that it was not
   answered before.
6. **Right (full marks)** → "✓ you've got this type" → *Next question type*.
   **Not full marks** → the score, the wrong lines with what they should be, one "next time" line,
   the worked solution, and *Try another one like it*. After `LOOP_MISSES_BEFORE_HELP` (4) misses
   on one type, a quiet "Move on to the next type for now — your tutor will go through it with
   you" appears (for this visit only; the type stays open).
7. **Every type done** → "✓ Every question type done."

"Okay" = one answer with full marks (the grader's `correct`). A partial answer is not okay.

## One worked example before each type (31 Oct 2026)

Adrian: *"What about the video clip to learn one example first?"* → *"Yes"* to: before each
type's FIRST question, "watch one first".
- When the student may watch question clips (`questionClipsVisible` — preview student / switch)
  and a **ready** question clip is filed under the type → "▶ Watch the example" opens
  `/app/clip/q/<id>?back=/app/learn-loop/<key>?watched=1&seen=<type>`; the clip's "Now try one"
  returns to the loop, which then serves the first question. "Skip to my question" is beside it.
- Otherwise → **one worked first**: a question of the type with its full worked solution on the
  page (`/api/portal/loop {action:'example'}` → practice_next, solution rows only), then
  "Now try one". The example question is never served as the student's own question.
- Shown once per type: only while the type has no answers (`tries === 0`).

Clips for Binomial (31 Oct 2026): ready for 3 types (general term · multiplying by another
bracket · unknowns from coefficients). Queued for 3 more, our own questions: expanding the first
few terms `2aa7610f`, estimating a value `d3d3f2c4`, harder mixed `9adc1f35` — Adrian watches each
before students see it (`QUESTION_CLIPS_OPEN_TO_STUDENTS`, `/admin/question-clips`). **"Explaining
why a term does or does not exist" has no clip**: every A Math question of that type keeps its
words in the parts only, and the clip maker refuses a question with no stem text (`no-text`); the
S3_AM one was refused for its level. That type uses the worked example.

## Where it is stored

Nothing new. Each answer is a `student_attempts` row with `attempted_via = 'portal-loop'` and
`marking_json.loop = { topic, subgroupId }` (and `source: 'ink' | 'photo' | 'typed'`). Progress
is derived on read (`lib/learn-loop.ts loopProgress`), so there is no table to keep in step.

## Limits

`LOOP_DAILY_CAP` = 30 marked loop answers in 24 h, separate from Practice's 20 (`portal`). The
loop does not count towards Practice's cap and Practice does not count towards the loop's.

## Files

- `src/lib/learn-loop.ts` (+ `.test.ts`) — topics, order, progress (pure)
- `src/lib/learn-loop-store.ts` — the reads (types, the student's loop answers)
- `src/app/api/portal/loop/route.ts` — state + next question
- `src/app/api/portal/practice/grade/route.ts` — the `loop` branch
- `src/app/app/learn-loop/[topic]/` — `page.tsx`, `loop-flow.tsx`, `answer-pad.tsx`
- `src/app/app/lesson/[slug]/page.tsx` — the loop clip door + `?loop=` back links
- `src/lib/portal-beta.ts` — `LEARN_LOOP_OPEN_TO_STUDENTS`, `learnLoopOpenFor`
- `/api/health-check` — `portal-learn-loop`

## Stage 2 (not started)

- A short clip per question TYPE (the clip pipeline, `SPEC-CLIP-PIPELINE.md`), shown before each
  type's first question instead of one clip for the topic.
- More topics: add a row to `LOOP_TOPICS` (key, topic, levels, clip).
- A door to the loop from Home / Practice, then open the switch.
- Adrian sees each student's stuck types (4+ misses) — the `misses` count is already derived.
