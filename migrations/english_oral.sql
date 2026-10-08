-- English oral practice (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026): one row per attempt at a
-- Paper 4 part — the planned response to a picture, or the spoken interaction (three prompts).
-- The recordings are private files (oral/<identity>/<attempt>/<n>.<ext>, lib/student-files);
-- this row holds the words and the report. Service key only (RLS on, no policies) — read and
-- written by lib/english-oral-store.ts. Erased with the account (lib/erasure.ts).
create table if not exists public.english_oral_attempts (
  id uuid primary key default gen_random_uuid(),
  identity text not null,
  set_id text not null,                                   -- "or01"
  part text not null check (part in ('planned','interaction')),
  answers jsonb not null default '[]'::jsonb,             -- [{ q, key, seconds, heard, said }] — heard = as turned into words, said = as the student confirmed
  status text not null default 'recording' check (status in ('recording','queued','done','failed')),
  job uuid,                                               -- the plan_reads row that reads the words
  report jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists english_oral_attempts_identity on public.english_oral_attempts(identity, created_at desc);
alter table public.english_oral_attempts enable row level security;

-- Listening (the same day): an attempt at one of our own recordings is logged beside the other
-- English practice attempts, marked by the key (used_model = false).
alter table public.english_practice_attempts drop constraint if exists english_practice_attempts_kind_check;
alter table public.english_practice_attempts add constraint english_practice_attempts_kind_check
  check (kind in ('editing','short','choice','summary','listening'));

-- The private bucket lists the kinds of file it takes; a spoken answer is a sound file.
update storage.buckets
   set allowed_mime_types = (select array(select distinct unnest(allowed_mime_types || array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav'])))
 where id = 'student-files' and allowed_mime_types is not null;
