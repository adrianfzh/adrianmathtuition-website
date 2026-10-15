-- The mark the student's school teacher gave (15 Oct 2026, Adrian: "can we keep track of how the marker does on
-- humanities?"). Typed in by the student on the feedback page; /admin/humanities-marker compares it with ours.
-- Applied 15 Oct 2026.
alter table public.humanities_runs
  add column if not exists teacher_mark numeric,
  add column if not exists teacher_total integer,
  add column if not exists teacher_at timestamptz;
comment on column public.humanities_runs.teacher_mark is 'The mark the student''s school teacher gave this answer, typed in by the student (15 Oct 2026) — the truth the marker is tracked against.';
