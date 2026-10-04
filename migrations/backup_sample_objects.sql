-- Applied 5 Oct 2026. 🗄 Monthly backup check: a truly random handful of stored files
-- per bucket, so the check downloads and opens them. Service role only.
create or replace function public.backup_sample_objects(p_bucket text, p_n int default 5, p_max_bytes bigint default 30000000)
returns table(name text, size bigint, mimetype text)
language sql
security definer
set search_path = storage, public
as $$
  select o.name, (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
  from storage.objects o
  where o.bucket_id = p_bucket
    and coalesce((o.metadata->>'size')::bigint, 0) between 1 and p_max_bytes
    and o.name not like '%/.emptyFolderPlaceholder'
  order by random()
  limit least(greatest(p_n, 1), 20);
$$;
revoke all on function public.backup_sample_objects(text, int, bigint) from public, anon, authenticated;
grant execute on function public.backup_sample_objects(text, int, bigint) to service_role;
