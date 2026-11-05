-- 🧑‍🏫 The shared board, more (SPEC-TUTOR-TOOLS §8 — Adrian, 5 Nov 2026: "do … the tutor's own saved board"
-- and "place a photo onto a page … which you can move and resize - like how notability does it").
-- Photo stickers: one list per board, [{ id, page, url, x, y, w, h }] in that page's image pixels;
-- either side may add, move, resize or remove one.
alter table public.shared_boards add column if not exists stickers jsonb not null default '[]'::jsonb;
-- A tutor's own saved board: its pages, the TUTOR's writing and the stickers — never the student's writing.
create table if not exists public.board_templates (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_accounts(id) on delete cascade,
  title text not null,
  pages jsonb not null default '[]'::jsonb,
  ink jsonb not null default '{}'::jsonb,
  stickers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists board_templates_tutor_idx on public.board_templates (tutor_id, created_at desc);
alter table public.board_templates enable row level security;
revoke all on table public.board_templates from anon, authenticated;
grant select, insert, update, delete on table public.board_templates to service_role;
