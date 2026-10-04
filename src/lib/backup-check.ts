// 🗄 The monthly backup check (5 Oct 2026, Adrian: "backup checks").
//
// What it proves, in plain words:
//   1. Our own copy — the student tables of the main database and the key
//      Airtable tables are written, gzipped, to a PRIVATE bucket in the OTHER
//      Supabase project (adrianscience), then read back and compared with what
//      was written and with live. A copy we have never read back is not a backup.
//   2. Files open — a random handful of files in student-files, question_images
//      and paper-library is downloaded and checked (right size, real PDF/image).
//   3. Supabase's own nightly backups — listed through the Management API when
//      SUPABASE_ACCESS_TOKEN is set; the newest must be under 36 hours old.
//      Without the token that part says "not checked", it never pretends.
//
// Everything decidable without the network lives here (pure, tested);
// lib/backup-check-store.ts does the I/O and /api/cron/backup-check runs it.

/** Student tables of the main project copied every month (identity-keyed data a restore would need). */
export const DB_SNAPSHOT_TABLES = [
  'portal_accounts',
  'paper_marking_runs',
  'student_attempts',
  'portal_assignments',
  'portal_passes',
  'notebook_mistakes',
  'notebook_entries',
  'notebook_private_notes',
  'notebook_saves',
  'portal_notes',
  'weakness_tags',
  'essay_runs',
  'humanities_runs',
  'student_ink',
  'student_work_ink',
  'marking_corrections',
  'sheet_jobs',
  'calibration_results',
] as const;

/** Airtable tables copied every month: the tuition business's own records. */
export const AIRTABLE_SNAPSHOT_TABLES = [
  'Students',
  'Enrollments',
  'Slots',
  'Lessons',
  'Exams',
  'Invoices',
  'Payments',
  'Payment Allocations',
  'Rates',
  'Rate History',
  'Settings',
] as const;

/** Buckets whose files are sampled. */
export const SAMPLED_BUCKETS = ['student-files', 'question_images', 'paper-library'] as const;

/** Monthly snapshots kept in the backup bucket (older folders are pruned). */
export const SNAPSHOTS_KEPT = 3;

/** Supabase's own newest backup must be younger than this. */
export const MANAGED_BACKUP_MAX_HOURS = 36;

