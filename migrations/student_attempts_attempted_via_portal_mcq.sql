-- Applied to the math project 2026-09-02 (Supabase MCP apply_migration,
-- name student_attempts_attempted_via_portal_mcq). Kept here for the record.
--
-- Physics practice: MCQ attempts from the science bank are marked
-- deterministically (no model call) and stored with attempted_via = 'portal-mcq'
-- so they sit outside the daily grading cap and the practice digest, both of
-- which count attempted_via = 'portal'. The CHECK previously allowed only
-- 'portal' | 'telegram', which rejected those inserts silently.
alter table public.student_attempts drop constraint if exists student_attempts_attempted_via_check;
alter table public.student_attempts add constraint student_attempts_attempted_via_check
  check (attempted_via = any (array['portal'::text, 'telegram'::text, 'portal-mcq'::text]));
