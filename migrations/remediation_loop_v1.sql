-- APPLIED 2026-08-30 via Supabase MCP apply_migration as `remediation_loop_v1`
-- (+ `remediation_plan_level` adding the level column), math project
-- nempslbewxtlikfzachi. Record copy — do not re-run blindly.
--
-- SPEC-REMEDIATION v1: fix-it plans + items. All access is server-side via the
-- service key (same posture as paper_marking_runs); RLS on with no policies so
-- anon/authed clients see nothing.
create table if not exists remediation_plans (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  student_name text not null default '',
  level text not null default '',
  source_run_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','active','done','archived')),
  report_md text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists remediation_plans_student_idx on remediation_plans (airtable_student_id, status);

create table if not exists remediation_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references remediation_plans(id) on delete cascade,
  seq int not null,
  kind text not null check (kind in ('probe','learn','drill','prove')),
  loss_class text not null check (loss_class in ('blank','procedure','discipline','concept')),
  topic text not null default '',
  skill text not null,
  evidence jsonb not null default '[]',
  material jsonb not null default '{}',
  clear_rule jsonb not null default '{"kind":"full_marks"}',
  state text not null default 'locked' check (state in ('locked','open','awaiting_marking','cleared','skipped')),
  attempts int not null default 0,
  assignment_ids uuid[] not null default '{}',
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists remediation_items_plan_idx on remediation_items (plan_id, seq);

alter table remediation_plans enable row level security;
alter table remediation_items enable row level security;
