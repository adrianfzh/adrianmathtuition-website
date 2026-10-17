-- The model answer built from the student's own answer (17 Oct 2026, lib/humanities-model.ts). Applied 17 Oct 2026.
alter table public.humanities_runs add column if not exists model_answer jsonb;
comment on column public.humanities_runs.model_answer is 'The model answer built from the student''s own answer (17 Oct 2026, lib/humanities-model.ts): {state: writing|checking|ready|dropped, segments: [{text, added}], check_level, ...}. Shown only when ready (re-marked at full marks).';
