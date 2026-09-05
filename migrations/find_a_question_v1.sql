-- Find a question (SPEC-PORTAL-V2 §4, Adrian 6 Sep 2026) — applied to the math
-- project (nempslbewxtlikfzachi) as migration `find_a_question_v1`.
--
-- 1. portal_assignments learns WHO put a row on the student's list and, for the
--    student's own finds, which tier the card shows. 'adrian' is the default so
--    every existing Send-work / desk row keeps its meaning; 'practice-again' is
--    reserved for the sheet worker's hand-back (§7).
alter table public.portal_assignments
  add column if not exists source text not null default 'adrian',
  add column if not exists find_tier text;
alter table public.portal_assignments
  drop constraint if exists portal_assignments_source_check;
alter table public.portal_assignments
  add constraint portal_assignments_source_check
  check (source in ('adrian', 'find', 'practice-again'));
alter table public.portal_assignments
  drop constraint if exists portal_assignments_find_tier_check;
alter table public.portal_assignments
  add constraint portal_assignments_find_tier_check
  check (find_tier is null or find_tier in ('similar', 'made-for-you'));
create index if not exists portal_assignments_student_source_idx
  on public.portal_assignments (airtable_student_id, source);

-- 2. portal_generation_log (the find ledger, one row per /find call and per
--    /generate attempt) grows what the nightly find-review needs to judge a
--    match: the student's own question text, the level searched, the tier that
--    reached the student, the Practice row it became, the whole candidate pool
--    with each verdict + reason, and the reviewer's verdict.
alter table public.portal_generation_log
  add column if not exists seed_text text,
  add column if not exists level text,
  add column if not exists tier text,
  add column if not exists assignment_id uuid references public.portal_assignments(id) on delete set null,
  add column if not exists parent_log_id uuid references public.portal_generation_log(id) on delete set null,
  add column if not exists candidates jsonb,
  add column if not exists review jsonb;
alter table public.portal_generation_log
  drop constraint if exists portal_generation_log_tier_check;
alter table public.portal_generation_log
  add constraint portal_generation_log_tier_check
  check (tier is null or tier in ('similar', 'made-for-you'));
create index if not exists portal_generation_log_created_at_idx
  on public.portal_generation_log (created_at desc);
create index if not exists portal_generation_log_student_created_idx
  on public.portal_generation_log (airtable_student_id, created_at desc);
