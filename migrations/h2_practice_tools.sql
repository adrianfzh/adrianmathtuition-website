-- 🧭 H2 "Which method?" drills + ✍️ the statistics write-up trainer (5 Oct 2026, SPEC-H2-TOOLS.md).
-- Applied to the math project with apply_migration 'h2_practice_tools'.
-- Our own items, each grounded on a school-prelim H2 question (source_question_id), never a national row.
create table if not exists public.method_drills (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('integration','vectors','distributions')),
  skill text not null,
  stem text not null,
  ask text,
  options jsonb not null,
  answer int not null,
  why text not null,
  trap int,
  trap_why text,
  source_question_id uuid references public.questions(id) on delete set null,
  status text not null default 'held' check (status in ('live','held')),
  verify_note text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists method_drills_area_live on public.method_drills(area) where status = 'live';

create table if not exists public.stats_writeup_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hypotheses','conclusion','test-statistic','assumption','tail','correlation','regression')),
  context text not null,
  task text not null,
  elements jsonb not null,
  model_answer text not null,
  tests jsonb,
  source_question_id uuid references public.questions(id) on delete set null,
  status text not null default 'held' check (status in ('live','held')),
  verify_note text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.h2_tool_attempts (
  id bigserial primary key,
  identity text not null,
  tool text not null check (tool in ('method','stats')),
  item_id uuid not null,
  answer text,
  correct boolean,
  result jsonb,
  used_model boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists h2_tool_attempts_identity_day on public.h2_tool_attempts(identity, created_at desc);

-- Service key only (no policies).
alter table public.method_drills enable row level security;
alter table public.stats_writeup_items enable row level security;
alter table public.h2_tool_attempts enable row level security;
