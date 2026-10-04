// 🗄 The file backup (5 Oct 2026, Adrian: "backup the files").
//
// Supabase's own backups hold the DATABASE only — a deleted stored file (a
// student's hand-in photo, a marked page, a question figure, a past paper) was
// gone for good. Every file in every bucket is now copied to the PRIVATE
// `backups` bucket of the OTHER Supabase project:
//   main project (student-files, question_images, paper-library, … every bucket)
//     → adrianscience `backups/files/<bucket>/<name>`
//   science project (question_images — the science bank's figures)
//     → main `backups/files/<bucket>/<name>`
// Each source project keeps a ledger (`file_backup_ledger`) of what it has copied,
// so "what still needs copying" is one SQL query (`file_backup_pending`). The first
// full copy and the nightly top-up are the SAME job: it copies what is missing or
// changed, oldest first, until its time runs out, and the next run carries on.
// A file deleted at the source is deleted from the backup 30 days later.
// Pure rules here (tested); lib/file-backup-store.ts does the copying.

export const BACKUP_BUCKET = 'backups';
/** Days a copy outlives its deleted source — an accident can be undone, a deletion is honoured within a month. */
export const GONE_GRACE_DAYS = 30;
/** Files waiting longer than this (2 days, in file_backup_status) mean the backup has stalled. */
export const STALL_DAYS = 2;

/** Where a file's copy lives in the other project's backup bucket. */
export function backupPath(bucket: string, name: string): string {
  return `files/${bucket}/${name}`;
}

/** Buckets copied from a project: all of them except the backup bucket itself. */
export function bucketsToCopy(all: string[]): string[] {
  return all.filter((b) => b !== BACKUP_BUCKET).sort();
}

export interface BucketStatus { bucket: string; files: number; bytes: number; copied: number; pending: number; pending_old: number }

export interface FileBackupRun {
  copied: number;
  copiedBytes: number;
  failures: { where: string; error: string }[];
  expiredRemoved: number;
  status: { project: string; buckets: BucketStatus[] }[];
  outOfTime: boolean;
}

/** Problems worth a line to Adrian: copies that failed, or files waiting more than two days. */
export function fileBackupProblems(r: FileBackupRun, opts: { backfillDone: boolean }): string[] {
  const out: string[] = [];
  if (r.failures.length) {
    const first = r.failures.slice(0, 3).map((f) => `${f.where} (${f.error})`).join('; ');
    out.push(`${r.failures.length} file${r.failures.length === 1 ? '' : 's'} would not copy: ${first}`);
  }
  if (opts.backfillDone) {
    const stalled = r.status.flatMap((p) => p.buckets.filter((b) => b.pending_old > 0).map((b) => `${p.project}/${b.bucket}: ${b.pending_old}`));
    if (stalled.length) out.push(`files waiting over ${STALL_DAYS} days for their backup — ${stalled.join(', ')}`);
  }
  return out;
}

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;

/** One plain line for the logbook (and, on a problem, for Adrian). */
export function fileBackupLine(r: FileBackupRun, problems: string[]): string {
  const all = r.status.flatMap((p) => p.buckets);
  const files = all.reduce((s, b) => s + b.files, 0);
  const copied = all.reduce((s, b) => s + b.copied, 0);
  const bytes = all.reduce((s, b) => s + b.bytes, 0);
  const pending = all.reduce((s, b) => s + b.pending, 0);
  const head = problems.length ? `File backup FAILED: ${problems.join('; ')}.` : 'File backup: ok.';
  return `${head} Copied ${r.copied} file${r.copied === 1 ? '' : 's'} (${gb(r.copiedBytes)}) this run; ` +
    `${copied} of ${files} files (${gb(bytes)}) are backed up` +
    (pending ? `, ${pending} still to copy${r.outOfTime ? ' — carries on next run' : ''}` : '') +
    (r.expiredRemoved ? `; ${r.expiredRemoved} copies of deleted files removed` : '') + '.';
}
