-- humanities_runs: a timed paper (SPEC-HUMANITIES.md §A4, 7 Oct 2026) is up to seven answers
-- handed in together. They share a paper_id; paper_minutes is how long the student took.
-- Both null on an answer handed in on its own.
alter table public.humanities_runs add column if not exists paper_id uuid;
alter table public.humanities_runs add column if not exists paper_minutes int;
create index if not exists humanities_runs_paper_idx on public.humanities_runs (paper_id) where paper_id is not null;
