import { describe, it, expect } from 'vitest';
import { rollupSolution } from './solution-rollup';

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
