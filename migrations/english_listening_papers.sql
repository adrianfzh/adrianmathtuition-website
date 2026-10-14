-- Whole English listening papers, made ahead and checked, at three levels
-- (SPEC-ENGLISH-ORAL-LISTENING.md §More papers; Adrian, 14 Oct 2026).
-- One row per paper. Service key only (RLS on, no policies) — lib/english-listening-store.ts.
--   status: 'checked'  every check passed, the blind reader matched the key; no recordings yet
--           'ready'    recordings made; served by "New paper"
--           'rejected' a check failed (reasons in checks.problems); never served
--           'retired'  taken out by Adrian; never served again (attempts keep their rows)
create table if not exists public.english_listening_papers (
  id text primary key check (id ~ '^lp[0-9]{3}$'),
  level text not null check (level in ('easier','standard','harder')),
  status text not null default 'checked' check (status in ('checked','ready','rejected','retired')),
  paper jsonb not null,                 -- ListeningPaper: { id, level, parts: ListeningSet[4] }
  checks jsonb,                         -- { problems[], blind: { misses[], by, at }, copy: { shared[] }, sgWords[] }
  audio jsonb,                          -- { "lp001-1": { key, seconds, chars }, … }
  made_by text not null default 'session',   -- 'session' | 'worker'
  made_for text,                        -- the keenest student whose use asked for it (one a day each); null = the floor
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
create index if not exists english_listening_papers_level on public.english_listening_papers(level, status, id);
create index if not exists english_listening_papers_created on public.english_listening_papers(created_at desc);
alter table public.english_listening_papers enable row level security;

-- The recordings: a public bucket (a listening recording is not private; the page plays it by URL).
insert into storage.buckets (id, name, public) values ('english-audio', 'english-audio', true)
on conflict (id) do nothing;
