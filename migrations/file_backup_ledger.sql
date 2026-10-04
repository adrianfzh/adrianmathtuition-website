-- 🗄 File backup (5 Oct 2026, Adrian: "backup the files"). Applied to BOTH projects
-- (main nempslbewxtlikfzachi + science eaxnstsecxmqdobfvmjh): each project keeps a
-- ledger of the files IT has copied to the other project's private `backups` bucket,
-- so "what still needs copying" is one SQL query next to storage.objects.
-- Service role only. Code: src/lib/file-backup*.ts, /api/cron/file-backup.
create table if not exists public.file_backup_ledger (
  bucket text not null,
  name text not null,
  size bigint,
  etag text,
  src_updated_at timestamptz,
  copied_at timestamptz not null default now(),
  source_gone_at timestamptz,
  primary key (bucket, name)
);
alter table public.file_backup_ledger enable row level security;
revoke all on public.file_backup_ledger from anon, authenticated;

-- Files new or changed since their last copy (changed = a different eTag or size).
create or replace function public.file_backup_pending(p_bucket text, p_limit int default 200)
returns table(name text, size bigint, etag text, updated_at timestamptz, mimetype text)
language sql security definer set search_path = storage, public as $$
  select o.name, (o.metadata->>'size')::bigint, o.metadata->>'eTag', o.updated_at, o.metadata->>'mimetype'
  from storage.objects o
  left join public.file_backup_ledger l on l.bucket = o.bucket_id and l.name = o.name
  where o.bucket_id = p_bucket
    and o.name not like '%.emptyFolderPlaceholder'
    and (l.name is null or l.etag is distinct from o.metadata->>'eTag' or l.size is distinct from (o.metadata->>'size')::bigint)
  order by o.created_at
  limit least(greatest(p_limit, 1), 1000);
$$;

-- Per bucket: how many files, how many copied, how many still waiting (and how
-- many have waited over two days — the stall alarm).
create or replace function public.file_backup_status()
returns table(bucket text, files bigint, bytes bigint, copied bigint, pending bigint, pending_old bigint)
language sql security definer set search_path = storage, public as $$
  select o.bucket_id,
         count(*),
         coalesce(sum((o.metadata->>'size')::bigint), 0),
         count(*) filter (where l.name is not null and l.etag is not distinct from o.metadata->>'eTag'),
         count(*) filter (where l.name is null or l.etag is distinct from o.metadata->>'eTag'),
         count(*) filter (where (l.name is null or l.etag is distinct from o.metadata->>'eTag') and o.updated_at < now() - interval '2 days')
  from storage.objects o
  left join public.file_backup_ledger l on l.bucket = o.bucket_id and l.name = o.name
  where o.bucket_id <> 'backups' and o.name not like '%.emptyFolderPlaceholder'
  group by o.bucket_id;
$$;

-- A file deleted at the source is marked; its copy is deleted 30 days later
-- (an accident can be undone for a month; a deletion is honoured within a month).
create or replace function public.file_backup_mark_gone()
returns int language plpgsql security definer set search_path = storage, public as $$
declare n int;
begin
  update public.file_backup_ledger l set source_gone_at = now()
  where l.source_gone_at is null
    and not exists (select 1 from storage.objects o where o.bucket_id = l.bucket and o.name = l.name);
  get diagnostics n = row_count;
  -- a file that came back (re-uploaded) is live again
  update public.file_backup_ledger l set source_gone_at = null
  where l.source_gone_at is not null
    and exists (select 1 from storage.objects o where o.bucket_id = l.bucket and o.name = l.name);
  return n;
end $$;

create or replace function public.file_backup_expired(p_days int default 30, p_limit int default 500)
returns table(bucket text, name text)
language sql security definer set search_path = public as $$
  select l.bucket, l.name from public.file_backup_ledger l
  where l.source_gone_at is not null and l.source_gone_at < now() - make_interval(days => p_days)
  limit least(greatest(p_limit, 1), 1000);
$$;

-- A random handful of COPIED files, for the monthly restore check.
create or replace function public.file_backup_sample(p_n int default 6)
returns table(bucket text, name text, size bigint)
language sql security definer set search_path = public as $$
  select l.bucket, l.name, l.size from public.file_backup_ledger l
  where l.source_gone_at is null and coalesce(l.size, 0) between 1 and 30000000
  order by random() limit least(greatest(p_n, 1), 20);
$$;

revoke all on function public.file_backup_pending(text, int) from public, anon, authenticated;
revoke all on function public.file_backup_status() from public, anon, authenticated;
revoke all on function public.file_backup_mark_gone() from public, anon, authenticated;
revoke all on function public.file_backup_expired(int, int) from public, anon, authenticated;
revoke all on function public.file_backup_sample(int) from public, anon, authenticated;
grant execute on function public.file_backup_pending(text, int), public.file_backup_status(),
  public.file_backup_mark_gone(), public.file_backup_expired(int, int), public.file_backup_sample(int) to service_role;
grant select, insert, update, delete on public.file_backup_ledger to service_role;
