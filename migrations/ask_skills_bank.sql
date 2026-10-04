-- Applied 5 Oct 2026 (migration ask_skills_bank_column). Science asks are filed
-- too (bot lib/ask-science-topic.js): subgroup_id then points into the SCIENCE
-- project's subgroups tree, so every row says which bank it is from.
alter table public.ask_skills add column if not exists bank text not null default 'math';
alter table public.ask_skills drop constraint if exists ask_skills_bank_check;
alter table public.ask_skills add constraint ask_skills_bank_check check (bank in ('math','science'));
