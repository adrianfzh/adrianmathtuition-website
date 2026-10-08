-- Worksheet picker: saved selections (8 Oct 2026). A session saves the questions
-- it shortlisted; /admin/worksheet-picker lists them so Adrian opens one with a
-- tap instead of a 900-character link. Admin-only through the service key
-- (RLS on, no policies — PostgREST anon/authed roles see nothing).
-- Applied to adrianmathtuition (nempslbewxtlikfzachi) on 8 Oct 2026.
create table if not exists public.worksheet_picks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  subtitle text not null default '',
  note text not null default '',
  source text not null default 'session',
  question_ids uuid[] not null default '{}',
  opened_at timestamptz
);
create index if not exists worksheet_picks_created_idx on public.worksheet_picks (created_at desc);
alter table public.worksheet_picks enable row level security;
