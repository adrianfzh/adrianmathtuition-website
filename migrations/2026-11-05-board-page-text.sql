-- 🧑‍🏫 Search your handwriting on the shared board (SPEC-TUTOR-TOOLS §8 — Adrian, 5 Nov 2026: "yes build
-- search your handwriting"). page_text = what is written on each page, read from a picture of the page:
-- { "<page>": { "text": "...", "sig": "<what the page held when read>", "at": "<iso>" } }.
-- read_usage = what the reading cost on this board: { calls, inTok, outTok, usd }.
alter table public.shared_boards add column if not exists page_text jsonb not null default '{}'::jsonb;
alter table public.shared_boards add column if not exists read_usage jsonb not null default '{}'::jsonb;
