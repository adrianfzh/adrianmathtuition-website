-- 💡 Suggest something (5 Oct 2026, Adrian: "a suggestion button … students can
-- suggest what they need for their exams, if reasonable and helpful - i will try to
-- add it"). One row per suggestion a student sends from the app (Home / Settings).
-- Service key only (RLS on, no policies). In the student's data export and erased
-- with the account (lib/erasure.ts). Adrian sets the status on /admin/suggestions.
create table if not exists public.portal_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,                         -- portal_accounts.id
  airtable_student_id text not null,       -- the portal identity (rec… / acct:<uuid>)
  student_name text,
  subject text,                            -- one of the student's subjects, or null
  text text not null check (char_length(text) between 1 and 500),
  status text not null default 'new' check (status in ('new', 'planned', 'done', 'no')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_suggestions_student_idx on public.portal_suggestions (airtable_student_id, created_at desc);
create index if not exists portal_suggestions_status_idx on public.portal_suggestions (status, created_at desc);
alter table public.portal_suggestions enable row level security;
comment on table public.portal_suggestions is 'Suggestions students send from the app (what would help for their exams). Service key only; erased with the account.';
