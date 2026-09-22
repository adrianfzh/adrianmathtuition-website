-- Practice photo v1 (SPEC-PRACTICE-PHOTO.md §7, 23 Sep 2026)
--
-- A photographed question becomes a NEW question written for the student,
-- re-skinned from a bank seed. This migration adds:
--   questions.twin_of              the seed a generated question was re-skinned from
--   questions.reported_at/by/reason a student's Report on a generated question
--   generation_requests.priority   plan worker claims priority desc, created_at asc
--   generation_requests.portal_account_id / intent_json
--   portal_assignments.status 'writing'  the "Writing…" row before the question exists
--   portal_assignments.source 'practice-photo'
--   portal_generation_log.tier 'practice-photo'

alter table public.questions
  add column if not exists twin_of uuid references public.questions(id) on delete set null,
  add column if not exists reported_at timestamptz,
  add column if not exists reported_by text,
  add column if not exists report_reason text,
  add column if not exists gen_meta jsonb;

create index if not exists questions_twin_of_idx on public.questions (twin_of) where twin_of is not null;
create index if not exists questions_reported_idx on public.questions (reported_at) where reported_at is not null;

alter table public.generation_requests
  add column if not exists priority smallint not null default 0,
  add column if not exists portal_account_id uuid,
  add column if not exists intent_json jsonb;

create index if not exists generation_requests_pending_priority_idx
  on public.generation_requests (priority desc, created_at asc) where status = 'pending';

alter table public.portal_assignments drop constraint if exists portal_assignments_status_check;
alter table public.portal_assignments
  add constraint portal_assignments_status_check
  check (status in ('writing', 'held', 'assigned', 'submitted', 'marked', 'revoked'));

alter table public.portal_assignments drop constraint if exists portal_assignments_source_check;
alter table public.portal_assignments
  add constraint portal_assignments_source_check
  check (source in ('adrian', 'find', 'practice-again', 'practice-photo'));

alter table public.portal_assignments
  add column if not exists generation_request_id uuid;
create index if not exists portal_assignments_generation_request_idx
  on public.portal_assignments (generation_request_id) where generation_request_id is not null;

alter table public.portal_generation_log drop constraint if exists portal_generation_log_tier_check;
alter table public.portal_generation_log
  add constraint portal_generation_log_tier_check
  check (tier is null or tier in ('similar', 'made-for-you', 'practice-photo'));
alter table public.portal_generation_log
  add column if not exists generation_request_id uuid;
