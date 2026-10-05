-- 5 Oct 2026 — SCIENCE twins (SPEC-TWINS §11, Adrian: "yes > start with Challenge").
-- Runs on the SCIENCE project (adrianscience), not the maths one.
-- Our own Challenge MCQs, each modelled on a real Challenge (or Exam) row of the same
-- sub-skill: filed school='AdrianMath', exam_type='Twin', twin_of = the seed, and a
-- practice_difficulty row level='challenge' source='twin'. Additive only: two nullable
-- columns, an index, and the source check widened by one value.
alter table public.questions add column if not exists twin_of uuid references public.questions(id) on delete set null;
alter table public.questions add column if not exists gen_meta jsonb;
create index if not exists questions_twin_of_idx on public.questions (twin_of) where twin_of is not null;
create unique index if not exists questions_twin_item_uidx on public.questions ((gen_meta->>'twin_item')) where gen_meta ? 'twin_item';
alter table public.practice_difficulty drop constraint if exists practice_difficulty_source_check;
alter table public.practice_difficulty add constraint practice_difficulty_source_check
  check (source = any (array['results','estimate','estimate-sample','twin']));