/** "2026-10" — the folder a snapshot taken at `now` lives in (Singapore month). */
export function snapshotMonth(now: Date = new Date()): string {
  const sg = new Date(now.getTime() + 8 * 3600_000);
  return `${sg.getUTCFullYear()}-${String(sg.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Month folders ("YYYY-MM") to delete so only the newest `keep` remain. Ignores anything else. */
export function foldersToPrune(folders: string[], keep: number = SNAPSHOTS_KEPT): string[] {
  const months = [...new Set(folders.filter((f) => /^\d{4}-\d{2}$/.test(f)))].sort();
  return months.length > keep ? months.slice(0, months.length - keep) : [];
}

/** Path of one table's snapshot inside the backup bucket. */
export function snapshotPath(kind: 'db' | 'airtable', month: string, table: string): string {
  return `${kind}/${month}/${table.replace(/[^A-Za-z0-9_-]+/g, '_')}.json.gz`;
}

export interface TableCheck {
  table: string;
  written: number;
  readBack: number | null; // null = could not be read back
  live: number | null; // null = live count unavailable
  sampleMissing?: number; // sampled ids not found live (rows can be deleted — reported, not failed)
  error?: string;
}

/**
 * Problems with one table's copy. A copy fails when it could not be written or
 * read back, or when what came back differs from what was written. Live is
 * allowed to drift a little (rows are added and deleted while we copy), but a
 * snapshot holding fewer than 90 % of live rows means the copy missed pages.
 */
export function tableProblems(c: TableCheck): string[] {
  const out: string[] = [];
  if (c.error) out.push(`${c.table}: ${c.error}`);
  if (c.readBack === null) out.push(`${c.table}: the copy could not be read back`);
  else if (c.readBack !== c.written) out.push(`${c.table}: wrote ${c.written} rows, read back ${c.readBack}`);
  if (c.live !== null && c.live > 0 && c.written < Math.floor(c.live * 0.9)) {
    out.push(`${c.table}: the copy has ${c.written} rows but live has ${c.live}`);
  }
  return out;
}

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'gif' | 'svg' | 'json' | 'docx' | 'zip' | 'mp3' | 'unknown';

/** What a file really is, from its first bytes. */
export function sniffFile(bytes: Uint8Array): FileKind {
  const b = bytes;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (b.length >= 4 && starts(0x25, 0x50, 0x44, 0x46)) return 'pdf';
  if (b.length >= 8 && starts(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (b.length >= 3 && starts(0xff, 0xd8, 0xff)) return 'jpeg';
  if (b.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b.length >= 4 && starts(0x47, 0x49, 0x46, 0x38)) return 'gif';
  if (b.length >= 4 && starts(0x50, 0x4b, 0x03, 0x04)) return 'zip'; // docx is a zip
  if (b.length >= 3 && (starts(0x49, 0x44, 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return 'mp3';
  const head = new TextDecoder().decode(b.slice(0, 256)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  return 'unknown';
}

/** The kind a file's name promises, or null when the name says nothing we check. */
export function expectedKind(name: string): FileKind | null {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'webp') return 'webp';
  if (ext === 'gif') return 'gif';
  if (ext === 'svg') return 'svg';
  if (ext === 'json') return 'json';
  if (ext === 'docx') return 'zip';
  if (ext === 'mp3') return 'mp3';
  return null;
}

export interface FileCheck {
  bucket: string;
  name: string;
  expectedSize: number | null;
  gotSize: number | null; // null = download failed
  kind: FileKind;
  error?: string;
}

/** Problems with one sampled file: did not download, wrong size, empty, or not what its name says. */
export function fileProblems(f: FileCheck): string[] {
  const where = `${f.bucket}/${f.name}`;
  if (f.gotSize === null) return [`${where}: would not download${f.error ? ` (${f.error})` : ''}`];
  if (f.gotSize === 0) return [`${where}: the file is empty`];
  const out: string[] = [];
  if (f.expectedSize !== null && f.expectedSize !== f.gotSize) out.push(`${where}: ${f.gotSize} bytes, expected ${f.expectedSize}`);
  const want = expectedKind(f.name);
  if (want && f.kind !== want) out.push(`${where}: named .${f.name.split('.').pop()} but is ${f.kind}`);
  return out;
}

export interface ManagedBackup { inserted_at?: string; status?: string; is_physical_backup?: boolean }

/**
 * Supabase's own backups for one project: fine when the newest COMPLETED backup is
 * younger than MANAGED_BACKUP_MAX_HOURS. Returns the problem, or null.
 */
export function managedBackupProblem(
  project: string,
  backups: ManagedBackup[] | null,
  now: Date = new Date(),
  maxHours: number = MANAGED_BACKUP_MAX_HOURS,
): string | null {
  if (backups === null) return `${project}: Supabase's backup list could not be read`;
  const done = backups
    .filter((b) => (b.status || '').toUpperCase() === 'COMPLETED' && b.inserted_at)
    .map((b) => Date.parse(b.inserted_at as string))
    .filter((t) => !Number.isNaN(t));
  if (!done.length) return `${project}: Supabase has no finished backup`;
  const ageH = (now.getTime() - Math.max(...done)) / 3600_000;
  return ageH > maxHours ? `${project}: Supabase's newest backup is ${Math.round(ageH)} hours old` : null;
}

export interface BackupCheckResult {
  tables: TableCheck[];
  airtable: TableCheck[];
  files: FileCheck[];
  managed: { project: string; problem: string | null; checked: boolean }[];
}

/** Every problem found, in plain words. Empty = all good. */
export function allProblems(r: BackupCheckResult): string[] {
  return [
    ...r.tables.flatMap(tableProblems),
    ...r.airtable.flatMap(tableProblems),
    ...r.files.flatMap(fileProblems),
    ...r.managed.filter((m) => m.checked && m.problem).map((m) => m.problem as string),
  ];
}

/** The one line for the logbook and (on failure) for Adrian. */
export function backupCheckLine(r: BackupCheckResult): string {
  const problems = allProblems(r);
  const rows = r.tables.reduce((s, t) => s + t.written, 0);
  const at = r.airtable.reduce((s, t) => s + t.written, 0);
  const files = r.files.length;
  const managedChecked = r.managed.filter((m) => m.checked).length;
  const managedNote = managedChecked
    ? `Supabase's nightly backups checked for ${managedChecked} project${managedChecked === 1 ? '' : 's'}`
    : "Supabase's own nightly backups not checked (no access token)";
  if (!problems.length && !r.tables.length && !r.airtable.length) {
    return `Files check: ok — ${files} sample files open; ${managedNote}.`;
  }
  if (!problems.length) {
    return `Backups checked: ok — copied and read back ${rows} database rows (${r.tables.length} tables) and ${at} Airtable records (${r.airtable.length} tables); ${files} sample files open; ${managedNote}.`;
  }
  const shown = problems.slice(0, 4).join('; ');
  const more = problems.length > 4 ? ` (+${problems.length - 4} more)` : '';
  return `Backup check FAILED: ${shown}${more}.`;
}
