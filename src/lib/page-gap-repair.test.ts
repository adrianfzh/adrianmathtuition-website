import { describe, it, expect } from 'vitest';
import {
  gapsForRun, gapPageNumbers, gapPagesText, gapWatchReason, pageGapAlert,
  alreadyReported, gapCheckStamp, repairPageGaps, type GapRunRow,
} from './page-gap-repair';

/** A run shaped like Alexis Wong's: 17 pages in, four annotated images lost. */
function runWith(missing: number[], pages = 17) {
  const source = { photos: Array.from({ length: pages }, (_, i) => ({ photo_index: i, original_url: `https://www.adrianmathtuition.com/api/files/o-${i}.jpg` })) };
  const annotated_photos = Array.from({ length: pages }, (_, i) => ({ photo_index: i, url: `https://www.adrianmathtuition.com/api/files/a-${i}.jpg` }))
    .filter(a => !missing.includes(a.photo_index));
  return { source, annotated_photos };
}

describe('gapsForRun', () => {
  it('finds the pages with no marked image, in page order', () => {
    const gaps = gapsForRun(runWith([9, 4, 6, 7]));
    expect(gapPageNumbers(gaps)).toEqual([5, 7, 8, 10]);
    expect(gaps[0].url).toContain('o-4.jpg');
  });

  it('is empty for a complete run, and for a run it cannot read', () => {
    expect(gapsForRun(runWith([]))).toEqual([]);
    expect(gapsForRun(null)).toEqual([]);
    expect(gapsForRun({ results: [] })).toEqual([]);
  });
});

describe('the words', () => {
  it('lists pages the way a person says them', () => {
    expect(gapPagesText(gapsForRun(runWith([4])))).toBe('5');
    expect(gapPagesText(gapsForRun(runWith([4, 6])))).toBe('5 and 7');
    expect(gapPagesText(gapsForRun(runWith([4, 6, 7, 9])))).toBe('5, 7, 8 and 10');
    expect(gapPagesText([])).toBe('');
  });

  it('watch-out says what the student will actually see, and nothing at all when clean', () => {
    expect(gapWatchReason([])).toBeNull();
    expect(gapWatchReason(gapsForRun(runWith([4])))).toBe(
      "page 5 has no marked image — the student's own photo of it is in the copy instead");
    expect(gapWatchReason(gapsForRun(runWith([4, 6])))).toContain('pages 5 and 7 have no marked image');
  });

  it('the alert names the student, the pages and what to do about it', () => {
    const line = pageGapAlert({
      studentName: 'Alexis Wong', paperName: 'A Math GCE 2022 Paper 1',
      gaps: gapsForRun(runWith([4, 6, 7, 9])), released: true,
      deskUrl: 'https://www.adrianmathtuition.com/admin/desk?run=94326fea',
    });
    expect(line).toContain('Alexis Wong');
    expect(line).toContain('pages 5, 7, 8 and 10');
    expect(line).toContain('already has this copy');
    expect(line).toContain('/admin/desk?run=94326fea');
    // An unreleased paper is the other half of the same sentence.
    expect(pageGapAlert({ studentName: null, paperName: null, gaps: gapsForRun(runWith([4])), released: false, deskUrl: 'x' }))
      .toContain('before this goes out');
  });
});

describe('alreadyReported', () => {
  const gaps = gapsForRun(runWith([4, 6]));
  it('is false the first time, true for the same pages again', () => {
    expect(alreadyReported({}, gaps)).toBe(false);
    expect(alreadyReported({ page_gap_check: { reported: [4, 6] } }, gaps)).toBe(true);
    expect(alreadyReported({ page_gap_check: { reported: [6, 4] } }, gaps)).toBe(true);
  });
  it('speaks up again when the gap set changed', () => {
    expect(alreadyReported({ page_gap_check: { reported: [4] } }, gaps)).toBe(false);
    expect(alreadyReported({ page_gap_check: { reported: [4, 6, 9] } }, gaps)).toBe(false);
  });
  it('a run stamped clean and now broken is reported', () => {
    expect(alreadyReported({ page_gap_check: { reported: [] } }, gaps)).toBe(false);
  });
});

describe('gapCheckStamp', () => {
  it('records what happened, and keeps errors only when there were any', () => {
    const s = gapCheckStamp({ attempted: 4, repaired: 3, remaining: gapsForRun(runWith([6])), errors: [] }, 'T');
    expect(s).toEqual({ at: 'T', attempted: 4, repaired: 3, reported: [6] });
    expect(gapCheckStamp({ attempted: 1, repaired: 0, remaining: [], errors: ['page 7: boom'] }, 'T')).toHaveProperty('errors', ['page 7: boom']);
  });
});

