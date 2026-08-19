import { describe, it, expect } from 'vitest';
import { dropboxPaperStem, dropboxPaperFolder, sgtDateStamp, dropboxPaperPath } from './dropbox-paper-path';

// 1 Jan 2026, 17:00 UTC = 2 Jan 2026, 01:00 SGT.
const LATE_NIGHT_SGT = Date.UTC(2026, 0, 1, 17, 0, 0);

describe('dropboxPaperStem', () => {
  it('keeps an ordinary paper name as typed', () => {
    expect(dropboxPaperStem('isabelle EM SJC PRELIM P1 2024')).toBe('isabelle EM SJC PRELIM P1 2024');
  });
  it('drops a trailing extension so the name is not "paper.pdf.pdf"', () => {
    expect(dropboxPaperStem('Chloe NVSS P2 AM.pdf')).toBe('Chloe NVSS P2 AM');
  });
  it('replaces characters Dropbox rejects and iOS hides', () => {
    expect(dropboxPaperStem('Term 2/3 review: P1 *draft*')).toBe('Term 2-3 review- P1 -draft-');
  });
  it('collapses runs of whitespace', () => {
    expect(dropboxPaperStem('  eva   em  prelim ')).toBe('eva em prelim');
  });
  it('falls back rather than producing an empty filename', () => {
    expect(dropboxPaperStem('')).toBe('marked paper');
    expect(dropboxPaperStem('   ')).toBe('marked paper');
    expect(dropboxPaperStem(null)).toBe('marked paper');
  });
  it('caps at 80 chars without leaving a trailing space before ".pdf"', () => {
    const stem = dropboxPaperStem('x'.repeat(79) + ' tail');
    expect(stem.length).toBeLessThanOrEqual(80);
    expect(stem.endsWith(' ')).toBe(false);
  });
});

describe('dropboxPaperFolder', () => {
  it('defaults to Marked Papers', () => {
    expect(dropboxPaperFolder(undefined)).toBe('Marked Papers');
    expect(dropboxPaperFolder('')).toBe('Marked Papers');
  });
  it('cannot be talked into escaping the folder', () => {
    expect(dropboxPaperFolder('../../Secret')).toBe('Secret');
    expect(dropboxPaperFolder('/etc')).toBe('etc');
  });
});

describe('sgtDateStamp', () => {
  it('stamps the Singapore day, not the UTC one', () => {
    expect(sgtDateStamp(LATE_NIGHT_SGT)).toBe('2026-01-02');
  });
});

describe('dropboxPaperPath', () => {
  it('builds the flat, date-prefixed path', () => {
    expect(dropboxPaperPath('alexis tkgs EM p1', undefined, Date.UTC(2026, 7, 19, 4, 0, 0)))
      .toBe('/Marked Papers/2026-08-19 alexis tkgs EM p1.pdf');
  });
  // THE point of this module: the auto-save and the 📁 button must agree on the
  // path, or the skip-if-already-there check silently stops working and every
  // rebuild leaves a " (1)" copy in the folder.
  it('is stable for the same paper on the same day', () => {
    const a = dropboxPaperPath('isabelle P2', 'Marked Papers', Date.UTC(2026, 7, 19, 1, 0, 0));
    const b = dropboxPaperPath('isabelle P2', undefined, Date.UTC(2026, 7, 19, 15, 0, 0));
    expect(a).toBe(b);
  });
});
