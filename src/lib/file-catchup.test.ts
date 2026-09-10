import { describe, it, expect } from 'vitest';
import { needsFiling, pickForFiling, filingPathFor, fileCatchupLine, FILE_CATCHUP_WINDOW_DAYS, type FilingRun } from './file-catchup';

// Kiara Tan Jia Min, EM TYS 2022 P2 (Adrian, 10 Sep 2026: "kiara should have an
// em tys 2022 p2 → but i don't see it in dropbox?"). Marked, images PDF built and
// still in the private store, released to her at 06:57 — and no folder under
// /Students/Kiara Tan Jia Min/. The filing is one fail-soft POST from the bot's
// deliverQueuedRun with no retry, so a single failure loses the tray copy and
// leaves nothing behind but dropbox_path IS NULL.

const NOW = new Date('2026-09-10T09:00:00Z');
const kiara: FilingRun = {
  id: '4ab0d896-aea9-4cec-8be1-e440ac54dc5c',
  student_id: 'rec4rVqT4eDcBRmeM',
  student_name: 'Kiara Tan Jia Min',
  paper_name: 'kiara em tys 2022 p2',
  created_at: '2026-09-09T05:35:51.961Z',
  released_at: '2026-09-09T06:57:01.826Z',
  archived_at: null,
  dropbox_path: null,
  photos_pdf_url: 'https://www.adrianmathtuition.com/api/files/runs/4ab0d896-aea9-4cec-8be1-e440ac54dc5c/marked-photos.pdf',
};

describe('needsFiling', () => {
  it('picks up a released paper with no Dropbox copy (Kiara, 9 Sep 2026)', () => {
    expect(needsFiling(kiara, NOW)).toBe(true);
  });

  it('leaves a paper that is already filed', () => {
    const filed = { ...kiara, dropbox_path: '/students/rainie cheng/2026-09-09 rainie em tys 2022 p2/1 marked by ai.pdf' };
    expect(needsFiling(filed, NOW)).toBe(false);
  });

  it('leaves a run that has NOT been released — the marking-time call owns it', () => {
    expect(needsFiling({ ...kiara, released_at: null }, NOW)).toBe(false);
  });

  it('leaves an archived run — it was never meant to go out', () => {
    expect(needsFiling({ ...kiara, archived_at: '2026-09-09T08:00:00Z' }, NOW)).toBe(false);
  });

  it('leaves a paper released longer ago than the window — the tray deletes it anyway', () => {
    const old = { ...kiara, released_at: '2026-08-01T06:57:01.826Z' };
    expect(needsFiling(old, NOW)).toBe(false);
    expect(needsFiling(old, NOW, 60)).toBe(true);
    expect(FILE_CATCHUP_WINDOW_DAYS).toBe(14);
  });

  it('leaves a run with no images PDF of ours to file', () => {
    expect(needsFiling({ ...kiara, photos_pdf_url: null }, NOW)).toBe(false);
    expect(needsFiling({ ...kiara, photos_pdf_url: 'https://evil.example.com/x.pdf' }, NOW)).toBe(false);
  });

  it('still accepts a legacy Blob URL — those runs are ours too', () => {
    const legacy = { ...kiara, photos_pdf_url: 'https://c7hgmz1ji3tevske.public.blob.vercel-storage.com/mark-paper/2026-09-02T23-57-33-333Z.pdf' };
    expect(needsFiling(legacy, NOW)).toBe(true);
  });
});

describe('pickForFiling', () => {
  it('takes the longest-missing papers first, up to the per-tick cap', () => {
    const runs: FilingRun[] = [
      { ...kiara, id: 'c', released_at: '2026-09-09T06:57:00Z' },
      { ...kiara, id: 'a', released_at: '2026-09-06T01:18:00Z' },   // Tin Tze Hin
      { ...kiara, id: 'b', released_at: '2026-09-08T05:34:00Z' },   // Kassandra
      { ...kiara, id: 'd', released_at: '2026-09-09T07:00:00Z', dropbox_path: '/x' },
    ];
    expect(pickForFiling(runs, NOW).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(pickForFiling(runs, NOW, 2).map(r => r.id)).toEqual(['a', 'b']);
  });

  it('an empty set is not an error', () => {
    expect(pickForFiling([], NOW)).toEqual([]);
  });
});

describe('filingPathFor', () => {
  it('files an ordinary paper at its own "1 Marked by AI.pdf"', () => {
    expect(filingPathFor(kiara, null)).toBe('/Students/Kiara Tan Jia Min/2026-09-09 kiara em tys 2022 p2/1 Marked by AI.pdf');
  });

  it('files a returned Practice Again into the PAPER it came from, like the route does', () => {
    // /api/admin/mark-paper-dropbox resolves assignment_id → source_run_id →
    // the parent paper's folder, "4 Practice Again — returned.pdf" (Adrian, 6 Sep
    // 2026). The catch-up must land in the same place or it mints a stray folder.
    const returned: FilingRun = { ...kiara, id: 'r1', paper_name: 'kiara practice again', assignment_id: 'a1' };
    expect(filingPathFor(returned, kiara)).toBe('/Students/Kiara Tan Jia Min/2026-09-09 kiara em tys 2022 p2/4 Practice Again — returned.pdf');
  });

  it('an untagged run files under _Untagged, never under an empty name', () => {
    expect(filingPathFor({ ...kiara, student_id: null }, null))
      .toBe('/Students/_Untagged/2026-09-09 kiara em tys 2022 p2/1 Marked by AI.pdf');
  });
});

describe('fileCatchupLine', () => {
  it('says what the tick did, for the job_runs stamp', () => {
    expect(fileCatchupLine({ considered: 2, filed: 2, failed: 0, items: [] })).toBe('filing: 2 filed, 0 failed, 2 missing');
  });
});
