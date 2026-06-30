import { describe, it, expect } from 'vitest';
import { validateFeedback } from './contract';

const valid = {
  mode: 'english',
  overall: { band: 'B4', score: 15, outOf: 30, summary: 'ok' },
  rubric: [{ criterion: 'Content', band: 'B4', comment: 'c' }],
  annotations: [{ quote: 'q', comment: 'fix it', tag: 'tag', severity: 'minor' }],
  strengths: ['clear stance'],
  nextSteps: ['add examples'],
};

describe('validateFeedback', () => {
  it('accepts a well-formed response', () => {
    expect(validateFeedback(valid)).toEqual([]);
  });
  it('accepts a paragraph-mode response (null score/band)', () => {
    expect(validateFeedback({ ...valid, overall: { band: null, score: null, outOf: null, summary: 's' } })).toEqual([]);
  });
  it('rejects a bad mode', () => {
    expect(validateFeedback({ ...valid, mode: 'spanish' })).toContain('mode must be english|math');
  });
  it('rejects non-array annotations', () => {
    expect(validateFeedback({ ...valid, annotations: 'nope' })).toContain('annotations must be array');
  });
  it('rejects an annotation missing quote/comment', () => {
    expect(validateFeedback({ ...valid, annotations: [{ tag: 'x', severity: 'minor' }] }))
      .toContain('annotation needs quote+comment strings');
  });
  it('rejects a non-object', () => {
    expect(validateFeedback(null)).toEqual(['not an object']);
  });
});
