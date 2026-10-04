import { describe, it, expect } from 'vitest';
import {
  snapshotMonth, foldersToPrune, snapshotPath, tableProblems, sniffFile, expectedKind,
  fileProblems, managedBackupProblem, allProblems, backupCheckLine, type BackupCheckResult,
} from './backup-check';

describe('snapshotMonth', () => {
  it('uses the Singapore month', () => {
    expect(snapshotMonth(new Date('2026-10-31T17:00:00Z'))).toBe('2026-11'); // 1 Nov 01:00 SGT
    expect(snapshotMonth(new Date('2026-10-31T15:00:00Z'))).toBe('2026-10');
  });
});

describe('foldersToPrune', () => {
  it('keeps the newest three month folders and ignores anything else', () => {
    expect(foldersToPrune(['2026-07', '2026-10', '2026-08', '2026-09', 'notes'])).toEqual(['2026-07']);
    expect(foldersToPrune(['2026-09', '2026-10'])).toEqual([]);
  });
});

describe('snapshotPath', () => {
  it('makes a safe file name for an Airtable table with a space', () => {
    expect(snapshotPath('airtable', '2026-10', 'Rate History')).toBe('airtable/2026-10/Rate_History.json.gz');
  });
});

describe('tableProblems', () => {
  it('passes a copy read back whole', () => {
    expect(tableProblems({ table: 't', written: 10, readBack: 10, live: 11 })).toEqual([]);
  });
  it('fails a copy that could not be read back or came back short', () => {
    expect(tableProblems({ table: 't', written: 10, readBack: null, live: 10 })[0]).toMatch(/could not be read back/);
    expect(tableProblems({ table: 't', written: 10, readBack: 9, live: 10 })[0]).toMatch(/read back 9/);
  });
  it('fails a copy holding far fewer rows than live (missed pages)', () => {
    expect(tableProblems({ table: 't', written: 1000, readBack: 1000, live: 1400 })[0]).toMatch(/live has 1400/);
  });
  it('an empty table is fine', () => {
    expect(tableProblems({ table: 't', written: 0, readBack: 0, live: 0 })).toEqual([]);
  });
});

describe('sniffFile / expectedKind', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0]);
  it('recognises the real formats', () => {
    expect(sniffFile(bytes(0x25, 0x50, 0x44, 0x46))).toBe('pdf');
    expect(sniffFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(sniffFile(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniffFile(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBe('svg');
    expect(sniffFile(new TextEncoder().encode('<html>oops</html>'))).toBe('unknown');
  });
  it('maps a name to the kind it promises', () => {
    expect(expectedKind('a/b.JPG')).toBe('jpeg');
    expect(expectedKind('x.docx')).toBe('zip');
    expect(expectedKind('noext')).toBeNull();
  });
});

describe('fileProblems', () => {
  const ok = { bucket: 'b', name: 'p.pdf', expectedSize: 5, gotSize: 5, kind: 'pdf' as const };
  it('passes a whole file of the right kind', () => expect(fileProblems(ok)).toEqual([]));
  it('fails a download, an empty file, a short file and a file that is not what its name says', () => {
    expect(fileProblems({ ...ok, gotSize: null, error: '404' })[0]).toMatch(/would not download \(404\)/);
    expect(fileProblems({ ...ok, gotSize: 0 })[0]).toMatch(/empty/);
    expect(fileProblems({ ...ok, gotSize: 4 })[0]).toMatch(/4 bytes, expected 5/);
    expect(fileProblems({ ...ok, kind: 'unknown' })[0]).toMatch(/is unknown/);
  });
});

describe('managedBackupProblem', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('passes a backup under 36 hours old', () => {
    expect(managedBackupProblem('main', [{ inserted_at: '2026-10-05T01:00:00Z', status: 'COMPLETED' }], now)).toBeNull();
  });
  it('fails an old backup, no finished backup, or an unreadable list', () => {
    expect(managedBackupProblem('main', [{ inserted_at: '2026-10-03T01:00:00Z', status: 'COMPLETED' }], now)).toMatch(/59 hours old/);
    expect(managedBackupProblem('main', [{ inserted_at: '2026-10-05T01:00:00Z', status: 'FAILED' }], now)).toMatch(/no finished backup/);
    expect(managedBackupProblem('main', null, now)).toMatch(/could not be read/);
  });
});

describe('backupCheckLine', () => {
  const base: BackupCheckResult = {
    tables: [{ table: 'a', written: 3, readBack: 3, live: 3 }],
    airtable: [{ table: 'Students', written: 2, readBack: 2, live: null }],
    files: [{ bucket: 'b', name: 'x.png', expectedSize: 1, gotSize: 1, kind: 'png' }],
    managed: [{ project: 'main', problem: null, checked: false }],
  };
  it('says ok in one line, and is honest that Supabase was not checked', () => {
    const line = backupCheckLine(base);
    expect(line).toMatch(/^Backups checked: ok/);
    expect(line).toMatch(/not checked \(no access token\)/);
    expect(allProblems(base)).toEqual([]);
  });
  it('an unchecked managed problem is not a failure; a checked one is', () => {
    expect(allProblems({ ...base, managed: [{ project: 'main', problem: 'x', checked: false }] })).toEqual([]);
    expect(backupCheckLine({ ...base, managed: [{ project: 'main', problem: 'main: old', checked: true }] })).toMatch(/^Backup check FAILED: main: old/);
  });
});
