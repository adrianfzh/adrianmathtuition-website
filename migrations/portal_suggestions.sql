-- 💡 Suggestions (5 Oct 2026, Adrian: "a suggestion button … students can suggest
-- what they need for their exams, if reasonable and helpful - i will try to add it").
-- One row per suggestion sent from /app/suggestions. Service key only (RLS on, no
-- policies). A named row is in the student's data export and erased with the account
-- (lib/erasure.ts). An ANONYMOUS row carries no account, identity or name at all —
-- only the text, the date and anonymous=true (enforced by the check below).
-- Adrian sets the status on /admin/suggestions.
create table if not exists public.portal_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid,                         -- portal_accounts.id; null when anonymous
  airtable_student_id text,                -- the portal identity (rec… / acct:<uuid>); null when anonymous
  student_name text,                       -- null when anonymous
  anonymous boolean not null default false,
  text text not null check (char_length(text) between 1 and 500),
  status text not null default 'new' check (status in ('new', 'planned', 'done', 'no')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_suggestions_anonymous_has_no_identity
    check (not anonymous or (account_id is null and airtable_student_id is null and student_name is null))
);
create index if not exists portal_suggestions_student_idx on public.portal_suggestions (airtable_student_id, created_at desc);
create index if not exists portal_suggestions_status_idx on public.portal_suggestions (status, created_at desc);
create index if not exists portal_suggestions_created_idx on public.portal_suggestions (created_at desc);
alter table public.portal_suggestions enable row level security;
comment on table public.portal_suggestions is 'Suggestions students send from the app (what would help for their exams). Anonymous rows carry no identity. Service key only; named rows erased with the account.';
