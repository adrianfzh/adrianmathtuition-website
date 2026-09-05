-- notebook_mistakes — the Notebook's fading mistakes list (SPEC-PORTAL-V2 §6,
-- rules Adrian set 6 Sep 2026). One row per student × mistake pattern.
--
--   title       the sheet diagnosis skill title when a self-study sheet named
--               it ("Solving a trigonometric equation in a double angle"), else
--               "<error kind label> in <topic>" from the lost part's error_kind
--               and the question's topic ("Sign in Trigonometry").
--   state       dark          — still happening (new evidence lands here)
--               light         — getting better (one clean result)
--               fixed         — two clean results (a clean paper counts as two)
--               student_fixed — the student tapped "Corrected"; becomes fixed
--                               after one clean result or 14 quiet days
--   came_back   set when new evidence pulls a light/fixed/student_fixed entry
--               back to dark; cleared when it reaches fixed again.
--   evidence    jsonb [{kind:'paper'|'attempt', ref, label, paper, date, clean}]
--   practice_ids portal_assignments ids of the Practice items that fix it
--               (the §7 hand-back writes them via addPracticeLinks).
--
-- Access class (lib/supabase-server.ts header): RLS enabled, NO policies —
-- every read/write goes through the service client with
-- airtable_student_id = the session's portal identity (lib/portal-auth
-- portalIdentity: 'rec…' for tuition, 'acct:<uuid>' for strangers) in the query.
create table if not exists public.notebook_mistakes (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  subject text,
  title text not null,
  error_kind text,
  topic text,
  state text not null check (state in ('dark','light','fixed','student_fixed')),
  seen_count int not null default 0,
  clean_count int not null default 0,
  came_back boolean not null default false,
  evidence jsonb not null default '[]'::jsonb,
  practice_ids uuid[] not null default '{}',
  last_seen_at timestamptz,
  last_clean_at timestamptz,
  student_fixed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (airtable_student_id, title)
);

create index if not exists notebook_mistakes_student_idx
  on public.notebook_mistakes (airtable_student_id);

alter table public.notebook_mistakes enable row level security;
-- No policies on purpose: the anon/authenticated keys read zero rows. The
-- service role carries the identity predicate in every query.
