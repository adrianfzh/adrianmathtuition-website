-- 🧩 Weekly stretch set (SPEC-STRETCH-SET.md, Adrian 4 Nov 2026: "Yes, build it").
-- One row per student per SGT week (Monday). The set is built once (the student's
-- first visit that week, or Adrian's admin preview) and then kept, so the student
-- gets exactly what Adrian previewed.
--   items      — the 4–5 slots: [{ slot, source, questionId|unitId, topic, why, estimate?, remind? }]
--   gaps       — slots filled from a next-best source, or left empty: [{ slot, note }]
--   responses  — the student's own inputs, by slot: { remind, prediction, predictionClose, spotPicked, spotRight }
-- Tried / right-first-time are NOT stored here: they are read from student_attempts
-- (the same rows the nightly difficulty job reads), so a stretch attempt feeds the
-- difficulty adjustment with no extra write.
create table if not exists public.stretch_sets (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  week_start date not null,
  level text not null,
  items jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  built_by text not null default 'student',
  built_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (airtable_student_id, week_start)
);
create index if not exists stretch_sets_week_idx on public.stretch_sets (week_start);

alter table public.stretch_sets enable row level security;
grant select, insert, update, delete on table public.stretch_sets to service_role;
