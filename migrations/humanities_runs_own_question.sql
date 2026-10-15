-- A question the student brought from school (15 Oct 2026, Adrian: "allow student to take a photo and upload
-- the question, or just type it, then their responses > then grade it"). Applied 15 Oct 2026.
alter table public.humanities_runs add column if not exists own_question jsonb;
comment on column public.humanities_runs.own_question is 'A question the student brought from school (15 Oct 2026): {subject, skill, question, sources, marks}. question_id is own-<uuid> when set.';
