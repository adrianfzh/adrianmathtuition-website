// The I/O half of the monthly backup check — the rules are in lib/backup-check.ts.
//
// Where the copy goes: a PRIVATE bucket `backups` in the adrianscience Supabase
// project (same Singapore region, same processor, but a different project — so a
// mistake or a deletion in the main project does not take the copy with it).
// Three monthly folders are kept; older ones are deleted by this job.
import { gzipSync, gunzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getScienceClient, scienceConfigured } from '@/lib/science-bank';
import { airtableRequestAll } from '@/lib/airtable';
import { sampleBackupCopies } from '@/lib/file-backup-store';
import {
  AIRTABLE_SNAPSHOT_TABLES, DB_SNAPSHOT_TABLES, SAMPLED_BUCKETS, foldersToPrune, snapshotMonth,
  snapshotPath, sniffFile, managedBackupProblem,
  type BackupCheckResult, type FileCheck, type ManagedBackup, type TableCheck,
} from '@/lib/backup-check';

export const BACKUP_BUCKET = 'backups';
const MAIN_REF = 'nempslbewxtlikfzachi';
const SCIENCE_REF = 'eaxnstsecxmqdobfvmjh';

async function ensureBucket(dest: SupabaseClient): Promise<void> {
  const { data } = await dest.storage.getBucket(BACKUP_BUCKET);
  if (data) {
    if (data.public) throw new Error('the backups bucket is PUBLIC — refusing to write');
    return;
  }
  const { error } = await dest.storage.createBucket(BACKUP_BUCKET, { public: false });
  if (error && !/exists/i.test(error.message)) throw new Error(`could not create the backups bucket: ${error.message}`);
}

async function writeAndReadBack(dest: SupabaseClient, path: string, rows: unknown[]): Promise<number | null> {
  const body = gzipSync(Buffer.from(JSON.stringify(rows)));
  const { error } = await dest.storage.from(BACKUP_BUCKET).upload(path, body, {
    contentType: 'application/gzip', upsert: true,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data, error: dlErr } = await dest.storage.from(BACKUP_BUCKET).download(path);
  if (dlErr || !data) return null;
  try {
    const back = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString('utf8'));
    return Array.isArray(back) ? back.length : null;
  } catch {
    return null;
  }
}

