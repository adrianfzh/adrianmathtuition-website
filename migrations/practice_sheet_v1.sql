-- Practice sheets from photos (SPEC-PRACTICE-PHOTO.md §14, 24 Sep 2026):
-- a sheet_jobs row with no run — kind 'photo-sheet', the photos it was
-- asked for, and the Singapore day it may start (the waiting list).
-- Applied to the math project (nempslbewxtlikfzachi) on 24 Sep 2026.
alter table public.sheet_jobs alter column run_id drop not null;
alter table public.sheet_jobs
  add column if not exists kind text not null default 'practice-again',
  add column if not exists photos jsonb,
  add column if not exists scheduled_for date,
  add column if not exists worked_example boolean not null default false;
create index if not exists sheet_jobs_kind_status_scheduled_idx
  on public.sheet_jobs (kind, status, scheduled_for);
