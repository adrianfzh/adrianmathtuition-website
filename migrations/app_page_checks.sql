-- ✅ Check this page (SPEC-STUDENT-APP.md §0c, 31 Oct 2026, Adrian: "Yes, build it"):
-- one row per page a student sends from the Notebook iPad app. Kept apart from
-- student_attempts on purpose: a free notebook page has no bank question, so it must not
-- feed the weakness tags, the Notebook mistakes or the practice digest. The daily cap is
-- counted here.
create table if not exists public.app_page_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_accounts(id) on delete cascade,
  identity text not null,
  created_at timestamptz not null default now(),
  verdict text not null check (verdict in ('correct', 'partial', 'wrong', 'unreadable')),
  model text not null,
  line_count int not null default 0,
  result jsonb not null
);
create index if not exists app_page_checks_user_day on public.app_page_checks (user_id, created_at desc);
alter table public.app_page_checks enable row level security;
grant select, insert, update, delete on table public.app_page_checks to service_role;
