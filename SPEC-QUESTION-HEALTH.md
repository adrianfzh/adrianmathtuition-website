# SPEC-QUESTION-HEALTH — check a maths question the first time it reaches a student

**Agreed 14 Oct 2026 (Adrian: "yes"); PARKED 14 Oct 2026 (Adrian: "park") the same day.** Why: twins already pass a blind solve + checker before they enter the bank, and A Math, E Math and Sec 1 already serve twins only (all 99 topics flipped; 3,538 verified twins), so the check would only cover Sec 2 / JC and sheets that still draw school rows — a gap that closes as twins finish. Nothing below is live. Status before parking: **BUILT, switched OFF.** Two steps wait on
Adrian: the database change (`migrations/question_health.sql`, not yet applied — it changes the
live question pickers) and the switch on `/admin/question-health`. Runs on the plan (the Fly
worker lane `question-health`), never the paid key.

## 1. The problem

The bank holds ~47,000 maths questions copied out of papers by machine. Some carry a slip: a
number that fell out, a lost figure, a part merged into the next, a wrong key, the wrong topic.
A student who meets one wastes time, or is marked wrong when they were right. Checking all
47,000 up front is waste — 8 have ever been drawn (14 Oct 2026); maths practice has ~30 attempts.

So: **check a question the first time it is about to reach a student, once.** A pass is stamped
and never checked again unless the question itself changes.

## 2. Inputs, output, red lines

**In:** one `questions` row (text, parts, marks, key, solution, figure, topic, level, source).
**Out:** one `question_health` row — `status` (`queued` → `checking` → `passed` · `fixed` ·
`paused` · `retired`), when, how (`method`: the solver's answers, the compare, the school's
answer if looked up), a one-line `note`; plus a `question_health_edits` row for every change
made to the question (before / after / why — each one undoable).

**Red lines**
- **The moat (CLAUDE.md, Building doctrine).** Where our solver and the SCHOOL's own scheme
  disagree, nothing is changed: the question is **paused** and goes on Adrian's list. A key is
  corrected automatically only when the solver AND the school's scheme both say our stored key
  is wrong (our key was a copy slip).
- **Never guess a number.** A copy fix must quote the source page it was read from; no page, no fix.
- **Students never wait.** Every check runs after the question is served or in the background.
- **Plan only.** The worker unsets every API key. Switching to the paid key needs Adrian's word
  (memory: no paid API without his explicit word). Cost on the paid key, for that conversation:
  about **US$0.15 (≈ S$0.20) a question**; one where the paper must be read for the school's
  answer, up to ~US$0.30 (Opus 5.5 at $4 / $20 per million tokens; a blind solve ≈ 4k in / 3k
  out, the compare ≈ 8k in / 2k out).
- **No student ever sees any of this.** No model names, no "checked" badges.
- **Off until Adrian says.** `question_health_settings.is_on = false` → nothing is queued and the
  worker takes nothing.

## 3. The check (worker: `scripts/question-health/WORKER_PROMPT.md`)

1. **Blind solve** — a fresh subagent sees only what a student sees (text, parts, marks,
   figure), never our key, and gives a final answer per part.
2. **Compare** with our key (part answer → else the solution's final line).
3. **Completeness** — the script half (`lib/question-health.ts completenessProblems`: parts
   intact, marks add up, a key for every part, a figure where the words point at one, topic and
   level set) plus the worker's read (a number missing mid-sentence, a figure that shows
   something else, a wrong topic or level).
4. **The school's scheme** — only on a disputed school question: `paper_schemes`, else the
   paper's answer pages from the `paper-library` bucket.
5. **Report** — one JSON per question. The worker writes nothing to the database; the door
   (`POST /api/admin/question-health {action:'result'}`) decides.

## 4. What happens — `decide()` in `src/lib/question-health.ts` (pure, tested)

| what the check found | school question | our own question (twin) |
|---|---|---|
| everything agrees | **passed** | **passed** |
| a copy slip, fix read off the page | fix applied + logged, **checked again** (at most 3 checks) | — |
| a copy slip, no fix possible | **retired** (no key at all → **paused**, Adrian may give one) | — |
| solver ≠ our key, school sides with the solver | key corrected + logged → **fixed** | — |
| solver ≠ our key, school sides with us / no scheme found | **paused** for Adrian | — |
| unclear wording / solver disagrees | — | reworded, solved blind again; agrees → **fixed**, else **retired** (the twin lane writes another) |
| nothing can save it | **retired** | **retired** |