// PostgREST silently caps a response at 1000 rows — page everything. Big rows
// (paper_marking_runs) go in small pages so one response stays well under limits.
async function allRows(src: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const PAGE = table === 'paper_marking_runs' ? 40 : 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await src.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function snapshotDbTable(src: SupabaseClient, dest: SupabaseClient, month: string, table: string): Promise<TableCheck> {
  try {
    const rows = await allRows(src, table);
    const readBack = await writeAndReadBack(dest, snapshotPath('db', month, table), rows);
    const { count } = await src.from(table).select('*', { count: 'exact', head: true });
    // A few sampled ids looked up live — a restore of these rows would land on real ids.
    const ids = rows.map((r) => r.id).filter((v) => v !== undefined && v !== null);
    let sampleMissing: number | undefined;
    if (ids.length) {
      const pick = Array.from({ length: Math.min(3, ids.length) }, () => ids[Math.floor(Math.random() * ids.length)]);
      const { data } = await src.from(table).select('id').in('id', pick as string[]);
      sampleMissing = new Set(pick).size - (data?.length ?? 0);
    }
    return { table, written: rows.length, readBack, live: count ?? null, sampleMissing };
  } catch (e) {
    return { table, written: 0, readBack: null, live: null, error: (e as Error).message.slice(0, 120) };
  }
}

async function snapshotAirtableTable(dest: SupabaseClient, month: string, table: string): Promise<TableCheck> {
  try {
    const { records } = await airtableRequestAll(table);
    const readBack = await writeAndReadBack(dest, snapshotPath('airtable', month, table), records);
    return { table, written: records.length, readBack, live: records.length };
  } catch (e) {
    return { table, written: 0, readBack: null, live: null, error: (e as Error).message.slice(0, 120) };
  }
}

async function sampleFiles(src: SupabaseClient, bucket: string, n: number): Promise<FileCheck[]> {
  const { data, error } = await src.rpc('backup_sample_objects', { p_bucket: bucket, p_n: n });
  if (error) return [{ bucket, name: '(sample)', expectedSize: null, gotSize: null, kind: 'unknown', error: error.message.slice(0, 80) }];
  const out: FileCheck[] = [];
  for (const o of (data || []) as { name: string; size: number | null }[]) {
    try {
      const { data: blob, error: dlErr } = await src.storage.from(bucket).download(o.name);
      if (dlErr || !blob) {
        out.push({ bucket, name: o.name, expectedSize: o.size, gotSize: null, kind: 'unknown', error: dlErr?.message?.slice(0, 60) });
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      out.push({ bucket, name: o.name, expectedSize: o.size, gotSize: bytes.length, kind: sniffFile(bytes) });
    } catch (e) {
      out.push({ bucket, name: o.name, expectedSize: o.size, gotSize: null, kind: 'unknown', error: (e as Error).message.slice(0, 60) });
    }
  }
  return out;
}

async function managedBackups(ref: string): Promise<ManagedBackup[] | null> {
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/backups`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { backups?: ManagedBackup[] } | null;
  return body?.backups ?? null;
}

async function pruneOld(dest: SupabaseClient): Promise<number> {
  let removed = 0;
  for (const kind of ['db', 'airtable'] as const) {
    const { data: folders } = await dest.storage.from(BACKUP_BUCKET).list(kind, { limit: 100 });
    for (const month of foldersToPrune((folders || []).map((f) => f.name))) {
      const { data: files } = await dest.storage.from(BACKUP_BUCKET).list(`${kind}/${month}`, { limit: 1000 });
      const paths = (files || []).map((f) => `${kind}/${month}/${f.name}`);
      if (paths.length) {
        const { error } = await dest.storage.from(BACKUP_BUCKET).remove(paths);
        if (!error) removed += paths.length;
      }
    }
  }
  return removed;
}

export interface RunOptions {
  /** Skip the copy (files + managed backups only) — for a quick probe. */
  copy?: boolean;
  filesPerBucket?: number;
}

export async function runBackupCheck(opts: RunOptions = {}): Promise<BackupCheckResult & { pruned: number; month: string }> {
  const copy = opts.copy !== false;
  const month = snapshotMonth();
  const src = getSupabaseAdmin();
  const result: BackupCheckResult & { pruned: number; month: string } = {
    tables: [], airtable: [], files: [], managed: [], pruned: 0, month,
  };

  if (copy) {
    if (!scienceConfigured()) {
      result.tables.push({ table: '(copy)', written: 0, readBack: null, live: null, error: 'the second project is not configured (SUPABASE_URL_SCIENCE)' });
    } else {
      const dest = getScienceClient();
      try {
        await ensureBucket(dest);
        for (const t of DB_SNAPSHOT_TABLES) result.tables.push(await snapshotDbTable(src, dest, month, t));
        for (const t of AIRTABLE_SNAPSHOT_TABLES) result.airtable.push(await snapshotAirtableTable(dest, month, t));
        result.pruned = await pruneOld(dest);
      } catch (e) {
        result.tables.push({ table: '(copy)', written: 0, readBack: null, live: null, error: (e as Error).message.slice(0, 120) });
      }
    }
  }

  for (const b of SAMPLED_BUCKETS) result.files.push(...(await sampleFiles(src, b, opts.filesPerBucket ?? 4)));
  // The file backup's own copies (5 Oct 2026): a random handful downloaded FROM
  // THE BACKUP and checked the same way — a copy that will not open is no backup.
  if (scienceConfigured()) {
    try {
      for (const c of await sampleBackupCopies(6)) {
        result.files.push({
          bucket: c.bucket, name: c.name, expectedSize: c.expectedSize,
          gotSize: c.bytes ? c.bytes.length : null, kind: c.bytes ? sniffFile(c.bytes) : 'unknown', error: c.error,
        });
      }
    } catch (e) {
      result.files.push({ bucket: 'backup copies', name: '(sample)', expectedSize: null, gotSize: null, kind: 'unknown', error: (e as Error).message.slice(0, 80) });
    }
  }

  const hasToken = !!(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  for (const [project, ref] of [['main', MAIN_REF], ['science', SCIENCE_REF]] as const) {
    if (!hasToken) { result.managed.push({ project, problem: null, checked: false }); continue; }
    result.managed.push({ project, problem: managedBackupProblem(project, await managedBackups(ref)), checked: true });
  }
  return result;
}
