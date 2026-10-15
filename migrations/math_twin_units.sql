-- 6 Oct 2026 — the maths twins gap as ONE function (the science bank's science_twin_units, for maths).
-- Runs on the MATHS project. Read by scripts/twins/twin.mjs (queue / need — the Fly twins lane),
-- the cloud door (/api/agent/twins/queue?bank=maths, lib/twin-store.ts) and the dashboard's twins
-- tile (lib/glance-store.ts), so the three can never disagree again.
--
-- Why (6 Oct 2026): the door said "still to write" Sec 1 206 / Sec 2 937 / A Math 229 / E Math 439
-- while twin.mjs said 4 / 560 / 6 / 23. Three copies of the count had drifted:
--   * the door counted to 5 a sub-skill (the FUTURE stage), the lane's first stage is 3;
--   * twin.mjs paged twin_queue with no ORDER BY, so pages overlapped / skipped rows and some
--     twins were never counted (its numbers moved from run to run);
--   * every copy counted any row with twin_of — incl. Practice-photo questions ('AI Generated',
--     exam_type 'Practice'), which are not twins;
--   * "to write" added a sub-skill's whole shortfall even when it had fewer seeds left than that.
--
-- One row per sub-skill met by a school seed at p_levels (a level FAMILY — AM+S3_AM, EM+S3_EM):
--   twins       live verified twins (school 'AdrianMath', exam_type 'Twin'), counted through the
--               primary filing of the seed each was written from (twin_queue.subgroup_id)
--   need        p_per_skill − twins (≥ 0)
--   free_seeds  twins the queue may still offer: no live twin, text_len > 40 (twin_queue's rules);
--               15 Oct 2026 (Adrian: "Let one school question seed up to 3 twins, but only for skills
--               that are short … do it"; "Some very small skills may not need 5 at all. Those can stay at
--               2 or 3" → "agreed"): a sub-skill with fewer eligible seeds than p_per_skill counts up to
--               3 twins a seed (3 − its live twins); every other sub-skill keeps one a seed. Same rule as
--               twin.mjs queue (SEED_CAP).
--   writable    least(need, free_seeds) — what "still to write" means
--   draws_90d   the sub-skill's seeds drawn by students in 90 days (the queue's order)
create or replace function public.math_twin_units(p_levels text[], p_per_skill int default 3)
returns table(subgroup_id bigint, subgroup text, topic text, twins int, need int, free_seeds int, writable int, draws_90d int)
language sql stable security invoker as $$
with seeds as (
  select tq.source_id, tq.subgroup_id, tq.subgroup, tq.topic, tq.has_any_twin, tq.text_len, tq.draws_90d
  from twin_queue tq where tq.level = any (p_levels) and tq.subgroup_id is not null),
per_seed as (
  select t.twin_of source_id, count(*)::int n
  from questions t
  where t.level = any (p_levels) and t.deleted_at is null and t.verified
    and t.school = 'AdrianMath' and t.exam_type = 'Twin' and t.twin_of is not null
  group by t.twin_of),
tw as (
  select s.subgroup_id, sum(ps.n)::int n
  from seeds s join per_seed ps on ps.source_id = s.source_id
  group by s.subgroup_id),
u as (
  select s.subgroup_id, min(s.subgroup) subgroup, min(s.topic) topic,
         count(*) filter (where s.text_len > 40)::int eligible,
         count(*) filter (where not s.has_any_twin and s.text_len > 40)::int fresh,
         sum(case when s.text_len > 40 then case when coalesce(ps.n, 0) = 0 and not s.has_any_twin then 3
                                                 when coalesce(ps.n, 0) between 1 and 2 then 3 - ps.n
                                                 else 0 end else 0 end)::int slots3,
         sum(s.draws_90d)::int draws_90d
  from seeds s left join per_seed ps on ps.source_id = s.source_id
  group by s.subgroup_id),
v as (
  select u.*, case when u.eligible < p_per_skill then u.slots3 else u.fresh end free_seeds from u)
select v.subgroup_id, v.subgroup, v.topic, coalesce(tw.n, 0), greatest(0, p_per_skill - coalesce(tw.n, 0)),
       v.free_seeds, least(greatest(0, p_per_skill - coalesce(tw.n, 0)), v.free_seeds), v.draws_90d
from v left join tw on tw.subgroup_id = v.subgroup_id
order by v.subgroup_id;
$$;
revoke execute on function public.math_twin_units(text[], int) from public, anon, authenticated;
grant execute on function public.math_twin_units(text[], int) to service_role;
