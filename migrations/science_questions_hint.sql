-- SCIENCE project (eaxnstsecxmqdobfvmjh): the 💡 Hints cache for science questions
-- (Adrian, 15 Oct 2026). Same contract as the maths bank's questions.hint — written once
-- by /api/portal/practice/hint on the first tap, '' when there is nothing to say.
alter table public.questions add column if not exists hint text;
