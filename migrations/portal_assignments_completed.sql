-- 1 Oct 2026 (Adrian: "do the done fold and done button"): a student may mark their
-- OWN Practice item (a find or a photo question/sheet) as done without grading.
-- Applied to prod the same day (apply_migration portal_assignments_completed).
alter table public.portal_assignments drop constraint if exists portal_assignments_status_check;
alter table public.portal_assignments
  add constraint portal_assignments_status_check
  check (status in ('writing', 'held', 'assigned', 'submitted', 'marked', 'revoked', 'completed'));
alter table public.portal_assignments add column if not exists completed_at timestamptz;
comment on column public.portal_assignments.completed_at is 'Set when the student ticked the item Done themselves (status completed) — no attempt, no score.';
