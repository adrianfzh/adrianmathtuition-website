-- 🧑‍🏫 Tutor portal prototype (Adrian, 5 Nov 2026: "yes shall we build it first? but gatekeep first").
-- MATHS project nempslbewxtlikfzachi. SPEC-TUTOR-TOOLS.md §7.
--
-- Other tutors hand in their own students' papers for marking. Invite-only: a row in
-- tutor_accounts exists only because Adrian made it on /admin/tutors.
--
-- Who reads these tables: ONLY the website's server code with the service key
-- (lib/tutor-auth.ts, lib/tutor-store.ts). Tutors are not Supabase Auth users — their
-- session is our own signed cookie — so there is no auth.uid() a policy could test.
-- RLS is ON with NO policies and anon/authenticated hold no grants: the browser can read
-- nothing. Every server query filters by the tutor id taken from the signed session,
-- never from the request body.
--
-- Names stay here. The marking run (paper_marking_runs) carries student_id
-- 'tutor:<tutor_students.id>' and a student_name with no student name in it, so the
-- marked data Adrian keeps is anonymous once this table is left out.

create table if not exists public.tutor_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text,                       -- scrypt, null until the invite is accepted
  invite_token_hash text,                   -- sha256 of the one-time invite token
  invite_expires_at timestamptz,
  monthly_paper_cap integer not null default 20 check (monthly_paper_cap >= 0),
  active boolean not null default true,
  note text,                                -- Adrian's own note (who they are)
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.tutor_students (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_accounts(id) on delete cascade,
  name text not null,
  level text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists tutor_students_tutor_idx on public.tutor_students (tutor_id);

-- One row per paper handed in. Never deleted: the rows ARE the monthly meter for billing.
create table if not exists public.tutor_papers (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_accounts(id) on delete cascade,
  tutor_student_id uuid not null references public.tutor_students(id) on delete cascade,
  run_id uuid unique,                       -- paper_marking_runs.id
  paper_name text not null,
  paper_subject text,
  pages integer not null default 0,
  month text not null,                      -- 'YYYY-MM' in Singapore time, the billing month
  status text not null default 'waiting' check (status in ('waiting', 'queued', 'failed')),
  queued_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tutor_papers_tutor_month_idx on public.tutor_papers (tutor_id, month);
create index if not exists tutor_papers_waiting_idx on public.tutor_papers (status, created_at);

alter table public.tutor_accounts enable row level security;
alter table public.tutor_students enable row level security;
alter table public.tutor_papers enable row level security;
revoke all on table public.tutor_accounts, public.tutor_students, public.tutor_papers from anon, authenticated;
grant select, insert, update, delete on table public.tutor_accounts, public.tutor_students, public.tutor_papers to service_role;
