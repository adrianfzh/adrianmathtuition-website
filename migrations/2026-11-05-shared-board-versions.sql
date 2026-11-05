-- 🧑‍🏫 The shared board's earlier versions (SPEC-TUTOR-TOOLS §8; Adrian, 5 Nov 2026: "Go back to an
-- earlier version … let's do this"). A snapshot of BOTH layers, kept every 10 minutes of writing,
-- before a big rub-out, and before every restore (so a restore can itself be undone).
create table if not exists public.shared_board_versions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.shared_boards(id) on delete cascade,
  tutor_ink jsonb not null default '{}'::jsonb,
  student_ink jsonb not null default '{}'::jsonb,
  tutor_strokes integer not null default 0,
  student_strokes integer not null default 0,
  reason text not null check (reason in ('every-10-min', 'big-erase', 'before-restore')),
  created_at timestamptz not null default now()
);
create index if not exists shared_board_versions_board_idx on public.shared_board_versions (board_id, created_at desc);
alter table public.shared_board_versions enable row level security;
revoke all on table public.shared_board_versions from anon, authenticated;
grant select, insert, update, delete on table public.shared_board_versions to service_role;
