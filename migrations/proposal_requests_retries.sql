-- Applied 5 Oct 2026 (bot scripts/proposal-ship.js self-fix): a ship whose gate ran out of time,
-- or a run killed by a worker restart, goes back to 'pending' with retries+1 (at most 2), then is reported.
alter table public.proposal_requests add column if not exists retries integer not null default 0;
comment on column public.proposal_requests.retries is 'Automatic re-runs after a gate that ran out of time or a run killed by a worker restart (bot scripts/proposal-ship.js, at most 2). 5 Oct 2026.';
