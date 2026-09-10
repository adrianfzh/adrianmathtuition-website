-- notebook_private_notes — the student's own typed notes in My Notebook
-- (SPEC-NOTEBOOK-V2 §8, Adrian 11 Sep 2026: "Notes is good … enforce highest
-- privacy"). One row per note; the body is the student's words, nothing else.
--
-- The privacy rules the table exists to keep:
--   • visible only to that student — no admin page reads it, no export to
--     Adrian, never in a parent digest;
--   • not read by any AI feature (no OCR, no auto-tag, no resurfacing);
--   • in the student's own data export and deleted with the account.
--
-- Access class (lib/supabase-server.ts header): RLS enabled, NO policies —
-- every read/write goes through the service client with
-- airtable_student_id = the session's portal identity (lib/portal-auth
-- portalIdentity: 'rec…' for tuition, 'acct:<uuid>' for strangers) in the query.
create table if not exists public.notebook_private_notes (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notebook_private_notes_student_idx
  on public.notebook_private_notes (airtable_student_id, created_at desc);

alter table public.notebook_private_notes enable row level security;
-- No policies on purpose: the anon/authenticated keys read zero rows. The
-- service role carries the identity predicate in every query.
