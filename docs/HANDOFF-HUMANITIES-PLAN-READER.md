# Hand-over — move the Humanities reader onto the plan (8 Oct 2026)

For a FRESH session (the Humanities build session reached 90% of its window). Read
[`SPEC-HUMANITIES.md`](../SPEC-HUMANITIES.md), then `SPEC-ENGLISH-PRACTICE.md` §On the plan and the bot's
`worker/fly/README.md` §Plan reads. Talk to Adrian in plain, short words (CLAUDE.md §Talking to Adrian).

## Why

Adrian, 7 Oct 2026: "we should not be using API" … "all on plan". The Humanities reader still calls
the paid key (bot `ai/humanities-marker.js`, about 5 US cents an answer). The bench owed before the
Humanities switch can open would cost about US$60–75 that way. The English checker already moved to
the plan queue; the same queue can carry Humanities. **No paid bench until Adrian himself says so.**

## It can all move — nothing is stuck on the paid key

All three readers are words in, JSON out: the levels reader (Social Studies, History sources, History
essays, Geography's 9-mark question), the points reader (Geography), and the timed paper (seven of the
same). None needs a picture: tables, graphs, maps and diagrams already reach the reader as words.

`plan_reads` is generic — a finished prompt in, a raw reply out (`migrations/plan_reads.sql`,
`src/lib/plan-reads.ts`, bot `scripts/plan-reads.js`). The lane takes the model aliases `sonnet`,
`opus`, `haiku`, gives the reader no tools, and caps a reply at 8,000 characters (a Humanities reply is
1–2 thousand). **So the Fly worker and the bot need no change.** Do not touch the worker.

## What to build (website only)

1. **Port the prompt and the belt to the website** — `lib/humanities-prompt.ts` (from the bot's
   `buildSystemPrompt` / `buildUserMessage`, levels AND points; one prompt string = system + user) and
   `lib/humanities-settle.ts` (from the bot's `lib/humanities-report.js`: `validateRead`,
   `validatePointsRead`, `agreeReads`, `buildReport`, `buildPointsReport`). Pure, with the bot's tests
   ported (`test/humanities-report.test.js`). Parse the reply tolerantly (a reply may wrap its JSON).
2. **Hand-in** (`lib/humanities-submit.ts`): in place of the POST to the bot, enqueue TWO `plan_reads`
   rows (`kind: 'humanities-read'`, `ref: <run id>:1` and `:2`, the two read orders the bot uses).
   Keep the paid path in the code behind one constant, unset — as English did.
3. **Settle** — one function `settleHumanitiesRun(runId)`: when both reads have replied, validate and
   agree; two the same → write the row as `marked`; different → enqueue a third and wait; three with no
   majority → `held`; a failed read → retry once, then `failed`. Call it wherever a run is looked at
   while it is in flight: the feedback page (it already refreshes every 4 seconds), the timed-paper
   result page, the answers list, `GET /api/admin/humanities?id=` (the bench polls this), and the
   `plan-reads` health check so nothing waits on a page being open.
4. **The bench** (`scripts/humanities-bench/run.ts`) already hands in through the admin door and polls
   — it needs only patience: a longer wait per batch and a bigger batch. Then run ALL of it on the plan:
   the earlier paid results (s11, the Geography pilot, the 9-mark questions, y05, y07, g23) were on the
   paid path and must be run again on the new one.
5. **Words on the page.** "About a minute" becomes "a few minutes" where the page promises a time
   (Humanities Home, the hand-in status line, the timed paper's result page).
6. Docs: SPEC-HUMANITIES.md (the reader section + the bench table), `docs/APP-MAP.md`, `docs/OPS.md`
   if a job rhythm is added. The switch stays closed.

## The one real choice: which model reads

- The paid reader is Opus. The English checker on the plan uses Sonnet.
- Recommended: **bench both on a slice first** (about 150 seeded answers each — one case study, two
  Geography sets, two History essays), then pick Sonnet if it holds the gate (seeded ≥ 90% at the level
  or mark, none two off; repeats ≥ 90%; truth-free all held). Sonnet is much lighter on the weekly meter.
- Tell Adrian the result in one line and which model you chose; it is not a money decision.

## What it costs

- **Money: nothing.**
- **Time for a student:** a few minutes for one answer when the worker is awake (two reads, one after
  the other), longer when it must start; a timed paper (seven answers, fourteen reads) perhaps ten to
  fifteen minutes. Measure it and say the real numbers.
- **The bench:** about 1,250 seeded answers in all → with repeats and padding about 1,800 answers →
  about 3,700 reads. One lane reading one at a time at 30–60 seconds each is one to two days of the
  worker's lane, shared with English reads. It can run unattended; resume is built into the bench
  script. If that is too slow, bench the seeded answers only first (about 2,500 reads).
- **Plan usage:** not measured. English ran about 1,300 Sonnet reads on the plan without trouble. The
  weekly meter stood at 21% on 8 Oct 2026 with 6.5 days left. Watch it during the slice and report.

## Limits to say plainly

- Slower than the paid reader (minutes, not one minute).
- The lane reads one answer at a time, so a class handing in together waits in line.
- A change of model changes the reader; the bench is what tells us it is still right.

## Where the Humanities build stands (8 Oct 2026)

Built, preview only, switch closed: Social Studies (30 case studies, single questions, structured
response, examples, timed paper, practice by skill), Geography (26 sets / 118 point-marked questions
with tables, graphs, climate graphs, pie, scatter, wind rose, five Country X maps, twelve diagrams,
three world maps; eight 9-mark questions; marks shown), History (5 source sets, 18 essay questions).
Not built: photo hand-in (waits on the handwriting reader); photographs, satellite images and
cartoons (parked until the reader can look at pictures); a sketch map.
