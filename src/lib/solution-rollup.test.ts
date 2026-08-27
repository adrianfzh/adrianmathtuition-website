import { describe, it, expect } from 'vitest';
import { rollupSolution, rollupAnswer } from './solution-rollup';

describe('rollupSolution', () => {
  it('top-level solution wins when present', () => {
    expect(rollupSolution('  full text  ', [{ label: '(a)', solution: 'part text' }])).toBe('full text');
  });

  it('stitches labelled part solutions when top level is null (the dedup case)', () => {
    const parts = [
      { label: '(a)', solution: 'First part.' },
      { label: '(b)', solution: 'Second part.' },
    ];
    expect(rollupSolution(null, parts)).toBe('(a) First part.\n\n(b) Second part.');
  });

  it('walks subparts with compounded labels', () => {
    const parts = [
      { label: '(a)', subparts: [
        { label: '(i)', solution: 'Sub one.' },
        { label: '(ii)', solution: 'Sub two.' },
      ] },
    ];
    expect(rollupSolution('', parts)).toBe('(a)(i) Sub one.\n\n(a)(ii) Sub two.');
  });

  it('skips parts without solutions and survives garbage', () => {
    expect(rollupSolution(null, [{ label: '(a)' }, null, 42, 'x', { solution: 'ok' }])).toBe('ok');
    expect(rollupSolution(null, 'not an array')).toBe('');
    expect(rollupSolution(undefined, undefined)).toBe('');
  });
});

// ── rollupAnswer (added 2026-08-27 with the render-revise fix) ───────────────
// 3,981 rows carry their answer ONLY in parts; a reader trusting the top-level
// column alone shows those students nothing.
describe('rollupAnswer', () => {
  it('prefers a present top-level answer', () => {
    expect(rollupAnswer('  x = 5  ', [{ label: '(a)', answer: '9' }])).toBe('x = 5');
  });

  it('stitches part answers inline with their labels', () => {
    expect(rollupAnswer(null, [
      { label: '(a)', answer: '5' },
      { label: '(b)', answer: '12' },
    ])).toBe('(a) 5   (b) 12');
  });

  it('compounds subpart labels', () => {
    expect(rollupAnswer('', [
      { label: '(a)', subparts: [{ label: '(i)', answer: '3' }, { label: '(ii)', answer: '4' }] },
    ])).toBe('(a)(i) 3   (a)(ii) 4');
  });

  it('skips parts with no answer, keeps the rest', () => {
    expect(rollupAnswer(null, [
      { label: '(a)', answer: '' },
      { label: '(b)', answer: '7' },
    ])).toBe('(b) 7');
  });

  it('returns empty when there is nothing anywhere, and tolerates junk', () => {
    expect(rollupAnswer(null, null)).toBe('');
    expect(rollupAnswer(undefined, 'not an array')).toBe('');
    expect(rollupAnswer(null, [null, 42, { answer: 5 }])).toBe('');
  });
});
