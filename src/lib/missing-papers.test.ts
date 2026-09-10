import { describe, it, expect } from 'vitest';
import { groupMissingPapers, missingPapersLine, missingPaperKey, type MissingPaperRun } from './missing-papers';

const NOW = new Date('2026-09-11T00:00:00Z');

/** Same run-row shape `runsToReground` tests use in extraction-inbox.test.ts. */
function run(id: string, createdAt: string, rj: Record<string, unknown>): MissingPaperRun {
  return { id, paper_name: 'a paper', student_name: 'a student', created_at: createdAt, result_json: rj };
}

const gceAmP2Stamp = { key: 'gce 2025 am p2', filter: { school: 'GCE', year: 2025, level: 'AM', paper: '2' } };

/** An older-run shape (no `ungrounded` stamp): `parsed` carries the exam type,
 *  a null `grounding.source` and a `question_found:false` read say it was
 *  marked blind. */
function xinminEmP1Prelim(): Record<string, unknown> {
  return {
    paper_match: { parsed: { exam: 'PRELIM', level: 'EM', year: 2026, paper: 1, school: 'Xinmin' } },
    grounding: { source: null },
    results: [{ question_found: false }],
  };
}

describe('groupMissingPapers', () => {
  it('groups two hand-ins of the same ungrounded paper into one group, counted', () => {
    const runs = [
      run('a', '2026-09-10T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] }),
      run('b', '2026-09-09T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] }),
    ];
    const groups = groupMissingPapers(runs, new Set(), { now: NOW });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: 'GCE 2025 AM P2', count: 2, runIds: ['a', 'b'] });
  });

  it('separates two different papers into two groups, highest count first', () => {
    const runs = [
      run('a', '2026-09-10T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] }),
      run('b', '2026-09-09T00:00:00Z', xinminEmP1Prelim()),
      run('c', '2026-09-08T00:00:00Z', xinminEmP1Prelim()),
    ];
    const groups = groupMissingPapers(runs, new Set(), { now: NOW });
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ['Xinmin 2026 EM Prelim P1', 2],
      ['GCE 2025 AM P2', 1],
    ]);
  });

  it('excludes a run already re-grounded against this very paper', () => {
    const runs = [
      run('a', '2026-09-10T00:00:00Z', {
        paper_match: { ungrounded: gceAmP2Stamp, regrounded_key: 'am 2025 p2 gce', regrounded_at: '2026-09-10T12:00:00Z' },
        results: [{}],
      }),
    ];
    expect(groupMissingPapers(runs, new Set(), { now: NOW })).toEqual([]);
  });

  it('excludes a paper already held — same key the caller built from paper_library / bank rows', () => {
    const runs = [run('a', '2026-09-10T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] })];
    const held = new Set([missingPaperKey({ school: 'GCE', year: 2025, level: 'AM', paper: '2' })]);
    expect(groupMissingPapers(runs, held, { now: NOW })).toEqual([]);
  });

  it('holds match through a finer-grained library level (S3_AM) and a bare-digit run paper', () => {
    const runs = [
      run('a', '2026-09-10T00:00:00Z', {
        paper_match: { parsed: { exam: 'PRELIM', level: 'AM', year: 2026, paper: 2, school: 'Bedok South' } },
        grounding: { source: null },
        results: [{ question_found: false }],
      }),
    ];
    // The library files a school's own S4 A-Math prelim under the finer level
    // "S3_AM" (paper_library really does this — see docs/EXTRACTION-QUEUE.md).
    const held = new Set([missingPaperKey({ school: 'Bedok South', year: 2026, level: 'S3_AM', paper: 'p2' })]);
    expect(groupMissingPapers(runs, held, { now: NOW })).toEqual([]);
  });

  it('leaves a properly grounded run alone', () => {
    const runs = [
      run('a', '2026-09-10T00:00:00Z', {
        paper_match: { parsed: { exam: 'GCE', level: 'AM', year: 2025, paper: 2, school: null } },
        grounding: { source: 'bank' },
        results: [{ question_found: false }],
      }),
    ];
    expect(groupMissingPapers(runs, new Set(), { now: NOW })).toEqual([]);
  });

  it('drops a run outside the 7-day window', () => {
    const runs = [run('old', '2026-09-01T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] })];
    expect(groupMissingPapers(runs, new Set(), { now: NOW })).toEqual([]);
  });

  it('drops a run that names no paper at all', () => {
    const runs = [run('a', '2026-09-10T00:00:00Z', { paper_match: { ungrounded: {} }, results: [{}] })];
    expect(groupMissingPapers(runs, new Set(), { now: NOW })).toEqual([]);
  });
});

describe('missingPapersLine', () => {
  it('is null when there is nothing to report', () => {
    expect(missingPapersLine([])).toBeNull();
  });

  it('reads a single hand-in as "(1)" and multiple as "(N hand-ins)", joined with the CTA', () => {
    const groups = groupMissingPapers(
      [
        run('a', '2026-09-10T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] }),
        run('b', '2026-09-09T00:00:00Z', { paper_match: { ungrounded: gceAmP2Stamp }, results: [{}] }),
        run('c', '2026-09-08T00:00:00Z', xinminEmP1Prelim()),
      ],
      new Set(),
      { now: NOW },
    );
    expect(missingPapersLine(groups)).toBe(
      "📚 Papers named this week that we don't hold: GCE 2025 AM P2 (2 hand-ins), Xinmin 2026 EM Prelim P1 (1). Drop the question paper into the Extraction Inbox and those markings re-ground themselves.",
    );
  });
});

describe('missingPaperKey', () => {
  it('is comparable regardless of paper-number spelling ("p2" vs "2")', () => {
    expect(missingPaperKey({ school: 'GCE', year: 2025, level: 'AM', paper: 'p2' }))
      .toBe(missingPaperKey({ school: 'GCE', year: 2025, level: 'AM', paper: '2' }));
  });

  it('folds a school-specific level onto the family a run names', () => {
    expect(missingPaperKey({ school: 'Bedok South', year: 2026, level: 'S3_AM', paper: 'p1' }))
      .toBe(missingPaperKey({ school: 'Bedok South', year: 2026, level: 'AM', paper: '1' }));
    expect(missingPaperKey({ school: 'Kranji', year: 2021, level: 'EM_NA', paper: 'p2' }))
      .toBe(missingPaperKey({ school: 'Kranji', year: 2021, level: 'EM', paper: '2' }));
  });

  it('is case-insensitive on school', () => {
    expect(missingPaperKey({ school: 'gce', year: 2025, level: 'AM', paper: '1' }))
      .toBe(missingPaperKey({ school: 'GCE', year: 2025, level: 'AM', paper: '1' }));
  });
});
