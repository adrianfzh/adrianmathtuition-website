import { describe, it, expect } from 'vitest';
import { placeBand, placePrompt, parsePlace } from './humanities-place';

describe('placeBand', () => {
  it('the settled level\'s range, only when wider than one mark', () => {
    expect(placeBand('how_far', 10, 3)).toEqual({ lo: 5, hi: 8, total: 10 });
    expect(placeBand('comparison', 6, 3)).toBeNull(); // Level 3 of a 6-mark comparison is 5 marks
    expect(placeBand('comparison', 6, null)).toBeNull();
    expect(placeBand('geo_describe', 4, 2)).toBeNull();
  });
});

describe('parsePlace', () => {
  it('takes a mark inside the band only', () => {
    expect(parsePlace('{"mark": 6, "why": "two sources each side"}', { lo: 5, hi: 8 })).toBe(6);
    expect(parsePlace('{"mark": 9}', { lo: 5, hi: 8 })).toBeNull();
    expect(parsePlace('no', { lo: 5, hi: 8 })).toBeNull();
  });
});

describe('placePrompt', () => {
  it('names the level, its range and the next level up', () => {
    const p = placePrompt({ answer: 'x', question: 'How far…', subject: 'Social Studies', scheme: { levels: [{ level: 3, does: 'Both sides' }, { level: 4, does: 'Weighs' }] } }, 3, { lo: 5, hi: 8, total: 10 });
    expect(p).toContain('Level 3 earns 5 to 8 marks, out of 10.');
    expect(p).toContain('Level 4: Weighs');
  });
});
