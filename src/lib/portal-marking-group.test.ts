import { describe, it, expect } from 'vitest';
import { groupPracticeAgain } from './portal-marking-group';

const P = (id: string) => ({ id });

describe('groupPracticeAgain — a marked Practice Again sheet nests under its paper', () => {
  it('moves the sheet run under the paper and out of the top list', () => {
    const papers = [P('sheet-run'), P('paper-run'), P('other')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, [
      { source_run_id: 'paper-run', run_id: 'sheet-run', status: 'marked' },
    ]);
    expect(top.map(p => p.id)).toEqual(['paper-run', 'other']);
    expect(markedSheetByParent.get('paper-run')?.id).toBe('sheet-run');
  });

  it('keeps the sheet run at the top level when its paper is not listed', () => {
    const papers = [P('sheet-run'), P('other')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, [
      { source_run_id: 'gated-paper', run_id: 'sheet-run', status: 'marked' },
    ]);
    expect(top.map(p => p.id)).toEqual(['sheet-run', 'other']);
    expect(markedSheetByParent.size).toBe(0);
  });

  it('ignores sheets that are not marked yet, or have no run', () => {
    const papers = [P('paper-run'), P('x')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, [
      { source_run_id: 'paper-run', run_id: null, status: 'assigned' },
      { source_run_id: 'paper-run', run_id: 'x', status: 'submitted' },
    ]);
    expect(top.map(p => p.id)).toEqual(['paper-run', 'x']);
    expect(markedSheetByParent.size).toBe(0);
  });

  it('never nests a run under itself and takes the first sheet per paper', () => {
    const papers = [P('a'), P('b'), P('c')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, [
      { source_run_id: 'a', run_id: 'a', status: 'marked' },
      { source_run_id: 'a', run_id: 'b', status: 'marked' },
      { source_run_id: 'a', run_id: 'c', status: 'marked' },
    ]);
    expect(top.map(p => p.id)).toEqual(['a', 'c']);
    expect(markedSheetByParent.get('a')?.id).toBe('b');
  });

  it('is a no-op with no sheets', () => {
    const papers = [P('a')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, []);
    expect(top).toEqual(papers);
    expect(markedSheetByParent.size).toBe(0);
  });
});

// ── Batch sheets (10 Sep 2026): reachable from every paper they cover ────────
describe('groupPracticeAgain — a batch sheet nests under every paper it covers', () => {
  it('lists the marked sheet run once and maps each covered paper to it', () => {
    const papers = [P('sheet-run'), P('p-new'), P('p-mid'), P('p-old'), P('other')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, [
      { source_run_id: 'p-new', source_run_ids: ['p-new', 'p-mid', 'p-old'], run_id: 'sheet-run', status: 'marked' },
    ]);
    expect(top.map(p => p.id)).toEqual(['p-new', 'p-mid', 'p-old', 'other']);
    expect(markedSheetByParent.get('p-new')?.id).toBe('sheet-run');
    expect(markedSheetByParent.get('p-mid')?.id).toBe('sheet-run');
    expect(markedSheetByParent.get('p-old')?.id).toBe('sheet-run');
    expect(markedSheetByParent.has('other')).toBe(false);
  });
  it('a covered paper that is not listed is simply skipped', () => {
    const papers = [P('sheet-run'), P('p-mid')];
    const { top, markedSheetByParent } = groupPracticeAgain(papers, [
      { source_run_id: 'p-new', source_run_ids: ['p-new', 'p-mid'], run_id: 'sheet-run', status: 'marked' },
    ]);
    expect(top.map(p => p.id)).toEqual(['p-mid']);
    expect(markedSheetByParent.get('p-mid')?.id).toBe('sheet-run');
  });
});
