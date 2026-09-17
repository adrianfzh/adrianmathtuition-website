import { describe, it, expect } from 'vitest';
import { buildReviewCards, regionFraction, jumpHref } from './review-cards';
import type { StudentPaper, StudentQuestion } from './portal-marking';

const q = (n: string, awarded: number, max: number, extra: Partial<StudentQuestion> = {}): StudentQuestion =>
  ({ questionNumber: n, awarded, max, topic: null, comment: '', slips: [], full: awarded >= max, prompt: null, schemes: [], solution: null, revise: null, photoIndex: null, region: null, ...extra } as StudentQuestion);
const paper = (id: string, date: string, dropped: StudentQuestion[]): StudentPaper =>
  ({ id, date, name: `P${id}`, awarded: 0, max: 0, pct: null, questions: dropped, dropped, pdfUrl: null, fullPdfUrl: null, pages: [], notice: null, practice: [], practiceDocxUrl: null } as unknown as StudentPaper);

describe('buildReviewCards', () => {
  it('newest paper first, then the paper\'s own order, with marks lost and the page', () => {
    const cards = buildReviewCards([
      paper('old', '2026-09-01', [q('3', 1, 4, { photoIndex: 2, region: 'bottom of page' })]),
      paper('new', '2026-09-10', [q('7', 0, 5), q('2', 2, 3)]),
    ]);
    expect(cards.map(c => c.key)).toEqual(['new:7', 'new:2', 'old:3']);
    expect(cards[0].lost).toBe(5);
    expect(cards[2].photoIndex).toBe(2);
    expect(cards[2].at).toBeCloseTo(0.62);
  });
});

describe('regionFraction / jumpHref', () => {
  it('maps the marker\'s words to a place on the page', () => {
    expect(regionFraction('top of page')).toBeCloseTo(0.08);
    expect(regionFraction('lower two-thirds of the page')).toBeCloseTo(0.45);
    expect(regionFraction('middle of page')).toBeCloseTo(0.38);
    expect(regionFraction(null)).toBeCloseTo(0.08);
  });
  it('builds the jump with the page anchor, or just the question when no page was recorded', () => {
    expect(jumpHref({ runId: 'r', photoIndex: 3, at: 0.62, question: q('11(a)', 0, 2) })).toBe('/app/marking/r?q=11(a)&page=3&at=0.62#page-3');
    expect(jumpHref({ runId: 'r', photoIndex: null, at: 0.1, question: q('4', 0, 2) })).toBe('/app/marking/r?q=4');
  });
});