describe('repairPageGaps', () => {
  const base = { origin: 'https://www.adrianmathtuition.com', headers: { Authorization: 'Bearer x' } };
  const row = (rj: unknown, released: string | null = null): GapRunRow =>
    ({ id: 'r1', student_name: 'Alexis Wong', paper_name: 'A Math GCE 2022 Paper 1', released_at: released, result_json: rj });

  it('redraws each missing page once, with the re-issue OFF, and re-checks the run', async () => {
    const calls: Record<string, unknown>[] = [];
    const reads = [row(runWith([4, 6])), row(runWith([]))];
    const out = await repairPageGaps('r1', {
      ...base,
      readRun: async () => reads.shift() ?? row(runWith([])),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ reinked: true }) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(calls.map(c => c.photoIndex)).toEqual([4, 6]);
    expect(calls.every(c => c.reissue === false)).toBe(true);
    expect(calls.every(c => !('allowReleased' in c))).toBe(true);
    expect(out).toMatchObject({ attempted: 2, repaired: 2, remaining: [], errors: [] });
  });

  it('does nothing at all to a clean run', async () => {
    let fetched = 0;
    const out = await repairPageGaps('r1', {
      ...base,
      readRun: async () => row(runWith([])),
      fetchImpl: (async () => { fetched++; return { ok: true, json: async () => ({}) } as Response; }) as unknown as typeof fetch,
    });
    expect(fetched).toBe(0);
    expect(out).toEqual({ attempted: 0, repaired: 0, remaining: [], errors: [] });
  });

  it('reports a page that would not redraw, and still counts the ones that did', async () => {
    const reads = [row(runWith([4, 6])), row(runWith([6]))];
    const out = await repairPageGaps('r1', {
      ...base,
      readRun: async () => reads.shift() ?? row(runWith([6])),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        const b = JSON.parse(String(init.body));
        return b.photoIndex === 6
          ? { ok: false, status: 400, json: async () => ({ error: 'no part-level marks on page 7 to draw from' }) } as Response
          : { ok: true, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(out.attempted).toBe(2);
    expect(out.repaired).toBe(1);
    expect(gapPageNumbers(out.remaining)).toEqual([7]);
    expect(out.errors).toEqual(['page 7: no part-level marks on page 7 to draw from']);
  });

  it('leaves a released copy alone unless explicitly allowed — and then says so', async () => {
    let fetched = 0;
    const out = await repairPageGaps('r1', {
      ...base,
      readRun: async () => row(runWith([4]), '2026-09-10T13:11:52Z'),
      fetchImpl: (async () => { fetched++; return { ok: true, json: async () => ({}) } as Response; }) as unknown as typeof fetch,
    });
    expect(fetched).toBe(0);
    expect(out.skipped).toContain('already has this copy');
    expect(gapPageNumbers(out.remaining)).toEqual([5]);

    const reads = [row(runWith([4]), '2026-09-10T13:11:52Z'), row(runWith([]), '2026-09-10T13:11:52Z')];
    const bodies: Record<string, unknown>[] = [];
    const allowed = await repairPageGaps('r1', {
      ...base, allowReleased: true,
      readRun: async () => reads.shift() ?? row(runWith([]), 'x'),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(bodies[0]).toMatchObject({ allowReleased: true, reissue: false });
    expect(allowed.repaired).toBe(1);
  });

  it('stops starting redraws when the budget is spent, and never leaves one half-done', async () => {
    let t = 0;
    const calls: number[] = [];
    const out = await repairPageGaps('r1', {
      ...base,
      budgetMs: 30_000,
      now: () => t,
      readRun: async () => row(runWith([1, 3, 5, 7])),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)).photoIndex);
        t += 20_000;
        return { ok: true, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(calls).toEqual([1, 3]);
    expect(out.errors[0]).toContain('out of time');
    expect(gapPageNumbers(out.remaining)).toEqual([2, 4, 6, 8]);
  });

  it('caps the pages it will take on in one pass', async () => {
    const calls: number[] = [];
    const out = await repairPageGaps('r1', {
      ...base, limit: 2,
      readRun: async () => row(runWith([0, 1, 2, 3])),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)).photoIndex);
        return { ok: true, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(calls).toEqual([0, 1]);
    expect(out.attempted).toBe(2);
  });

  it('never throws — a missing run and a dead database are outcomes', async () => {
    expect((await repairPageGaps('r1', { ...base, readRun: async () => null })).skipped).toBe('run not found');
    const boom = await repairPageGaps('r1', { ...base, readRun: async () => { throw new Error('supabase down'); } });
    expect(boom.skipped).toBe('failed');
    expect(boom.errors).toEqual(['supabase down']);
  });
});
