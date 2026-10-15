-- Staff rulebook (15 Oct 2026, Adrian: "help me create an employees rulebook — rules of
-- engagement for employees … allow me to access in admin hub and allow me to add/change/edit").
-- One row per rule; /admin/rulebook reads and writes it through /api/admin/rulebook.
-- Admin-only through the service key (RLS on, no policies — anon/authed roles see nothing).
-- Applied to adrianmathtuition (nempslbewxtlikfzachi) on 15 Oct 2026.
create table if not exists public.staff_rules (
  id uuid primary key default gen_random_uuid(),
  section text not null default 'General',
  body text not null,
  important boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_rules_position_idx on public.staff_rules (position);
alter table public.staff_rules enable row level security;

-- His six rules, seeded once (only into an empty table).
insert into public.staff_rules (section, body, important, position)
select * from (values
  ('How we treat students', 'Always be encouraging.', false, 10),
  ('How we treat students', 'Be firm when it is needed.', false, 20),
  ('How we treat students', 'Always go the extra mile.', false, 30),
  ('Using the app', 'Keep an eye on each student''s progress in the app.', false, 40),
  ('Using the app', 'The app is a companion to lessons, not a replacement for them.', false, 50),
  ('After every lesson', 'Write down what was done after every lesson.', true, 60)
) as seed(section, body, important, position)
where not exists (select 1 from public.staff_rules);
