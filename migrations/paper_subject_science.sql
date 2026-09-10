-- 10 Sep 2026 — the Science tab (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026).
-- paper_subject widens to the three sciences: a science hand-in is stamped
-- 'Physics' | 'Chemistry' | 'Biology' and lives under /app/science; the maths
-- gate (subjectAllowed) does not admit these, so the maths Papers list never
-- shows them. The marking lane itself is the `subject` column (unchanged).
alter table public.paper_marking_runs drop constraint if exists paper_marking_runs_paper_subject_check;
alter table public.paper_marking_runs add constraint paper_marking_runs_paper_subject_check
  check (paper_subject is null or paper_subject = any (array['A Math','E Math','H2 Math','Physics','Chemistry','Biology','Other']));
