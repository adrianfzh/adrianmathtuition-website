-- 📌 My definitions (14 Oct 2026, Adrian: "allow a function that would let students
-- add their own definition too … allow students to remove them too > so it is a
-- study resource"). lib/my-definitions.ts + lib/my-definitions-store.ts,
-- /api/portal/definitions. RLS on with NO policies: only the server reads these,
-- through the service client, scoped by the session's portal identity.

-- One row per saved definition per student.
create table if not exists public.student_definitions (
  id uuid primary key default gen_random_uuid(),
  identity text not null,                 -- portal identity: rec… / acct:<uuid> / admin:preview
  subject text not null check (subject in ('physics', 'biology')),
  term_key text not null,                 -- lib/my-definitions termKey()
  term text not null,
  text text not null,                     -- one sentence, **bold** = the scoring words
  formula text,
  source text not null check (source in ('list', 'notes', 'written')),
  created_at timestamptz not null default now(),
  unique (identity, subject, term_key)
);
create index if not exists student_definitions_identity_idx on public.student_definitions (identity, subject, created_at desc);
alter table public.student_definitions enable row level security;

-- One row per (subject, term key): the written definition, or the refusal
-- ('not_in_syllabus' | 'not_a_term'), shared by every student so a term is written once.
create table if not exists public.definition_cache (
  subject text not null check (subject in ('physics', 'biology')),
  term_key text not null,
  term text not null,
  text text,
  formula text,
  source text check (source in ('notes', 'written')),
  refusal text check (refusal in ('not_in_syllabus', 'not_a_term')),
  created_at timestamptz not null default now(),
  primary key (subject, term_key),
  check ((text is null) <> (refusal is null))
);
alter table public.definition_cache enable row level security;
