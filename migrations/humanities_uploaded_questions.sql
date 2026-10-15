-- School questions students sent through "Check my answer", banked for marking only (15 Oct 2026, Adrian: "yes" to
-- "should we extract the questions uploaded for our own bank?"). lib/humanities-upload-bank.ts. Applied 15 Oct 2026.
create table if not exists public.humanities_uploaded_questions (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  subject text not null,
  skill text not null,
  question text not null,
  material text not null default '',
  marks integer,
  points jsonb,          -- Geography short questions: the creditable points first written for it, reused for every later upload
  command text,
  develop boolean,
  rules jsonb,
  times_seen integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
comment on table public.humanities_uploaded_questions is 'School questions students sent through "Check my answer" (15 Oct 2026), copied nightly with NO student details. Grounding only — never served to students (docs/CONTENT-POLICY.md).';
alter table public.humanities_uploaded_questions enable row level security;
alter table public.humanities_runs add column if not exists banked_at timestamptz;
