import { describe, it, expect } from 'vitest';
import { backupPath, bucketsToCopy, fileBackupProblems, fileBackupLine, type FileBackupRun } from './file-backup';

const run = (over: Partial<FileBackupRun> = {}): FileBackupRun => ({
  copied: 3, copiedBytes: 3e9, failures: [], expiredRemoved: 0, outOfTime: false,
  status: [{ project: 'main', buckets: [{ bucket: 'student-files', files: 10, bytes: 9e9, copied: 10, pending: 0, pending_old: 0 }] }],
  ...over,
});

describe('file backup rules', () => {
  it('keeps each bucket in its own folder of the backup', () => {
    expect(backupPath('student-files', 'runs/abc/p1.jpg')).toBe('files/student-files/runs/abc/p1.jpg');
  });
  it('copies every bucket except the backup bucket itself', () => {
    expect(bucketsToCopy(['student-files', 'backups', 'paper-library'])).toEqual(['paper-library', 'student-files']);
  });
  it('a clean run has no problems and says ok', () => {
    expect(fileBackupProblems(run(), { backfillDone: true })).toEqual([]);
    expect(fileBackupLine(run(), [])).toMatch(/^File backup: ok\. Copied 3 files \(3\.0 GB\).*10 of 10 files/);
  });
  it('a failed copy is a problem', () => {
    const p = fileBackupProblems(run({ failures: [{ where: 'main/x/a.jpg', error: 'upload: too big' }] }), { backfillDone: false });
    expect(p[0]).toMatch(/1 file would not copy: main\/x\/a\.jpg \(upload: too big\)/);
  });
  it('files waiting over two days alarm only once the first full copy has finished', () => {
    const stalled = run({ status: [{ project: 'main', buckets: [{ bucket: 'student-files', files: 10, bytes: 1, copied: 4, pending: 6, pending_old: 6 }] }] });
    expect(fileBackupProblems(stalled, { backfillDone: false })).toEqual([]);
    expect(fileBackupProblems(stalled, { backfillDone: true })[0]).toMatch(/main\/student-files: 6/);
  });
  it('says the run carries on when it ran out of time', () => {
    const r = run({ outOfTime: true, status: [{ project: 'main', buckets: [{ bucket: 'b', files: 10, bytes: 1, copied: 4, pending: 6, pending_old: 0 }] }] });
    expect(fileBackupLine(r, [])).toMatch(/6 still to copy — carries on next run/);
  });
});