`paused` and `retired` are never served. A change to the question's content (any edit, ours or
Adrian's) sends a checked question back into the queue (the `qh_content_changed` trigger).

Adrian's list (`/admin/question-health`): each paused question with our key, the solver's and the
school's, and three taps — **Our key is right** (passed) · **Solver is right — fix the key**
(fixed, logged) · **Retire it**. Every automatic fix is listed with **Undo**.

## 5. The doors — where a question is about to reach a student

| door | how it is covered |
|---|---|
| App practice (`/api/portal/practice/next`) | `practice_next` serves a checked question first and never a paused/retired one. An unchecked one served = this topic ran out of checked ones → it is checked straight after and 4 more of the topic are queued (`afterPracticeServe`, `qh_prefetch`), after the response |
| Timed set | same RPC; the set's unchecked questions queued after |
| Print a paper (topic mock) | paused/retired dropped from the draw (`blockedIds`); the paper's questions queued after. Set papers are ours, checked when written |
| Kiosk + bot worksheets (`kiosk_pool`) | paused/retired never in the pool; picks queued after |
| From Adrian (`practice_candidates`, `/api/admin/assignments`) | paused/retired never offered; an assigned question queued |
| Find a question (`createFindAssignment`) | queued |
| Practice Again sheets (the sheet worker) | the sheet session asks `{action:'status'}` for its picks, never uses paused/retired, checks unchecked picks itself and posts the report (`scripts/sheet-worker/WORKER_PROMPT.md` 1d3); the website queues the rest on `done` as a net |
| Telegram `/ws` worksheets (the worksheet worker) | skips paused/retired; queues its picks (Adrian edits the DOCX anyway) |
| Not yet: the bot's `/revise` and marked-paper practice items (bot repo, PostgREST direct) | next step — the same `status` call |

By-id doors (hint, solution, ladder) are not gated: the student already holds the question.

## 6. Trigger, log, alarm (doctrine steps 4–5)

- **Worker lane** `question-health` on the Fly worker: every 5 minutes, one curl peek
  (`GET /api/admin/question-health?peek=1`); switched off or nothing waiting = nothing runs.
  Otherwise `scripts/question-health/run.sh` claims up to 3 (`qh_claim`, 30-minute lease), runs
  one plan session, posts each report, stamps `job_runs` `question-health`. On `/admin/switches`
  as 🩺 Question check. The bot `worker/fly/jobs.sh` block is on the bot branch
  `question-health-lane` — merged when Adrian switches it on.
- **Monday message** `/api/cron/question-health-weekly` (08:10 SGT): one Telegram with checked ·
  fixed · paused for him · retired, plus a warning when a question has waited over a day. Stamps
  `question-health-weekly` (`JOB_RHYTHMS`, 204 h) every run; says nothing while off and idle.
- **Health check** probe `question-health`: the rules still pause a solver-vs-school dispute;
  when on, nothing has waited over 24 h.

## 7. Later — once there is enough use (not built)

- **Suspects in:** most students wrong on the first try, "my answer is right" disputes, skips →
  `qh_enqueue(ids, 'suspect')` re-checks a passed question. Needs a dispute button and a
  skip record first (neither exists on maths practice; §8).
- **Levels from real results**, like science (`lib/practice-difficulty.ts`, 20 first attempts).

## 8. Worked examples

1. **Passed.** S1 "Solve 2x + 3 = 11 (a) find x [2] (b) hence 3x [1]", key 4 / 12. Solver 4 / 12,
   nothing missing → `passed`; served first from now on.
2. **Key corrected.** EM prelim Q7(b): our key 12, solver 15; the school's answer pages say 15 →
   our key was a copy slip: `parts[1].answer` 12 → 15, logged ("RI 2024 P1 answer key, p.14"),
   `fixed`. Undo on the page puts 12 back.
3. **Paused.** AM prelim Q9(ii): our key 0.6, solver 0.75, the school's key also 0.6 → nothing
   changed, `paused`; Adrian reads the three answers and taps one.

## 9. Files

`migrations/question_health.sql` · `src/lib/question-health.ts` (+ `.test.ts`) ·
`src/lib/question-health-store.ts` · `src/app/api/admin/question-health/route.ts` ·
`src/app/admin/question-health/page.tsx` · `src/app/api/cron/question-health-weekly/route.ts` ·
`scripts/question-health/{run.sh,WORKER_PROMPT.md}` · hooks in the doors of §5.
