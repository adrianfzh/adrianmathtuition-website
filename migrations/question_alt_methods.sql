-- 🔀 Another way to solve this (SPEC-ANOTHER-WAY.md, 4 Nov 2026, Adrian: "can we build #5
-- too > but as a dropdown (closed by default), so students can click or tap if they want?").
--
-- One row per bank question that has a GENUINELY different second method. Written by
-- plan-billed session agents (scripts/another-way/), checked by a blind solver that must
-- reach the bank's own answer, saved as 'pending', and served to a student only once
-- Adrian presses Approve on /admin/another-way. The marker's one-method rule is untouched:
-- this sits under the worked solution on the website only, closed until tapped.
create table if not exists public.question_alt_methods (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id) on delete cascade,
  -- Short names of the two methods, e.g. 'Substitution' / 'Elimination'.
  main_method text not null,
  alt_method text not null,
  -- The second method's working, in the house style (one step a line, ends with **Answer:**).
  working text not null,
  -- ONE plain line: which method is better HERE, and why.
  better text not null,
  -- The final answer the second method reaches (must equal the bank's answer).
  alt_answer text not null,
  -- The blind check: { same: boolean, solver_answer, different: boolean, in_syllabus: boolean, notes }.
  checks jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists question_alt_methods_status_idx on public.question_alt_methods (status);

alter table public.question_alt_methods enable row level security;
grant select, insert, update, delete on table public.question_alt_methods to service_role;
