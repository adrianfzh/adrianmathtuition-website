-- The Humanities marker checks itself and improves itself (15 Oct 2026, Adrian: "i want our own marker to self
-- aware of whether it is doing a good job and to auto fix or auto improve if required"). lib/humanities-selfcheck.ts.
-- Also drops the teacher's-mark columns added earlier the same day (Adrian: "there is no need for that").
-- Applied 15 Oct 2026.
alter table public.humanities_runs drop column if exists teacher_mark, drop column if exists teacher_total, drop column if exists teacher_at;

create table if not exists public.humanities_audits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.humanities_runs(id) on delete cascade,
  skill text not null,
  delivered_lo integer, delivered_hi integer,
  plan_read_id uuid,
  status text not null default 'queued',          -- queued · done · failed
  audit_level integer,
  verdict text,                                    -- agree · delivered_high · delivered_low
  why text,
  missed_rule text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (run_id)
);
create index if not exists humanities_audits_status on public.humanities_audits(status, created_at);
alter table public.humanities_audits enable row level security;

create table if not exists public.humanities_rule_patches (
  id uuid primary key default gen_random_uuid(),
  skill text not null,
  rule text,
  status text not null default 'drafting',         -- drafting · testing · live · rejected · off
  evidence jsonb,                                   -- the audits that led to it
  test jsonb,                                       -- the test reads and their scores
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists humanities_rule_patches_skill on public.humanities_rule_patches(skill, status);
alter table public.humanities_rule_patches enable row level security;
