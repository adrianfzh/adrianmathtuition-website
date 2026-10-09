-- part_label_prints — what a PRINTED sheet called each part (SPEC-PART-SYLLABUS.md §Re-lettering).
-- NOT APPLIED (9 Oct 2026). Apply BEFORE the first part is marked on the live bank.
--
-- A student's page re-letters the parts left after a part is hidden: the bank's (b)(iii)
-- prints as "(b)(ii)". A sheet is handed in days later and must be marked against the
-- letters it was printed with, whatever has been marked or cleared in the bank since.
-- Every surface that prints a re-lettered question writes one row here first
-- (src/lib/part-label-prints-store.ts); a question whose row cannot be written is left
-- off the sheet. Questions whose letters are the bank's own write nothing.
create table if not exists public.part_label_prints (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  surface     text not null,          -- 'print-paper' | 'kiosk' | 'bot-worksheet' | 'worksheet-picker' | 'prelim-builder' | 'student-materials'
  ref         text,                   -- the sheet's own id on that surface, when it has one
  student     text,                   -- Airtable student id / portal identity, when known
  question_id uuid not null,
  labels      jsonb not null,         -- { "<shown key>": "<bank key>" }, e.g. { "b.ii": "b.iii" }; "" = no letter
  fingerprint text not null           -- viewFingerprint of the bank row at print time
);
create index if not exists part_label_prints_question on public.part_label_prints (question_id, created_at desc);
create index if not exists part_label_prints_sheet on public.part_label_prints (surface, ref);
alter table public.part_label_prints enable row level security;   -- no policies: the service role only
comment on table public.part_label_prints is 'Append-only: the letters a printed sheet showed for a question with a hidden part. Read by the marker of a sheet WE printed.';
