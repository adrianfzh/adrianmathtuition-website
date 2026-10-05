-- The end-of-lesson voice note (5 Oct 2026, lib/lesson-voice.ts). Applied to the math project.
alter table public.lesson_packs add column if not exists voice_note jsonb;
alter table public.lesson_packs add column if not exists voice_at timestamptz;
alter table public.lesson_packs add column if not exists ack_message_id bigint;
create index if not exists lesson_packs_ack_idx on public.lesson_packs (ack_message_id);
comment on column public.lesson_packs.voice_note is 'End-of-lesson voice note (5 Oct 2026): lib/lesson-voice LessonNoteRead — topics, struggled, homework, next, attendance, mastery, other, transcript, source voice|text.';
comment on column public.lesson_packs.ack_message_id is 'The bot''s "Got it — …" confirmation; a reply to it corrects the note.';
