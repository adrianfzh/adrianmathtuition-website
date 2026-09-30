import { describe, it, expect } from 'vitest';
import { regionFraction, jumpHref } from './review-cards';
import type { StudentQuestion } from './portal-marking';

const q = (n: string, extra: Partial<StudentQuestion> = {}): Pick<StudentQuestion, 'questionNumber' | 'region'> =>
  ({ questionNumber: n, region: null, ...extra });

describe('regionFraction / jumpHref', () => {
  it('maps the marker\'s words to a place on the page', () => {
    expect(regionFraction('top of page')).toBeCloseTo(0.08);
    expect(regionFraction('lower two-thirds of the page')).toBeCloseTo(0.45);
    expect(regionFraction('middle of page')).toBeCloseTo(0.38);
    expect(regionFraction(null)).toBeCloseTo(0.08);
  });
  it('builds the jump with the page anchor, or just the question when no page was recorded', () => {
    expect(jumpHref({ runId: 'r', photoIndex: 3, at: 0.62, question: q('11(a)') })).toBe('/app/marking/r?q=11(a)&page=3&at=0.62#page-3');
    expect(jumpHref({ runId: 'r', photoIndex: null, at: 0.1, question: q('4') })).toBe('/app/marking/r?q=4');
  });
  it('reads the place off the marker\'s region words when no `at` is given (1 Oct 2026)', () => {
    expect(jumpHref({ runId: 'r', photoIndex: 1, question: q('2', { region: 'bottom of page' }) })).toBe('/app/marking/r?q=2&page=1&at=0.62#page-1');
  });
});
