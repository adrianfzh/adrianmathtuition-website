-- Applied to the math project 2026-10-23 (Supabase MCP apply_migration,
-- name fix_one_on_paper_screen). Kept here for the record.
--
-- "Fix one" on the marked-paper screen (SPEC-STUDENT-FIRST.md §Fix one):
-- the one practice question answered under the question that lost the most
-- marks is stored with attempted_via = 'portal-fix' (outside the daily
-- grading cap, which counts 'portal' only). The picks are cached on the run
-- in fix_one so a reload shows the same question.
--   fix_one = { picks: [{ id, q, from: 'skill' | 'twin', at }] }
alter table public.student_attempts drop constraint if exists student_attempts_attempted_via_check;
alter table public.student_attempts add constraint student_attempts_attempted_via_check
  check (attempted_via = any (array['portal'::text, 'telegram'::text, 'portal-mcq'::text, 'portal-fix'::text]));
alter table public.paper_marking_runs add column if not exists fix_one jsonb;
