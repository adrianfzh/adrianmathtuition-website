-- 👪 Weekly parent report (SPEC-PARENT-REPORT.md, Adrian 4 Nov 2026: "yes build it FOR THE APP").
-- Maths project. Server-only tables (RLS on, no browser policy): every read and
-- write goes through our API routes with the service role.
--
--   parent_contacts — one row per parent (by email). A parent with three children
--                     is one row and three links.
--   parent_links    — one row per (parent, child). Starts 'pending' with an invite
--                     code the child shares; the parent confirms (consent) → 'active';
--                     either side ends it → 'ended' (kept, never deleted, so the
--                     history of who saw what stays answerable).
--   parent_reports  — one row per link per SGT week: the small facts the report
--                     shows (numbers computed in code, never by a model) and the
--                     10-minute set's question ids. No student name is stored.
--   consent_records — APPEND-ONLY consent history (SPEC-COMPANY.md §14.5 step 4):
--                     one row per consent event; a withdrawal is a new row.

create table if not exists public.parent_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,             -- lower-cased
  created_at timestamptz not null default now()
);

create table if not exists public.parent_links (
  id uuid primary key default gen_random_uuid(),
  student_identity text not null,         -- portalIdentity(): rec… or acct:<uuid>
  parent_id uuid references public.parent_contacts(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  invite_code text unique,                -- 8 letters, cleared once used or cancelled
  invite_expires_at timestamptz,
  linked_at timestamptz,
  ended_at timestamptz,
  ended_by text check (ended_by in ('parent', 'student', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists parent_links_student_idx on public.parent_links (student_identity);
create index if not exists parent_links_parent_idx on public.parent_links (parent_id);

create table if not exists public.parent_reports (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.parent_links(id),
  week_start date not null,
  facts jsonb not null,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (link_id, week_start)
);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  org_id text not null default 'adrianmath',
  subject_identity text not null,         -- the child the consent is about
  given_by text not null check (given_by in ('student', 'parent')),
  parent_contact_id uuid references public.parent_contacts(id),
  purpose text not null,                  -- e.g. 'parent_weekly_report'
  action text not null check (action in ('given', 'withdrawn')),
  notice_version text not null,
  notice_hash text not null,              -- sha256 of the words the person saw
  channel text not null default 'web',    -- web | ios | android
  created_at timestamptz not null default now()
);
create index if not exists consent_records_subject_idx on public.consent_records (subject_identity);

-- Append-only: no update, no delete, even for the service role.
create or replace function public.consent_records_append_only() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'consent_records is append-only';
end $$;
drop trigger if exists consent_records_no_change on public.consent_records;
create trigger consent_records_no_change before update or delete on public.consent_records
  for each row execute function public.consent_records_append_only();

alter table public.parent_contacts enable row level security;
alter table public.parent_links enable row level security;
alter table public.parent_reports enable row level security;
alter table public.consent_records enable row level security;
grant select, insert, update, delete on table public.parent_contacts to service_role;
grant select, insert, update, delete on table public.parent_links to service_role;
grant select, insert, update, delete on table public.parent_reports to service_role;
grant select, insert on table public.consent_records to service_role;
