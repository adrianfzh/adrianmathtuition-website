-- The progress note on the student card (5 Oct 2026, lib/progress-note.ts,
-- /api/admin/progress-notes, the Fly worker's /progress-note skill). One row per
-- note; history kept so improvement over time is visible. The facts are computed
-- (never the model's); the note is the model's words around them; `checks` holds
-- any number the prose used that the facts do not contain. Service-role only.
create table if not exists public.student_progress_notes (
  id uuid primary key default gen_random_uuid(),
  airtable_student_id text not null,
  student_name text,
  written_at timestamptz not null default now(),
  period_from date not null,
  period_to date not null,
  facts jsonb not null,
  facts_text text not null,
  note jsonb not null,                  -- { doing[], why[], next[], parent }
  checks jsonb not null default '{}'::jsonb,
  model text,
  source text not null default 'fly'    -- 'fly' | 'manual'
);
create index if not exists student_progress_notes_student_idx on public.student_progress_notes (airtable_student_id, written_at desc);
alter table public.student_progress_notes enable row level security;
comment on table public.student_progress_notes is 'Progress note per student (How they are doing / Why / Next steps for Adrian / parent draft), written by the plan-billed worker from computed facts; history kept.';
