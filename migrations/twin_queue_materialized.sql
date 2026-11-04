-- twin_queue: VIEW → MATERIALIZED VIEW, refreshed every 5 min by pg_cron (4 Nov 2026, docs/REVIEW-2026-11-04.md A2).
-- APPLIED to the maths project 4 Nov 2026 13:24 UTC (Supabase migration "twin_queue_materialized").
--
-- Why: the view (4-way UNION over 90 days of draws, DISTINCT ON over question_subgroups ⋈ subgroups ⋈ questions)
-- was recomputed on every read — 120,620 reads at 890 ms since 12 Oct (1,789 min) + math_twin_units 545 min,
-- about 1.7 h of database CPU a day. One twins-lane `queue` paged 51k rows in 1000-row pages = ~52 recomputes.
-- Now: the recipe stays as the plain view twin_queue_live; twin_queue (same name, same columns) is the saved
-- copy every reader keeps using unchanged (twin-store.ts, scripts/twins/twin.mjs, math_twin_units,
-- twin_readiness). A refresh takes ≈2.5 s and runs every 5 min → ≈12 min of CPU a day. Readers never block
-- (concurrently). Each refresh stamps job_runs 'twin-queue-refresh' (JOB_RHYTHMS 1 h → alarms by absence).
-- Staleness ≤5 min: a seed that just got its twin may be offered once more inside that window — one extra
-- twin on a sub-skill, never a wrong one (twins are counted per sub-skill, not per seed).

drop view if exists public.twin_readiness;

alter view public.twin_queue rename to twin_queue_live;
comment on view public.twin_queue_live is
  'The recipe behind twin_queue. Do not read this directly: it recomputes the whole union on every read (≈0.9 s). Read twin_queue, the materialized copy refreshed every 5 min (pg_cron twin-queue-refresh → refresh_twin_queue()).';

create materialized view public.twin_queue as select * from public.twin_queue_live with data;
create unique index twin_queue_source_id_uidx on public.twin_queue (source_id);
create index twin_queue_level_draws_idx on public.twin_queue (level, draws_90d desc, source_id);
comment on materialized view public.twin_queue is
  'Seeds for twins (one row per school question), a saved copy of twin_queue_live refreshed every 5 min by pg_cron job twin-queue-refresh (stamps job_runs twin-queue-refresh). 4 Nov 2026.';

revoke all on public.twin_queue from anon, authenticated;
grant select on public.twin_queue to service_role;
revoke all on public.twin_queue_live from anon, authenticated;
grant select on public.twin_queue_live to service_role;

-- twin_readiness depended on the old view by id; rebuilt on the saved copy (definition unchanged,
-- migrations/serving_policy.sql)
create view public.twin_readiness as
 WITH filed AS (
         SELECT DISTINCT s.level, s.topic, q.id, q.school, q.twin_of, q.verified, q.ai_generated, q."national"
           FROM question_subgroups qs
             JOIN subgroups s ON s.id = qs.subgroup_id
             JOIN questions q ON q.id = qs.question_id
          WHERE q.deleted_at IS NULL
        ), drawn AS (
         SELECT DISTINCT twin_queue.source_id
           FROM twin_queue
          WHERE twin_queue.draws_90d > 0
        )
 SELECT f.level,
    f.topic,
    count(*) FILTER (WHERE f.twin_of IS NOT NULL AND f.verified)::integer AS verified_twins,
    count(*) FILTER (WHERE f.twin_of IS NOT NULL AND NOT COALESCE(f.verified, false))::integer AS pending_twins,
    count(*) FILTER (WHERE (f.school <> ALL (ARRAY['AdrianMath'::text, 'AI Generated'::text, 'GCE'::text])) AND NOT COALESCE(f."national", false) AND f.ai_generated IS NOT TRUE)::integer AS school_rows,
    count(*) FILTER (WHERE d.source_id IS NOT NULL)::integer AS drawn_90d,
    COALESCE(sp.school_rows, true) AS school_rows_served,
    sp.flipped_at,
    sp.flipped_by
   FROM filed f
     LEFT JOIN drawn d ON d.source_id = f.id
     LEFT JOIN serving_policy sp ON sp.level = f.level AND sp.topic = f.topic
  GROUP BY f.level, f.topic, sp.school_rows, sp.flipped_at, sp.flipped_by;
revoke all on public.twin_readiness from anon, authenticated;
grant select on public.twin_readiness to service_role;

-- the refresh: concurrently (readers never block), stamps job_runs so a dead refresh alarms by absence
create or replace function public.refresh_twin_queue() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t0 timestamptz := clock_timestamp(); n int; ms int;
begin
  refresh materialized view concurrently public.twin_queue;
  select count(*) into n from public.twin_queue;
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  insert into public.job_runs (job, ran_at, ok, summary, meta)
    values ('twin-queue-refresh', now(), true, n || ' seeds, ' || ms || ' ms', jsonb_build_object('rows', n, 'ms', ms));
exception when others then
  insert into public.job_runs (job, ran_at, ok, summary) values ('twin-queue-refresh', now(), false, left(sqlerrm, 300));
  raise;
end $$;
revoke all on function public.refresh_twin_queue() from public, anon, authenticated;

select cron.schedule('twin-queue-refresh', '*/5 * * * *', 'select public.refresh_twin_queue()');

notify pgrst, 'reload schema';

-- To undo: select cron.unschedule('twin-queue-refresh'); drop materialized view public.twin_queue;
--          alter view public.twin_queue_live rename to twin_queue; recreate twin_readiness as above.
