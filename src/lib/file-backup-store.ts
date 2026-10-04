// The copying half of the file backup — the rules are in lib/file-backup.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getScienceClient, scienceConfigured } from '@/lib/science-bank';
import {
  BACKUP_BUCKET, GONE_GRACE_DAYS, backupPath, bucketsToCopy,
  type BucketStatus, type FileBackupRun,
} from '@/lib/file-backup';

const BATCH_MARGIN_MS = 45_000;

interface Pair { project: string; src: SupabaseClient; dest: SupabaseClient; buckets?: string[] }

function pairs(): Pair[] {
  if (!scienceConfigured()) throw new Error('the second project is not configured (SUPABASE_URL_SCIENCE)');
  const main = getSupabaseAdmin();
  const science = getScienceClient();
  return [
    { project: 'main', src: main, dest: science },
    { project: 'science', src: science, dest: main, buckets: ['question_images'] },
  ];
}

async function ensurePrivateBucket(dest: SupabaseClient): Promise<void> {
  const { data } = await dest.storage.getBucket(BACKUP_BUCKET);
  if (data) {
    if (data.public) throw new Error('a backups bucket is PUBLIC — refusing to copy into it');
    return;
  }
  const { error } = await dest.storage.createBucket(BACKUP_BUCKET, { public: false });
  if (error && !/exists/i.test(error.message)) throw new Error(`could not create the backups bucket: ${error.message}`);
}

type Pending = { name: string; size: number | null; etag: string | null; updated_at: string | null; mimetype: string | null };

async function copyOne(p: Pair, bucket: string, f: Pending): Promise<void> {
  const { data: blob, error: dlErr } = await p.src.storage.from(bucket).download(f.name);
  if (dlErr || !blob) throw new Error(`download: ${dlErr?.message || 'empty'}`);
  const body = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await p.dest.storage.from(BACKUP_BUCKET).upload(backupPath(bucket, f.name), body, {
    contentType: f.mimetype || blob.type || 'application/octet-stream', upsert: true,
  });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { error: ledErr } = await p.src.from('file_backup_ledger').upsert({
    bucket, name: f.name, size: f.size ?? body.length, etag: f.etag, src_updated_at: f.updated_at,
    copied_at: new Date().toISOString(), source_gone_at: null,
  });
  if (ledErr) throw new Error(`ledger: ${ledErr.message}`);
}

export interface RunOpts {
  budgetMs?: number;
  concurrency?: number;
  /** Only these source buckets (by name), e.g. ['student-files'] to do the students' files first. */
  only?: string[];
  log?: (s: string) => void;
}

export async function runFileBackup(opts: RunOpts = {}): Promise<FileBackupRun> {
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const conc = Math.max(1, Math.min(opts.concurrency ?? 6, 12));
  const run: FileBackupRun = { copied: 0, copiedBytes: 0, failures: [], expiredRemoved: 0, status: [], outOfTime: false };

  for (const p of pairs()) {
    await ensurePrivateBucket(p.dest);

    // Deleted at the source → mark, and remove copies past the grace period.
    await p.src.rpc('file_backup_mark_gone');
    const { data: expired } = await p.src.rpc('file_backup_expired', { p_days: GONE_GRACE_DAYS, p_limit: 500 });
    const gone = (expired || []) as { bucket: string; name: string }[];
    for (let i = 0; i < gone.length; i += 100) {
      const chunk = gone.slice(i, i + 100);
      const { error } = await p.dest.storage.from(BACKUP_BUCKET).remove(chunk.map((g) => backupPath(g.bucket, g.name)));
      if (error) { run.failures.push({ where: `${p.project} expired copies`, error: error.message.slice(0, 80) }); continue; }
      for (const g of chunk) await p.src.from('file_backup_ledger').delete().eq('bucket', g.bucket).eq('name', g.name);
      run.expiredRemoved += chunk.length;
    }

    const { data: bucketList } = await p.src.storage.listBuckets();
    let buckets = p.buckets ?? bucketsToCopy((bucketList || []).map((b) => b.id));
    if (opts.only?.length) buckets = buckets.filter((b) => opts.only!.includes(b));

    for (const bucket of buckets) {
      const failed = new Set<string>();
      while (Date.now() < deadline - BATCH_MARGIN_MS) {
        const { data, error } = await p.src.rpc('file_backup_pending', { p_bucket: bucket, p_limit: 300 });
        if (error) { run.failures.push({ where: `${p.project}/${bucket}`, error: error.message.slice(0, 80) }); break; }
        const todo = ((data || []) as Pending[]).filter((f) => !failed.has(f.name));
        if (!todo.length) break;
        // A batch is only started with time to finish it: big past papers (up to
        // 50 MB) in flight at the deadline pushed a run past Vercel's 300 s (5 Oct 2026).
        for (let i = 0; i < todo.length && Date.now() < deadline - BATCH_MARGIN_MS; i += conc) {
          await Promise.all(todo.slice(i, i + conc).map(async (f) => {
            try {
              await copyOne(p, bucket, f);
              run.copied += 1;
              run.copiedBytes += f.size ?? 0;
            } catch (e) {
              failed.add(f.name);
              run.failures.push({ where: `${p.project}/${bucket}/${f.name}`, error: (e as Error).message.slice(0, 80) });
            }
          }));
        }
        opts.log?.(`${p.project}/${bucket}: ${run.copied} copied, ${(run.copiedBytes / 1e9).toFixed(2)} GB, ${run.failures.length} failed`);
      }
      if (Date.now() >= deadline - BATCH_MARGIN_MS) { run.outOfTime = true; break; }
    }

    const { data: st } = await p.src.rpc('file_backup_status');
    run.status.push({ project: p.project, buckets: ((st || []) as BucketStatus[]).map((b) => ({
      bucket: b.bucket, files: Number(b.files), bytes: Number(b.bytes), copied: Number(b.copied),
      pending: Number(b.pending), pending_old: Number(b.pending_old),
    })).filter((b) => !p.buckets || p.buckets.includes(b.bucket)) });
    if (run.outOfTime) break;
  }
  return run;
}

/** For the monthly restore check: download a few COPIES from the backup and return them with their expected size. */
export async function sampleBackupCopies(n = 6): Promise<{ bucket: string; name: string; expectedSize: number | null; bytes: Uint8Array | null; error?: string }[]> {
  const out: { bucket: string; name: string; expectedSize: number | null; bytes: Uint8Array | null; error?: string }[] = [];
  for (const p of pairs()) {
    const { data, error } = await p.src.rpc('file_backup_sample', { p_n: p.project === 'main' ? n : Math.max(1, Math.floor(n / 3)) });
    if (error) { out.push({ bucket: `${p.project}:(sample)`, name: '', expectedSize: null, bytes: null, error: error.message.slice(0, 80) }); continue; }
    for (const f of (data || []) as { bucket: string; name: string; size: number | null }[]) {
      const { data: blob, error: dlErr } = await p.dest.storage.from(BACKUP_BUCKET).download(backupPath(f.bucket, f.name));
      out.push({
        bucket: `backup of ${p.project}/${f.bucket}`, name: f.name, expectedSize: f.size,
        bytes: blob ? new Uint8Array(await blob.arrayBuffer()) : null, error: dlErr?.message?.slice(0, 60),
      });
    }
  }
  return out;
}
