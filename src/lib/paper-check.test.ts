import { describe, expect, it } from 'vitest';
import {
  PAPER_MISSING_WHY, QUIET, looksLikeNamedPaper, paperMissingNotice, shapePaperCheck,
} from './paper-check';
import { isUngroundedTotal } from './paper-total-text';

describe('shapePaperCheck — only an explicit "we do not have it" may raise the notice', () => {
  it('passes a real missing-paper answer through', () => {
    expect(shapePaperCheck({
      named: true, available: false, via: null,
      label: 'GCE 2025 A Math Paper 2', key: 'gce 2025 am p2',
      expectedFile: 'AM GCE 2025 Paper 2.pdf', reason: 'none',
    })).toEqual({
      named: true, available: false, via: null,
      label: 'GCE 2025 A Math Paper 2', key: 'gce 2025 am p2',
    });
  });

  it('keeps the rung that answered when we DO have it', () => {
    const r = shapePaperCheck({ named: true, available: true, via: 'library', label: 'GCE 2024 E Math Paper 1', key: 'gce 2024 em p1' });
    expect(r.available).toBe(true);
    expect(r.via).toBe('library');
  });

  it('a bot that never heard of the phase (400 body, junk, null) stays silent', () => {
    // The pre-deploy shape: webchat 400s an unknown phase with {error}.
    expect(shapePaperCheck({ error: 'pdfBase64 required' })).toEqual(QUIET);
    expect(shapePaperCheck(null)).toEqual(QUIET);
    expect(shapePaperCheck('nope')).toEqual(QUIET);
    expect(shapePaperCheck({ named: 'true', available: false })).toEqual(QUIET);
    expect(shapePaperCheck({})).toEqual(QUIET);
  });

  it('a named answer with a missing `available` is read as available', () => {
    // Silence is the safe reading — never ask for pages on a shape we do not know.
    expect(shapePaperCheck({ named: true }).available).toBe(true);
  });
});

describe('looksLikeNamedPaper — which typed names are worth a round trip', () => {
  it('a paper name carries a year', () => {
    expect(looksLikeNamedPaper('isabelle TYS AM 2025 P2')).toBe(true);
    expect(looksLikeNamedPaper('Xinmin 2021 Prelim P2')).toBe(true);
    expect(looksLikeNamedPaper('h2 tys 2022 p1')).toBe(true);
  });

  it('half a name, a topical sheet or a bare start costs no call', () => {
    expect(looksLikeNamedPaper('')).toBe(false);
    expect(looksLikeNamedPaper('Xin')).toBe(false);
    expect(looksLikeNamedPaper('differentiation worksheet')).toBe(false);
    expect(looksLikeNamedPaper('set 3 p1')).toBe(false);
  });
});

describe('the copy', () => {
  it('names the paper, asks for the printed pages, and says what it costs not to', () => {
    const s = paperMissingNotice('GCE 2025 A Math Paper 2');
    expect(s).toContain('GCE 2025 A Math Paper 2');
    expect(s).toContain('add photos of the question paper');
    expect(s).toContain('more accurate marking');
    expect(s).not.toMatch(/don.t have|we do not have|yet\b/i);
  });

  it('degrades to "this paper" rather than an empty gap', () => {
    expect(paperMissingNotice(null)).toContain('No questions detected for this paper.');
    expect(paperMissingNotice('   ')).toContain('No questions detected for this paper.');
  });

  it('says "app", never "portal" (student-facing copy rule)', () => {
    for (const s of [paperMissingNotice('GCE 2025 A Math Paper 2'), PAPER_MISSING_WHY]) {
      expect(s.toLowerCase()).not.toContain('portal');
    }
  });

  it('the Why? line says the printed marks come straight off the page', () => {
    expect(PAPER_MISSING_WHY).toContain('come straight off the page');
  });
});

// The hint asks for two photographs and promises something in return: that the
// marks come off the paper rather than out of the marking's reading of the
// working. This pins the promise — the cover must go quiet for a paper whose
// printed brackets were all read, even though nothing we HOLD ever grounded it.
describe('what photographing the question pages actually buys', () => {
  it('an ungrounded paper whose brackets were all read keeps a clean cover', () => {
    expect(isUngroundedTotal({ groundingSource: null, maxSource: 'registry', countedMax: 90, max: 90 })).toBe(false);
    // …and when those re-read brackets became the denominator themselves.
    expect(isUngroundedTotal({ groundingSource: null, maxSource: 'brackets', countedMax: 88, max: 88 })).toBe(false);
  });

  it('the case the hint exists to prevent still warns', () => {
    // Isabelle: pages of working only, 73 of the paper's 90 marks ever located.
    expect(isUngroundedTotal({ groundingSource: null, maxSource: 'registry', countedMax: 73, max: 90 })).toBe(true);
  });
});
