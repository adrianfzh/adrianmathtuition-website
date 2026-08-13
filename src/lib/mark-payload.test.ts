import { describe, it, expect } from 'vitest';
import { INLINE_BODY_LIMIT, markInlineBytes, canMarkFromStored } from './mark-payload';

const b64 = (bytes: number) => ({ base64: 'x'.repeat(bytes) });

describe('markInlineBytes', () => {
  it('sums the pdf and every image', () => {
    expect(markInlineBytes('x'.repeat(100), [b64(40), b64(60)])).toBe(200);
  });

  it('a paper without a question pdf counts images only', () => {
    expect(markInlineBytes(null, [b64(70)])).toBe(70);
  });

  it('regression: the 25-page phone-photographed prelim is over the limit (13 Aug 2026)', () => {
    // 25 camera pages at ~300KB of base64 each — the real shape of the paper
    // that 413'd at Vercel's 4.5MB platform cap.
    const pages = Array.from({ length: 25 }, () => b64(300 * 1024));
    expect(markInlineBytes(null, pages)).toBeGreaterThan(INLINE_BODY_LIMIT);
  });

  it('a typical small paper stays inline', () => {
    const pages = Array.from({ length: 10 }, () => b64(150 * 1024));
    expect(markInlineBytes(null, pages)).toBeLessThan(INLINE_BODY_LIMIT);
  });
});

describe('canMarkFromStored', () => {
  const complete = {
    pendingId: 'run-1',
    originalUrls: ['https://blob/a.jpg', 'https://blob/b.jpg'],
    decoded: [true, true],
    hasPaperPdf: false,
    paperPdfUrl: null,
  };

  it('a fully saved run qualifies', () => {
    expect(canMarkFromStored(complete)).toBe(true);
  });

  it('no pending row — the save failed — means inline is the only path', () => {
    expect(canMarkFromStored({ ...complete, pendingId: null })).toBe(false);
  });

  it('a page whose original never reached Blob would mark a partial paper', () => {
    expect(canMarkFromStored({ ...complete, originalUrls: ['https://blob/a.jpg', null] })).toBe(false);
  });

  it('no pages at all never qualifies', () => {
    expect(canMarkFromStored({ ...complete, originalUrls: [], decoded: [] })).toBe(false);
  });

  it('an undecodable page (raw HEIC on Chrome) keeps the inline safety net', () => {
    expect(canMarkFromStored({ ...complete, decoded: [true, false] })).toBe(false);
  });

  it('an attached question paper must have reached Blob too', () => {
    expect(canMarkFromStored({ ...complete, hasPaperPdf: true, paperPdfUrl: null })).toBe(false);
    expect(canMarkFromStored({ ...complete, hasPaperPdf: true, paperPdfUrl: 'https://blob/p.pdf' })).toBe(true);
  });
});
