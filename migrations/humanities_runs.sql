-- humanities_runs — one typed humanities answer and its feedback (SPEC-HUMANITIES.md, 2 Oct 2026).
-- RLS on with no policies: service key only.
create table if not exists public.humanities_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  airtable_student_id text not null,
  student_name text,
  subject text not null default 'social-studies',
  skill text not null,
  question_id text not null,
  answer_text text not null,
  word_count int,
  status text not null default 'queued',
  claimed_at timestamptz,
  marked_at timestamptz,
  released_at timestamptz,
  report jsonb,
  level int,
  level_lo int,
  level_hi int,
  levels_max int,
  reads jsonb,
  held_reason text,
  error text,
  source text not null default 'app',
  calibration_set text,
  truth_level int,
  scheme_version text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric
);
alter table public.humanities_runs enable row level security;
create index if not exists humanities_runs_student_idx on public.humanities_runs (airtable_student_id, created_at desc);
create index if not exists humanities_runs_set_idx on public.humanities_runs (calibration_set) where calibration_set is not null;
