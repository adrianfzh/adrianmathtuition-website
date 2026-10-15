-- Question clips for PHOTO questions (SPEC-CLIP-PIPELINE.md §9b, 15 Oct 2026): a question a
-- student handed in on a paper the marking did not match to the bank has no `questions` row.
-- Its clip lives in the same table:
--   question_id  = lib/question-clip photoClipId(run_id, question number) — a stable uuid, so the
--                  marked page finds its own door; no longer a foreign key to questions (a bank
--                  clip's id is still its bank row's id, source = 'bank')
--   source       = 'bank' | 'photo'
--   origin       = {run_id, question_number} for a photo question
--   question_text= the question as read off the photo (the reading the clip was made from)
--   text_hash    = questionTextHash(question_text): the next student's photo of the same question
--                  is found by this and the clip copied (same_as = the row it was copied from)
alter table public.question_clips drop constraint if exists question_clips_question_id_fkey;
alter table public.question_clips add column if not exists source text not null default 'bank' check (source in ('bank','photo'));
alter table public.question_clips add column if not exists origin jsonb;
alter table public.question_clips add column if not exists question_text text;
alter table public.question_clips add column if not exists text_hash text;
alter table public.question_clips add column if not exists same_as uuid;
create index if not exists question_clips_text_hash on public.question_clips (text_hash) where text_hash is not null;
