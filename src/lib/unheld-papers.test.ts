import { describe, it, expect } from 'vitest';
import { schemeHeld, unheldPapers, unheldLine } from './unheld-papers';

const run = (paper_name: string, grounding: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({
  paper_name, student_name: 'S', created_at: '2026-09-17T10:00:00Z', result_json: { grounding, ...extra },
});

describe('schemeHeld', () => {
  it('held: extracted / approved scheme, bank allocation, or a trusted attached match', () => {
    expect(schemeHeld(run('a', { scheme: { status: 'extracted' } }))).toBe(true);
    expect(schemeHeld(run('a', { scheme: { status: 'approved' } }))).toBe(true);
    expect(schemeHeld(run('a', { scheme: { status: 'derived' }, allocation: 'bank' }))).toBe(true);
    expect(schemeHeld(run('a', { source: 'attached' }, { paper_match: { trusted: true } }))).toBe(true);
  });

  it('not held: the answers the student attached at hand-in ground one run only (24 Sep 2026)', () => {
    expect(schemeHeld(run('a', { source: 'attached', attached_by: 'student' }, { paper_match: { trusted: true } }))).toBe(false);
  });
  it('not held: a derived scheme from the page, or no stamp at all', () => {
    expect(schemeHeld(run('a', { scheme: { status: 'derived' }, allocation: 'page' }))).toBe(false);
    expect(schemeHeld(run('a', null))).toBe(false);
  });
});

describe('unheldPapers / unheldLine', () => {
  it('groups unheld runs by paper, most markings first, and skips Practice Again and held papers', () => {
    const list = unheldPapers([
      run('2022 Emath Paper 1', { scheme: { status: 'derived' }, allocation: 'page' }),
      run('2022 EMATH paper 1', { scheme: { status: 'derived' }, allocation: 'page' }),
      run('cchms prelim 2025 p2', null),
      run('EMATH Practice Again 2', null),
      run('gce 2023 em p1', { scheme: { status: 'extracted' } }),
    ]);
    expect(list.map(p => [p.name, p.runs])).toEqual([['2022 Emath Paper 1', 2], ['cchms prelim 2025 p2', 1]]);
    expect(unheldLine(list)).toMatch(/^📐 Marked this week WITHOUT a scheme we hold: 2 papers — 2022 Emath Paper 1 \(2 markings\); cchms prelim 2025 p2 \(1 marking\)\./);
    expect(unheldLine([])).toBe('');
  });
});
