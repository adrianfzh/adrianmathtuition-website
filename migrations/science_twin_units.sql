-- 5 Oct 2026 — science twins by SUB-SKILL (Adrian: "we need twins questions of all subskills like
-- math — if we are to sell subscriptions on the app"). Runs on the SCIENCE project.
-- ONE source of truth for the gap and its order, read by the Fly lane (scripts/science-twins/
-- sci-twin.mjs) and the cloud door (/api/agent/twins/queue?bank=science, lib/twin-store.ts).
--
-- A unit = (pool, sub-skill): pure PHY/CHEM/BIO × every subgroup of that science; Combined
-- CS_PHY/CS_CHEM/CS_BIO × the subgroups whose topic the Combined bank has (the Combined rows are
-- not filed, so a Combined twin is modelled on a filed PURE seed and written at Combined scope).
--   twins  live verified twins filed under the sub-skill at the pool's levels
--   need   per_skill − twins (≥ 0)
--   seeds  up to 5 usable MCQ seeds (real school rows, servable shape, no live twin in this pool),
--          checked rows first, text-only first, rows with a level first
--   rank   open practice topics first (open_topics = {"PHY":[…],"CS_PHY":[…],…}), then the rest;
--          inside: fewest twins first, the six pools taking turns (pure before Combined), then topic / sub-skill
create or replace function public.science_twin_units(open_topics jsonb default '{}'::jsonb, per_skill int default 3)
returns table(pool text, sci_key text, combined boolean, subject text, bank_level text, topic text, subgroup_id bigint, subgroup text,
              is_open boolean, twins int, need int, seed_count int, seeds uuid[], rnk bigint)
language sql stable as $$
with pools(pool, sci_key, subject, combined, lvl, pure_lvl) as (values
  ('PHY','PHY','physics',false,'PHYS','PHYS'), ('CHEM','CHEM','chemistry',false,'CHEM','CHEM'), ('BIO','BIO','biology',false,'BIO','BIO'),
  ('CS_PHY','PHY','physics',true,'CS_PHYS','PHYS'), ('CS_CHEM','CHEM','chemistry',true,'CS_CHEM','CHEM'), ('CS_BIO','BIO','biology',true,'CS_BIO','BIO')),
cs_topics as (
  select p.pool, t.topic from pools p
  cross join lateral (select distinct unnest(q.topics) topic from questions q where p.combined and q.level in (p.lvl, p.lvl || '_NA')) t),
units as (
  select p.*, s.id sgid, s.name sgname, s.topic sgtopic from pools p join subgroups s on s.subject = p.subject
  where not p.combined or exists (select 1 from cs_topics c where c.pool = p.pool and c.topic = s.topic)),
seeds as (
  select qs.subgroup_id, q.id, q.level, q.practice_checked_at is not null checked, coalesce(q.has_image,false) img,
         exists (select 1 from practice_difficulty d where d.question_id = q.id and d.source in ('results','estimate')) has_lvl
  from questions q join question_subgroups qs on qs.question_id = q.id
  where q.school <> 'AdrianMath' and q.school not ilike 'gce' and coalesce(q.quarantined,false) = false
    and coalesce(q.not_in_syllabus,false) = false and q.practice_hidden = false and length(coalesce(q.question_text,'')) > 40
    and (coalesce(q.has_image,false) = false or q.image_watermark_status = 'clean')
    and q.answer ~ '^\s*([A-Da-d]\s*$|[*][*][(]?[A-D][)]?[*][*])'),
counted as (
  select u.*,
    (select count(distinct t.id)::int from questions t join question_subgroups tq on tq.question_id = t.id
      where tq.subgroup_id = u.sgid and t.school = 'AdrianMath' and t.exam_type = 'Twin' and t.verified and not t.practice_hidden
        and t.level = any (case when u.combined then array[u.lvl, u.lvl || '_NA'] else array[u.lvl] end)) tw,
    (select array_agg(x.id) from (select s.id from seeds s where s.subgroup_id = u.sgid and s.level = u.pure_lvl
        and not exists (select 1 from questions t where t.twin_of = s.id and not t.practice_hidden and t.level = any (case when u.combined then array[u.lvl, u.lvl || '_NA'] else array[u.lvl] end))
        order by s.checked desc, s.img asc, s.has_lvl desc, s.id limit 5) x) sd,
    (select count(*)::int from seeds s where s.subgroup_id = u.sgid and s.level = u.pure_lvl) sc,
    coalesce(open_topics -> u.pool, '[]'::jsonb) ? u.sgtopic op
  from units u),
by_topic as (  -- inside a pool the topics take turns too
  select c.*, row_number() over (partition by c.pool, c.op, c.tw, c.sgtopic order by c.sgname) kt from counted c),
spread as (   -- the six pools take turns: the k-th sub-skill of each pool before the (k+1)-th of any
  select b.*, row_number() over (partition by b.pool, b.op, b.tw order by b.kt, b.sgtopic) k from by_topic b)
select pool, sci_key, combined, subject, lvl, sgtopic, sgid, sgname, op, tw, greatest(0, per_skill - tw), sc, coalesce(sd, '{}'),
  row_number() over (order by op desc, tw asc, k, combined asc, subject, sgtopic, sgname)
from spread order by 14;
$$;
