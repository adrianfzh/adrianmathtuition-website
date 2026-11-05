-- 🧑‍🏫 The student's summary of a shared board (SPEC-TUTOR-TOOLS §8; Adrian, 6 Nov 2026: "i want the summary
-- functionality to be for the student, not for the tutor" → "yes"). lib/board-summary BoardSummary; null = none yet.
alter table public.shared_boards add column if not exists summary jsonb;
