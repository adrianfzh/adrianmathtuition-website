import { describe, it, expect } from 'vitest';
import { RUNS_PAGE, RUNS_REFRESH_MAX, refreshLimit, mergeRunsPage } from './runs-list';
import { withInMotion } from './runs-list';

const row = (id: string) => ({ id, created_at: id });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('refreshLimit — a refresh re-fetches what is on screen (10 Sep 2026)', () => {
  it('is one page when nothing or less than a page is loaded', () => {
    expect(refreshLimit(0)).toBe(RUNS_PAGE);
    expect(refreshLimit(10)).toBe(RUNS_PAGE);
    expect(refreshLimit(25)).toBe(RUNS_PAGE);
  });
  it('grows with the loaded window', () => {
    expect(refreshLimit(50)).toBe(50);
    expect(refreshLimit(75)).toBe(75);
  });
  it("stops at the bot's cap", () => {
    expect(refreshLimit(125)).toBe(RUNS_REFRESH_MAX);
  });
  it('shrugs off nonsense', () => {
    expect(refreshLimit(NaN)).toBe(RUNS_PAGE);
    expect(refreshLimit(-3)).toBe(RUNS_PAGE);
  });
});

describe('mergeRunsPage — the regression: loaded rows must not vanish on refresh', () => {
  const page1 = ['a', 'b', 'c'].map(row);
  const page2 = ['d', 'e'].map(row);

  it('Load more appends after page one', () => {
    expect(ids(mergeRunsPage(page1, page2, page1.length))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('a refresh that only brings page one KEEPS the rows Load more added (the 10 Sep 2026 bug)', () => {
    const loaded = mergeRunsPage(page1, page2, 3);
    const refreshed = mergeRunsPage(loaded, page1, 0);
    expect(ids(refreshed)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('a refresh replaces the rows it re-fetched with the fresh copies', () => {
    const loaded = [{ id: 'a', created_at: 'a', total_max: null as number | null }, { id: 'b', created_at: 'b', total_max: null }];
    const fresh = [{ id: 'a', created_at: 'a', total_max: 90 }];
    const out = mergeRunsPage(loaded, fresh, 0);
    expect(out[0].total_max).toBe(90);
    expect(ids(out)).toEqual(['a', 'b']);
  });

  it('a run that landed since the last load leads the refreshed list, nothing repeats', () => {
    const loaded = mergeRunsPage(page1, page2, 3);
    const fresh = ['new', 'a', 'b', 'c', 'd'].map(row);
    expect(ids(mergeRunsPage(loaded, fresh, 0))).toEqual(['new', 'a', 'b', 'c', 'd', 'e']);
  });

  it('Load more after a new run shifted the offset does not repeat the boundary row', () => {
    const loaded = ['new', 'a', 'b'].map(row);
    const nextPage = ['b', 'c', 'd'].map(row); // offset 3 now lands one row early
    expect(ids(mergeRunsPage(loaded, nextPage, 3))).toEqual(['new', 'a', 'b', 'c', 'd']);
  });

  it('an empty refresh keeps what was there', () => {
    expect(ids(mergeRunsPage(page1, [], 0))).toEqual(['a', 'b', 'c']);
  });
});

describe('withInMotion — re-marks of older papers ride ahead of the dated window', () => {
  it('puts in-motion rows first and never duplicates one the window already has', () => {
    const recent = [{ id: 'new' }, { id: 'eva' }];
    const inMotion = [{ id: 'eva' }, { id: 'joey-9sep' }];
    expect(withInMotion(recent, inMotion).map(r => r.id)).toEqual(['joey-9sep', 'new', 'eva']);
  });
  it('is the dated list when nothing is in motion', () => {
    expect(withInMotion([{ id: 'a' }], []).map(r => r.id)).toEqual(['a']);
  });
});
