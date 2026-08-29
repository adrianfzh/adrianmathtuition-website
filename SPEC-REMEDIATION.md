# SPEC-REMEDIATION — the targeted fix-it loop (v1 built 2026-08-30)

> **Status: v1 BUILT same day** (`lib/remediation.ts` + `lib/remediation-data.ts`
> + `/api/admin/remediation` + `/api/portal/remediation` + `/app/fixit` + Home
> card + `/admin/remediation` + `remediation_plans`/`remediation_items` tables +
> health-check `remediation`). Deltas from the design below: v1 drafts create
> drill/probe items only (learn items are added via the API/admin until material
> auto-attach lands); bank candidates are picked at DRAFT time so the review
> screen shows the ammo; an item whose canonical topic has no bank questions
> falls back to self-attest; stuck-item surfacing on the reminder is NOT built
> yet. Born from Adrian's ask on the Alessi re-mark review (30 Aug 2026):
> *"identify each area (pedagogy now) that the student is weak in … produce a
> report, come up with useful teaching materials … then practice that relevant /
> similar question … submit for marking through app … request another similar
> until they get right, then move on"* — i.e. practice questions are passive;
> the loop should be **diagnose → teach → drill → prove → advance**, one
> weakness at a time.

## What it is

After a marked paper is released, the system drafts a **fix-it plan**: an ordered
list of weakness items, each carrying its own teaching material and its own
clear-condition. The student works the plan in the portal — read the material,
attempt the targeted question, submit through the existing marking loop, request
another similar on a miss — and an item unlocks the next only when cleared.
Adrian approves the plan before the student ever sees it; the diagnostic report
is his teaching brief, not parent-facing.

## Why the pieces are cheap: almost everything exists

| Loop stage | Existing rail |
|---|---|
| Diagnosis evidence | `paper_marking_runs.result_json` — per-part `error_summary`, `study_note`, `not_attempted`, SEAB codes, `topic_detected` |
| Weakness → revise material | `revise-map.ts` (dropped questions → worked-example sub-groups, already fires at release) + `content_snippets` worked examples |
| Authored materials | `create-teaching-notes` skill (annotated worked-example DOCX, house style) |
| Targeted questions | QB embedding match (`searchSimilarQuestions`) + `/api/portal-similar\|generate` (bot 4-gate verified) |
| Send to student | `portal_assignments` (bank question → instant practice grader, exempt from `DAILY_GRADE_CAP`; DOCX/PDF → `/app/submit?assignment=` → 🌙 queue → auto-release) |
| Retry queue | `notebook_entries` retryOrder (My Notebook) |
| Report drafting | `parent_digests` pattern (draft in admin, Adrian's voice on send) |

The genuinely new pieces: the **diagnosis classifier**, the **plan table + item
state machine**, and the **student-facing plan lane**.

## Pedagogy: classify the LOSS, not just the topic

Each below-max part is classified into one of four kinds — they need different
medicine, and the 30 Aug diagnostic showed the split is real (one student lost
~29 marks to kind 1 and ~12 to kind 2 on the same two papers):

1. **`blank`** — not attempted / abandoned at setup. Medicine: *first-move
   drills* ("write ONLY the opening line" sets), never full questions first.
   A fully-blank topic gets a **probe** item first (short diagnostic set) to
   split can't-start from won't-start.
2. **`procedure`** — a named rule misapplied (the ∫1/(ax+b) factor, chain-rule
   power, reciprocal flips). Medicine: rule card + worked example + 2-question
   drill per micro-skill, cleared by one similar question correct.
3. **`discipline`** — conclusion sentences not written, units, sign slips,
   "show that" endpoints, exact-form. Medicine: checklist habit + short sets
   that score the *sentence*, not the sum.
4. **`concept`** — the method itself wrong (wrong region/limits, wrong
   strategy). Medicine: worked-example sub-group (revise-map) + one scaffolded
   then one bare question.

Classifier: model call at plan-draft time over the run's error fields (the same
shape as `revise-map`'s mapper — grounded choices only, hallucination-dropped),
plus deterministic signals (`not_attempted` ⇒ `blank`; unit/sign regexes ⇒
`discipline` candidates).

## Data model (Supabase, math project)

```
remediation_plans:   id uuid, student_id text, source_run_ids uuid[], status
                     ('draft'|'active'|'done'|'archived'), report_md text,
                     created_at, approved_at, approved_by
remediation_items:   id, plan_id fk, seq int, kind ('probe'|'learn'|'drill'|'prove'),
                     class ('blank'|'procedure'|'discipline'|'concept'),
                     topic text, skill text,          -- "∫1/(ax+b) keeps the 1/a"
                     material jsonb,                  -- {subgroup_id} | {docx_url} | {bank_qids[]}
                     clear_rule jsonb,                -- {practice_pass:n} | {similar_correct:1} | {submit_released:1}
                     state ('locked'|'open'|'awaiting_marking'|'cleared'|'skipped'),
                     attempts int, cleared_at
```

## Flow

1. **Draft** — on release (rides `queuePostReleaseEnrichment`, after revise-map)
   or manually from `/admin/students/[id]`: classifier → plan draft + report_md.
   Idempotent per run set; drafts never reach the student.
2. **Approve** — Adrian reviews plan + report on a small `/admin/remediation`
   screen (edit/delete/reorder items, regenerate material), taps Activate.
   **Checkpoint per doctrine: nothing student-facing without this tap.**
3. **Work** — portal Home card "🎯 Fix-it plan · next: <skill>" → plan lane
   (sits beside the My Notebook bands; same visual language). Item kinds:
   - `learn`: worked-example cards (subgroup deep-link) or the DOCX inline
   - `drill`/`prove`: bank question via the assignments practice grader
     (instant), or worksheet → `/app/submit?assignment=` → 🌙 → auto-release
   - miss ⇒ "another similar" button (existing similar/generate, existing
     caps; assignment-linked = exempt like today's assignments)
   - clear_rule met ⇒ state `cleared`, next item unlocks
4. **Watch** — item stuck >N days or 3 misses ⇒ surfaces on the admin screen
   (and the daily triage-reminder line gains a count), never auto-nags the
   student. Plan completion → one Telegram to Adrian.
5. **Log** — plan drafts stamp `job_runs` (`remediation-draft`); add the
   `JOB_RHYTHMS` line when the trigger ships.

## Deliberately NOT in v1

- No auto-send of the plan (Adrian's tap is the gate — moat: standard + accountability).
- No parent-facing copy of the report (his voice, his channel).
- No new marking surface — proving rides the existing submit/queue/release loop.
- No spaced-repetition scheduling — sequence + clear-rules only; revisit later.

## Open questions for Adrian

1. Clear rule default: one similar correct, or two in a row?
2. Should `probe` results silently reorder the plan (can't-start topics float up)?
3. Plan size cap per paper — top 3 weaknesses? top 5?
4. Does the plan lane wait for the marking-only beta to widen, or ship inside it
   (it rides assignments, which are already live in the beta)?
