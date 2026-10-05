-- Cloud twins (5 Oct 2026, math project nempslbewxtlikfzachi; applied via MCP the same day).
-- The shortlist the cloud-twin originality gate reads (src/lib/twin-store.ts): character-
-- trigram similarity (pg_trgm) over a question's stem + parts text, top p_limit rows of the
-- given levels; the website then scores the shortlist with the twin scripts' exact
-- word-trigram Jaccard (src/lib/twin-gates.ts). Real rows AND twins are returned — a twin
-- must be original against other twins too. ~3 s on the largest level (JC2, 9k rows).
create or replace function public.twin_neighbours(p_levels text[], p_text text, p_limit int default 60)
returns table (id uuid, level text, school text, year int, question_text text, parts jsonb, twin_of uuid, ai_generated boolean, sim real)
language sql stable
set search_path = public
as $$
  select q.id, q.level, q.school, q.year, q.question_text, q.parts, q.twin_of, q.ai_generated,
         similarity(lower(coalesce(q.question_text,'') || ' ' || coalesce(regexp_replace(q.parts::text, '"(label|marks|text|answer|subparts)":', ' ', 'g'), '')), lower(p_text)) as sim
  from questions q
  where q.level = any(p_levels) and q.deleted_at is null
  order by sim desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
revoke all on function public.twin_neighbours(text[], text, int) from public, anon, authenticated;
grant execute on function public.twin_neighbours(text[], text, int) to service_role;
