-- 🔁 The learning loop (SPEC-LEARN-LOOP.md, 31 Oct 2026): a loop answer is stored
-- with attempted_via = 'portal-loop' (its own daily cap; progress is derived from these
-- rows). The check constraint listed every kind, so the new one must be added or the
-- insert is refused (found on the first preview run: marked, but nothing saved).
alter table public.student_attempts drop constraint if exists student_attempts_attempted_via_check;
alter table public.student_attempts add constraint student_attempts_attempted_via_check
  check (attempted_via = any (array['portal'::text, 'telegram'::text, 'portal-mcq'::text, 'portal-fix'::text, 'portal-loop'::text]));
