import { describe, it, expect } from 'vitest';
import { paperFileBase, paperFileNames } from './paper-filename';

const DOT = '\u00b7';

describe('paperFileBase', () => {
  it('flattens the label the UI shows', () => {
    expect(paperFileBase(`CJC 2025 ${DOT} JC2 ${DOT} P1 ${DOT} Prelim`)).toBe('CJC 2025 JC2 P1 Prelim');
  });

  it('replaces characters a filesystem will not take', () => {
    expect(paperFileBase('ACJC 2024 / JC2 : P1 ? Prelim')).toBe('ACJC 2024 - JC2 - P1 - Prelim');
  });

  it('never returns an empty name', () => {
    expect(paperFileBase('   ')).toBe('paper');
    expect(paperFileBase(`${DOT}${DOT}${DOT}`)).toBe('paper');
  });
});

describe('paperFileNames', () => {
  it('adds the extension and keeps order', () => {
    expect(paperFileNames([`CJC 2025 ${DOT} JC2 ${DOT} P1`, `CJC 2025 ${DOT} JC2 ${DOT} P2`]))
      .toEqual(['CJC 2025 JC2 P1.pdf', 'CJC 2025 JC2 P2.pdf']);
  });

  it('makes repeats distinct instead of overwriting them', () => {
    // The silent failure this exists for: same name twice in a zip = one file.
    const l = `CJC 2025 ${DOT} JC2 ${DOT} P1`;
    expect(paperFileNames([l, l, l]))
      .toEqual(['CJC 2025 JC2 P1.pdf', 'CJC 2025 JC2 P1 (2).pdf', 'CJC 2025 JC2 P1 (3).pdf']);
  });

  it('treats names differing only by case as the same file', () => {
    expect(new Set(paperFileNames(['cjc 2025', 'CJC 2025'])).size).toBe(2);
  });
});
