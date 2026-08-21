import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORKSHEET_COUNT,
  MAX_WORKSHEET_COUNT,
  LEVEL_ALIASES,
  resolveLevelKey,
  validLevels,
  clampCount,
  matchTopic,
  worksheetTitle,
  slugify,
  drawFingerprint,
  worksheetBlobPath,
  worksheetFilename,
  protectWorksheetHtml,
  restoreWorksheetHtml,
} from './bot-worksheet';
import { SEED_LEVELS } from './kiosk-pool';

describe('resolveLevelKey', () => {
  it('maps the bot-facing questions.level values onto kiosk tokens', () => {
    expect(resolveLevelKey('S3_AM')).toBe('AM');
    expect(resolveLevelKey('S3_EM')).toBe('EM');
    expect(resolveLevelKey('JC1')).toBe('JC2');
    expect(resolveLevelKey('S1')).toBe('S1');
  });
  it('accepts the kiosk tokens themselves', () => {
    expect(resolveLevelKey('AM')).toBe('AM');
    expect(resolveLevelKey('JC2')).toBe('JC2');
  });
  it('is case- and separator-insensitive', () => {
    expect(resolveLevelKey('s3-am')).toBe('AM');
    expect(resolveLevelKey('  s3 am ')).toBe('AM');
    expect(resolveLevelKey('a math')).toBe('AM');
  });
  it('returns null for anything unknown (the 400 path)', () => {
    expect(resolveLevelKey('P6')).toBeNull();
    expect(resolveLevelKey('')).toBeNull();
    expect(resolveLevelKey(null)).toBeNull();
    expect(resolveLevelKey(undefined)).toBeNull();
  });
  it('never resolves to a level the pool cannot serve', () => {
    for (const key of Object.values(LEVEL_ALIASES)) {
      expect(Object.keys(SEED_LEVELS)).toContain(key);
    }
  });
  it('accepts every questions.level value SEED_LEVELS declares servable', () => {
    // Regression guard: SEED_LEVELS gains 'S4_AM' one day and the bot 400s on
    // it forever unless this map moves too. The two are inverses.
    for (const [kioskKey, questionLevels] of Object.entries(SEED_LEVELS)) {
      for (const lvl of questionLevels) {
        expect(resolveLevelKey(lvl)).toBe(kioskKey);
      }
    }
  });
  it('lists its accepted spellings for the 400 body', () => {
    expect(validLevels()).toContain('S3_AM');
    expect(validLevels()).toContain('JC2');
  });
});

describe('clampCount', () => {
  it('defaults to 8', () => {
    expect(clampCount(undefined)).toBe(DEFAULT_WORKSHEET_COUNT);
    expect(clampCount(null)).toBe(8);
    expect(clampCount('banana')).toBe(8);
  });
  it('caps at 12 — the sheet must stay a sitting, not a paper', () => {
    expect(clampCount(12)).toBe(12);
    expect(clampCount(13)).toBe(MAX_WORKSHEET_COUNT);
    expect(clampCount(9999)).toBe(12);
  });
  it('floors at 1', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-4)).toBe(1);
  });
  it('accepts numeric strings and truncates fractions', () => {
    expect(clampCount('6')).toBe(6);
    expect(clampCount(6.9)).toBe(6);
  });
});

describe('matchTopic', () => {
  const TOPICS = ['Binomial Theorem', 'Differentiation (Techniques)', 'Trigonometry (Graphs)'];

  it('prefers an exact match', () => {
    expect(matchTopic('Binomial Theorem', TOPICS)).toBe('Binomial Theorem');
  });
  it('forgives case, spacing and punctuation', () => {
    expect(matchTopic('binomial theorem', TOPICS)).toBe('Binomial Theorem');
    expect(matchTopic('differentiation techniques', TOPICS)).toBe('Differentiation (Techniques)');
    expect(matchTopic('  Trigonometry  Graphs ', TOPICS)).toBe('Trigonometry (Graphs)');
  });
  it('returns the CANONICAL spelling, never the caller’s', () => {
    expect(matchTopic('DIFFERENTIATION-TECHNIQUES', TOPICS)).toBe('Differentiation (Techniques)');
  });
  it('returns null for an unknown or empty topic', () => {
    expect(matchTopic('Vectors', TOPICS)).toBeNull();
    expect(matchTopic('', TOPICS)).toBeNull();
    expect(matchTopic('   ', TOPICS)).toBeNull();
    expect(matchTopic('!!!', TOPICS)).toBeNull();
  });
});

