-- The parts of one multi-part question from school, one run a part (17 Oct 2026, lib/humanities-parts.ts). Applied 17 Oct 2026.
alter table public.humanities_runs add column if not exists group_id uuid;
create index if not exists humanities_runs_group on public.humanities_runs(group_id) where group_id is not null;
comment on column public.humanities_runs.group_id is 'The parts of one multi-part question from school, marked one run a part (17 Oct 2026, lib/humanities-parts.ts).';
