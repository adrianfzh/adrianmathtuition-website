# SPEC — "My Plan": the student's adaptive revision plan

> Status: **DRAFT 2026-08-26** — written on Adrian's directive ("customized
> revision plans based on performance and adaptive learning paths sounds good.
> let's work that into student portal"). Prompted by Odyssey Math Tuition's
> 2026 announcement of exactly these two phrases as a *later-2026 roadmap*;
> our substrate for both already exists and mostly shipped 2026-08-26
> (mastery model + weak-spot paper preset). This spec is the composing surface.

## Why (one paragraph)

Odyssey press-released "customized revision plans based on individual student
performance" and "adaptive learning paths" as work-in-progress for late 2026.
We hold every ingredient live today: `lib/mastery.ts` is a per-student,
evidence-weighted, recency-decayed topic-mastery ledger fed by marked papers
and notebook re-attempts; `/app/print`'s **Fix-my-weak-spots** preset already
draws papers weighted by the student's own dropped marks; `/app/practice`
serves per-topic questions marked line-by-line; `/app/notebook` closes the
re-attempt loop; SPEC-ASSIGN gives "From Adrian" work a home. What no student
can see is the *narrative*: which topics are weak, what the evidence is,
what to do this week, and whether it's working. "My Plan" is that page — a
plan that recomputes itself from live mastery on every visit, which IS the
adaptive path, with no cron and no stored plan to drift.

## The page (`/app/plan`)

One screen, three bands:

1. **Focus topics (max 3)** — the lowest-mastery topics that clear
   `EVIDENCE_MIN` and aren't stale (`STALE_FLOOR`), each showing:
   the mastery score + trend arrow (↑/↓ from `RECENT_DAYS`), the evidence in
   plain words ("lost 9 of 14 marks across 2 papers, last on 21 Aug"), and
   TWO action buttons: **Practice now** → `/app/practice?topic=<slug>` and
   **Print a weak-spot paper** → `/app/print` (weak-spot preset preselected).
2. **Keep warm (max 3)** — topics whose score is fine but whose evidence is
   decaying toward `STALE_FLOOR` ("last touched 6 weeks ago") — one
   Practice button each. This is the "adaptive path" beyond remediation:
   the plan rotates topics back in before they go stale.
3. **This week's wins** — notebook re-attempts beaten and papers handed in
   inside `RECENT_DAYS`, so the plan visibly responds to work done (the
   closing of the loop is the retention hook).

Empty states matter: a student with < `EVIDENCE_MIN` total evidence sees
"Hand in one paper and your plan builds itself" with the Submit CTA — the
plan page is also the hand-in funnel.

## Reuse map (all existing — do NOT rebuild)

- **Ranking + trends**: `lib/mastery.ts` (`topicMastery(...)`, pure, tested)
  fed exactly the way `/app/notebook`'s API already assembles
  `StudentPaper[]` + entries — lift that assembly into a shared helper
  rather than re-implementing.
- **Weak-spot draw**: `/app/print` preset (SPEC-PRINT-PAPER D-table) — link,
  don't duplicate.
- **Per-topic practice**: `/app/practice` route already accepts a topic path.
- **Student identity/level**: `currentStudent()` (Airtable join), as in
  practice/print.
- **Beta gate**: add `/app/plan` to the `MARKING_ONLY_BETA` allowlist in
  `src/lib/portal-beta.ts` (it is marking-derived, so it belongs in the
  marking-only beta) + nav/Home entry.

## API

`GET /api/portal/plan` → `{ focus: [...], keepWarm: [...], wins: [...] }`,
derived on read (mastery doctrine: no materialised plan table in v1). The
shaping function is pure (`lib/plan.ts`, vitest) — bands, caps, evidence
sentences, empty-state flags all unit-tested; the route is a thin fetch+shape.

## Telegram nudge (phase 2, bot repo — separate session)

Weekly (Sunday 6pm SGT) per-student plan ping via the bot for linked chats:
"Your plan this week: Trigonometry (Equations) ↓, Vectors — 2 focus topics.
Open: <portal link>". Reuses the digest patterns in cron/. NOT in this build.

## Non-goals (v1)

- No stored/scheduled plans, no streaks, no gamification.
- No parent surface (PORTAL.md locked decision: parents stay on Telegram —
  the parent digest is its own bot-side spec).
- No new mastery math — the model in `lib/mastery.ts` is the single source;
  a plan disagreement with the notebook page would be a bug by definition.

## Definition of done

`/app/plan` live behind the beta gate for students; `lib/plan.ts` pure +
tested; nav/Home entry; empty state verified with a fresh test student;
`npm test` green; dev-preview walkthrough screenshots in the PR/turn summary.