describe('titles, slugs and paths', () => {
  it('titles with the human level label, not the token', () => {
    expect(worksheetTitle('A Math', 'Binomial Theorem'))
      .toBe('AdrianMath Practice — A Math · Binomial Theorem');
  });
  it('slugifies topics safely', () => {
    expect(slugify('Differentiation (Techniques)')).toBe('differentiation-techniques');
    expect(slugify('!!!')).toBe('sheet');
  });
  it('builds a stable per-day blob path (same request → same url)', () => {
    const args = { date: '2026-08-22', levelKey: 'AM', topic: 'Binomial Theorem', tier: null, count: 2, answers: false, questionIds: ['a', 'b'] };
    expect(worksheetBlobPath(args)).toMatch(/^bot-worksheets\/2026-08-22\/am-binomial-theorem-mixed-q2-noans-[a-z0-9]+\.pdf$/);
    expect(worksheetBlobPath(args)).toBe(worksheetBlobPath({ ...args }));
  });
  it('separates answer / no-answer and tier variants', () => {
    const base = { date: '2026-08-22', levelKey: 'AM', topic: 'Circles', tier: 'advanced', count: 2, answers: true, questionIds: ['a', 'b'] };
    expect(worksheetBlobPath(base)).toContain('/am-circles-advanced-q2-ans-');
    expect(worksheetBlobPath({ ...base, answers: false })).not.toBe(worksheetBlobPath(base));
  });
  it('changes path when the DRAW changes — a cached CDN copy can never contradict questionIds', () => {
    const base = { date: '2026-08-22', levelKey: 'AM', topic: 'Circles', tier: null, count: 2, answers: false, questionIds: ['a', 'b'] };
    expect(worksheetBlobPath({ ...base, questionIds: ['a', 'c'] })).not.toBe(worksheetBlobPath(base));
    // Order matters: Q1 and Q2 swapped is a different sheet.
    expect(worksheetBlobPath({ ...base, questionIds: ['b', 'a'] })).not.toBe(worksheetBlobPath(base));
  });
  it('fingerprints deterministically', () => {
    expect(drawFingerprint(['a', 'b'])).toBe(drawFingerprint(['a', 'b']));
    expect(drawFingerprint(['a', 'b'])).not.toBe(drawFingerprint(['b', 'a']));
    expect(drawFingerprint([])).toMatch(/^[a-z0-9]+$/);
  });
  it('names the download file readably', () => {
    expect(worksheetFilename('AM', 'Binomial Theorem', '2026-08-22')).toBe('AM-binomial-theorem-2026-08-22.pdf');
  });
});

describe('protectWorksheetHtml / restoreWorksheetHtml', () => {
  it('round-trips the right-aligned marks span flattenParts emits', () => {
    const md = '**(a)** Find $x$. <span class="ws-mk">[3]</span>';
    const { src, stash } = protectWorksheetHtml(md);
    expect(src).not.toContain('<span');
    expect(restoreWorksheetHtml(src, stash)).toBe(md);
  });
  it('round-trips the marks-proportional working-space div', () => {
    const md = '<div class="ws-sp" style="height:51mm"></div>';
    const { src, stash } = protectWorksheetHtml(md);
    expect(src).toBe('@@WSH0@@');
    expect(restoreWorksheetHtml(src, stash)).toBe(md);
  });
  it('turns markdown figures into house-style <img> (they used to print as literal text)', () => {
    const { src, stash } = protectWorksheetHtml('![diagram](https://x.test/a.png)');
    expect(src).toBe('@@WSH0@@');
    expect(restoreWorksheetHtml(src, stash))
      .toBe('<img class="ws-figure" src="https://x.test/a.png" alt="diagram">');
  });
  it('escapes attribute-breaking characters in figure urls', () => {
    const { src, stash } = protectWorksheetHtml('![a"b](https://x.test/a.png?q="1")');
    const html = restoreWorksheetHtml(src, stash);
    expect(html).toContain('&quot;');
    // The raw quote must not close the attribute early.
    expect(html).toBe('<img class="ws-figure" src="https://x.test/a.png?q=&quot;1&quot;" alt="a&quot;b">');
  });
  it('uses tokens that survive HTML-escaping and markdown emphasis', () => {
    const { src } = protectWorksheetHtml('<span class="ws-mk">[2]</span>');
    expect(src).toMatch(/^@@WSH\d+@@$/); // no <, >, ", *, _ to be mangled
  });
  it('handles several fragments in one question, in order', () => {
    const md = 'stem\n\n![d](a.png)\n\n**(a)** go <span class="ws-mk">[2]</span>\n\n<div class="ws-sp" style="height:36mm"></div>';
    const { src, stash } = protectWorksheetHtml(md);
    expect(stash).toHaveLength(3);
    expect(restoreWorksheetHtml(src, stash)).toContain('<img class="ws-figure" src="a.png"');
    expect(restoreWorksheetHtml(src, stash)).toContain('<span class="ws-mk">[2]</span>');
    expect(restoreWorksheetHtml(src, stash)).toContain('style="height:36mm"');
  });
  it('leaves untouched text alone', () => {
    const md = 'Solve $x^2 - 5x + 6 = 0$.';
    const { src, stash } = protectWorksheetHtml(md);
    expect(src).toBe(md);
    expect(stash).toHaveLength(0);
    expect(restoreWorksheetHtml(src, stash)).toBe(md);
  });
});
