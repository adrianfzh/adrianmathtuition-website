-- SPEC-PORTAL-V2 §7 (Practice Again hands back its questions) + §3 (Practice is the
-- to-do list). Applied to the math project (nempslbewxtlikfzachi) on 6 Sep 2026 as
-- migration `portal_assignments_practice_again`.
--
-- portal_assignments grows from "what Adrian sent" into the student's whole
-- to-do list. Every row now says WHERE it came from (`source`), and a row the
-- sheet worker handed back carries the skill it fixes, the paper's subject (so
-- the subject gate can filter it), the sheet job + position that created it
-- (idempotency), and — when the worker WROTE the question because the bank had
-- none that fit — the question text, its answer and the marks, so the practice
-- grader can mark it without a bank row.
--
--   source        'adrian' (the Send-work card, release-with-sheet's PDF, the
--                 remediation drills — everything that existed before this)
--                 | 'practice-again' (one row per practice question on the
--                 self-study sheet, created by /api/admin/sheet-jobs `done`)
--                 | 'find' (Find a question, §4 — another build inserts these)
--   status        'held' is NEW: created but not yet released. A held row is
--                 invisible to the student (every student read excludes it) and
--                 flips to 'assigned' when Adrian's Approve & release releases
--                 the paper + sheet (mark-triage release / release-with-sheet).
--   kind          'generated' is NEW: a question with no bank row — text +
--                 answer live on the assignment itself.

alter table public.portal_assignments
  add column if not exists source        text not null default 'adrian',
  add column if not exists skill_title   text,
  add column if not exists subject       text,
  add column if not exists sheet_job_id  uuid references public.sheet_jobs(id) on delete set null,
  add column if not exists sheet_index   integer,
  add column if not exists question_text text,
  add column if not exists answer_latex  text,
  add column if not exists marks         integer;

alter table public.portal_assignments drop constraint if exists portal_assignments_kind_check;
alter table public.portal_assignments
  add constraint portal_assignments_kind_check
  check (kind in ('question', 'worksheet', 'generated'));

alter table public.portal_assignments drop constraint if exists portal_assignments_status_check;
alter table public.portal_assignments
  add constraint portal_assignments_status_check
  check (status in ('held', 'assigned', 'submitted', 'marked', 'revoked'));

-- A generated question is gradable only with its text AND answer on the row.
alter table public.portal_assignments drop constraint if exists portal_assignments_generated_check;
alter table public.portal_assignments
  add constraint portal_assignments_generated_check
  check (kind <> 'generated' or (question_text is not null and answer_latex is not null));

-- Idempotency for the sheet hand-back: re-running `done` for the same job
-- upserts ON CONFLICT DO NOTHING on (sheet_job_id, sheet_index). Deliberately a
-- FULL unique index (nulls are distinct, so Adrian's own rows never collide) —
-- PostgREST's on_conflict cannot name a partial index's predicate.
create unique index if not exists portal_assignments_sheet_item_uniq
  on public.portal_assignments (sheet_job_id, sheet_index);

-- The release flip: "every held practice-again row written FROM this paper".
create index if not exists portal_assignments_source_run_status_idx
  on public.portal_assignments (source_run_id, status)
  where source_run_id is not null;

comment on column public.portal_assignments.source is 'adrian | practice-again | find — which list section the row belongs to (SPEC-PORTAL-V2 §3)';
comment on column public.portal_assignments.skill_title is 'Practice Again: the sheet section heading (the skill this question fixes)';
comment on column public.portal_assignments.subject is 'A Math | E Math | H2 Math | Other — the subject gate (lib/portal-subjects) filters student reads on it';
comment on column public.portal_assignments.sheet_job_id is 'Practice Again: the sheet_jobs row whose done payload created this row';
comment on column public.portal_assignments.sheet_index is 'Practice Again: 0-based position of the question on the sheet (unique with sheet_job_id)';
comment on column public.portal_assignments.question_text is 'kind=generated: the question the sheet worker wrote (LaTeX in $…$)';
comment on column public.portal_assignments.answer_latex is 'kind=generated: the verified answer the grader marks against';
comment on column public.portal_assignments.marks is 'kind=generated: marks the question is worth';
