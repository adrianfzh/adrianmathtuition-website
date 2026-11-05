-- 🧑‍🏫 The shared board (SPEC-TUTOR-TOOLS §8, Adrian 5 Nov 2026: "yes, build it").
-- One board per tutor + student pair (many boards each). The pages are the background
-- (a marked paper's pages, photos; null = a blank page); each side writes its own ink
-- layer, so two people never overwrite each other. link_key opens the board for the
-- student (no login — tutor students have none); link_on switches it off.
create table if not exists public.shared_boards (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_accounts(id) on delete cascade,
  tutor_student_id uuid not null references public.tutor_students(id) on delete cascade,
  title text not null,
  source_paper_id uuid references public.tutor_papers(id) on delete set null,
  pages jsonb not null default '[]'::jsonb,
  tutor_ink jsonb not null default '{}'::jsonb,
  student_ink jsonb not null default '{}'::jsonb,
  tutor_ink_at timestamptz,
  student_ink_at timestamptz,
  link_key text not null unique,
  link_on boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_boards_student_idx on public.shared_boards (tutor_id, tutor_student_id, updated_at desc);
alter table public.shared_boards enable row level security;
revoke all on table public.shared_boards from anon, authenticated;
grant select, insert, update, delete on table public.shared_boards to service_role;
