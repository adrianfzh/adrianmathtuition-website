# QMINE — student-demand mining (spec)

> Owner: the `question-mine-daily` Claude Code scheduled task (Mac A,
> **Mon & Thu 7:00am SGT**). Doctrine: [CLAUDE.md → Building doctrine]. This
> file is the spec the task follows verbatim (step 1 of the recipe). Created
> 2026-08-28 as daily (Adrian: "instead of weekly, make it more frequent");
> same day dialed to twice-weekly (Adrian: "daily is too frequent") and pinned
> to **Fable 5, high reasoning effort** for the mining + judgment work.

## What this loop is (and is not)

QMINE mines **what students actually asked** and cross-references it against
**what the site can serve** (practice pool + revision notes). It closes the
mechanical half of the gap unattended and hands Adrian a short judgment list.

It is NOT the bot answer-quality loop — `bot-review` (weekly, bot repo) owns
flagged/low-confidence answers, 👎, marking overrides, and friction. QMINE never
re-diagnoses answer quality; if it trips over an obviously broken answer it may
mention it in the digest as a pointer to bot-review, nothing more.

## Inputs (read-only except where stated)

1. **Airtable `Questions`** — last 96h by `Timestamp` (covers the Thu→Mon
   gap with a day of overlap; the ≥2-asks thresholds below are per-window). Fields: `Student` (link),
   `Caption`, `Topic`, `Subject`, `Status`, `Timestamp`. Skip test traffic
   (`Chat ID` starting `web-check-` / `web-probe`). Resolve each `Student` link
   to the student's Level via `Students` (fetch linked records, match record id
   in JS — never `FIND(...ARRAYJOIN...)`, see CLAUDE.md gotcha).
2. **Supabase (math, `nempslbewxtlikfzachi`)**:
   - practice coverage: eligible question count per (level, topic) the way the
     practice pool sees it (`practice_pool` / kiosk eligibility, tree-scoped);
   - notes coverage: does the topic exist in the `/revise` tree
     (`subgroups`/`sections_meta`) and how many `content_snippets` it holds;
   - pending `generation_requests` (for dedup before enqueueing).
3. Topic strings are bot-authored free text — normalize against
   `src/lib/canonical-topics.ts` + the QB topic vocabulary before comparing.
   An unmappable topic string is itself a finding (judgment lane), not an error.

## Mechanical lane — allowed unattended actions

Exactly one write-path: **enqueue `generation_requests` rows** for the nightly
plan-billed topup to author (it owns all gates and insertion).

Enqueue when ALL hold:
- the (level, topic) was asked ≥2 times in the window by ≥2 distinct students
  (Subject = Math);
- its eligible practice-pool count at that level is < 8;
- no `pending` generation_request for the same topic already exists;
- the bank has ≥1 clean question in that (level, topic) to use as
  `source_question_id` exemplar.

Row shape: `(source_question_id, topic, tier, count: 3, similarity_level:
're-skin', requested_by: 'question-mine')`. **Cap: ≤3 requests per run.**
If the bank has NO exemplar at all for a demanded topic → judgment lane (that
gap needs Adrian's call, not synthetic seeding).

Red lines (never unattended): authoring or editing notes/cards/snippets, any
Airtable write, any student- or parent-facing send, any QB row edit or
re-classification, anything in the marking pipeline.

## Judgment lane — the ≤3 list

Rank remaining findings by (distinct students × asks) and hand Adrian at most
3, each with evidence: counts, one example question (Caption or first line),
and what the site currently serves. Typical members: demanded topic with zero
notes section; demanded topic with no bank presence; unmappable topic strings
recurring; non-Math demand spikes (Science/etc. — feed for SPEC-SUBJECTS.md,
count them as one line, don't itemize).

An unaddressed judgment item may reappear on later days — that is intended
(visibility), the cap keeps it short.

## Digest — Telegram to Adrian, ALWAYS (even when quiet)

Same channel as health alerts (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`,
website `.env.local`, trim quotes/newlines). ≤15 lines:

```
⛏ QMINE — <date>
Asked (96h): N questions · M students · top: <topic ×k, topic ×k, topic ×k>
Enqueued for topup: <topic (level) ×3, …>  |  or "pool covers today's demand"
Needs your call:
1. <finding — evidence — what the site serves today>
2. …
(quiet lanes omitted; non-Math asks: N)
```

## Worked example

Window: 9 Math questions. "R-formula" asked 3× by 2 Sec students → normalize →
AM `Trigonometry (R-Formula)`; pool has 5 eligible AM questions (<8); no pending
request; exemplar exists → enqueue one generation_request (count 3). "Vectors
dot product" asked 2× by JC students → JC2 pool has 23 eligible → covered, no
action. One question Topic "Sets venn" from an S2 student → no `/revise` S2
sub-group matches Sets → judgment item #1 with the example caption. Digest lists
the enqueue + 1 judgment item; job_runs stamped ok=true.

## Environment

Model/effort (Adrian, 2026-08-28): the task's SKILL.md frontmatter pins
`model: fable` + `effort: high`. There is no per-task effort field in the
scheduler record, but Fable 5's default effort is high, so both resolution
paths land on high. ⚠ Never set a global `effortLevel` or
`CLAUDE_CODE_EFFORT_LEVEL` in `~/.claude/settings.json` without rechecking —
the env var overrides frontmatter and would silently unpin this.

Run with the website repo (`~/dev/adrianmathtuition-website`) as cwd. Airtable:
`AIRTABLE_TOKEN`/`AIRTABLE_BASE_ID` from `.env.local` (values are quoted —
strip). Supabase writes: the same access the Mac skills use (bot repo
`~/dev/adrianmath-telegram-math-bot/.env` carries the Supabase keys) — or
`SUPABASE_URL` + `SUPABASE_SECRET_KEY` when present locally. No git commits, no
pushes — this loop edits nothing in the repo.

## Stamp the logbook (always, the very last step)

Whatever happened — success, partial, failure:

    insert into job_runs (job, ok, summary)
    values ('question-mine', <true|false>, '<one line: asks seen, enqueued, judgment count>');

`job` is exactly `question-mine` (rhythm: Mon & Thu 7am, alarms via
`lib/job-health.ts` after 108h — the 96h Thu→Mon gap plus half a day). A run
that skips the stamp reads as a run that never happened.
