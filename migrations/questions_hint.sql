-- 💡 "How to approach it" (23 Sep 2026): a per-question, answer-free hint of
-- three short lines in student words. Written once (by the practice-photo
-- worker at generation, or by /api/portal/practice/hint on the first tap) and
-- cached here. NULL = not written yet; '' = tried and nothing to say.
-- Applied to the math project 23 Sep 2026 (migration questions_hint_column).
alter table public.questions add column if not exists hint text;
