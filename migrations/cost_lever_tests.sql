-- 💰 cost_lever_tests (5 Oct 2026): one row per cost-saving lever — the test that set
-- its bar and its verdict. Read by the Monday cost check (/api/cron/weekly-cost,
-- lib/weekly-cost.ts). status: running | passed | failed | on (set 'on' in the same
-- session that flips the switch, so the lever is no longer offered).
create table if not exists public.cost_lever_tests (
  name text primary key,
  status text not null default 'running' check (status in ('running','passed','failed','on')),
  switch_flag text,
  measure jsonb,
  saving_per_paper_usd numeric,
  note text,
  measured_at timestamptz default now()
);
alter table public.cost_lever_tests enable row level security;
-- No policies: service key only.
