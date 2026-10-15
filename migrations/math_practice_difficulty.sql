-- 🎚 Maths practice levels corrected by students' first tries (SPEC-TWINS.md §12, 15 Oct 2026,
-- Adrian: "let the data from the students sort out the difficulty levels" → "build this").
--
-- questions.difficulty stays the ONE level every surface reads (practice_next, the picker's
-- counts, kiosk_pool, the twin store). This table remembers where that level came from:
--   starting_level — the level before results first changed it (Adrian's tap, or the
--                    extraction guess for a school question). Never overwritten once set.
--   source         — 'start' (questions.difficulty is still the starting level) or 'results'
--                    (the nightly job /api/cron/math-practice-difficulty wrote it).
--   pinned         — Adrian changed the level by hand AFTER results did: his new tap wins and
--                    results stop touching that question.
-- Results move Standard (Core) ↔ Advanced only; a Challenging question is never touched.
create table if not exists public.math_practice_difficulty (
  question_id     uuid primary key references public.questions(id) on delete cascade,
  starting_level  text,
  level           text not null,
  source          text not null default 'start' check (source in ('start', 'results')),
  pinned          boolean not null default false,
  attempts        integer not null default 0,
  wrong           integer not null default 0,
  wrong_share     numeric,
  reason          text,
  updated_at      timestamptz not null default now(),
  changed_at      timestamptz
);

-- One row per level change results made — read by the weekly line to Adrian (Mondays).
create table if not exists public.math_practice_difficulty_changes (
  id           bigserial primary key,
  question_id  uuid not null references public.questions(id) on delete cascade,
  from_level   text not null,
  to_level     text not null,
  starting_level text,
  attempts     integer not null,
  wrong        integer not null,
  wrong_share  numeric,
  changed_at   timestamptz not null default now(),
  reported_at  timestamptz
);
create index if not exists math_practice_difficulty_changes_unreported
  on public.math_practice_difficulty_changes (changed_at) where reported_at is null;

alter table public.math_practice_difficulty enable row level security;
alter table public.math_practice_difficulty_changes enable row level security;
