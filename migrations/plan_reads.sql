-- plan_reads (7 Oct 2026, Adrian: "we should not be using API" … "all on plan").
-- A queue of small readings done on PLAN usage instead of the paid key: the website writes the
-- finished prompt, the Fly worker's one-minute lane (bot scripts/plan-reads.js) runs it with
-- `claude -p` on a pooled login and writes the raw reply back; the website parses the reply.
-- First user: the English Practise checker (kind 'english-check', lib/english-practice-store.ts).
-- RLS on, no policies — service key only. Applied to the MAIN project 7 Oct 2026.
create table if not exists public.plan_reads (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- 'english-check'
  identity text,                      -- whose answer (portal identity, or 'admin')
  ref text,                           -- what it is about (english: the unit key)
  prompt text not null,               -- the whole prompt; the worker adds nothing
  model text not null default 'sonnet',
  status text not null default 'queued' check (status in ('queued','claimed','replied','failed')),
  reply text,                         -- the reader's raw reply
  error text,
  attempts integer not null default 0,
  meta jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at timestamptz
);
create index if not exists plan_reads_waiting on public.plan_reads (created_at) where status in ('queued','claimed');
create index if not exists plan_reads_identity on public.plan_reads (identity, kind, created_at desc);
alter table public.plan_reads enable row level security;
