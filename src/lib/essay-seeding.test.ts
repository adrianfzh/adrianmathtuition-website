import { describe, it, expect } from 'vitest';
import { applyPlants, scorePlants, seededVerdict } from './essay-seeding';

const CLEAN = 'I walked to the shore. The waves were loud. She gave me an umbrella.';
const PLANTS = [
  { find: 'She gave me an umbrella', replace: 'She gave me umbrella', code: 'article' },
  { find: 'I walked', replace: 'I walk', code: 'tense' },
  { find: 'waves were', replace: 'waves was', code: 'sva' },
];

describe('applyPlants', () => {
  it('plants every slip and reports where each one sits in the seeded text', () => {
    const { text, spans } = applyPlants(CLEAN, PLANTS);
    expect(text).toBe('I walk to the shore. The waves was loud. She gave me umbrella.');
    expect(spans.map(s => s.code)).toEqual(['tense', 'sva', 'article']);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.replace);
  });
  it('refuses a plant that is missing, written twice, or overlapping another', () => {
    expect(() => applyPlants(CLEAN, [{ find: 'the moon', replace: 'moon', code: 'article' }])).toThrow(/not in the essay/);
    expect(() => applyPlants(CLEAN, [{ find: 'me', replace: 'I', code: 'word_form' }])).not.toThrow();
    expect(() => applyPlants(CLEAN, [{ find: 'he', replace: 'she', code: 'pronoun_ref' }])).toThrow(/more than once/);
    expect(() => applyPlants(CLEAN, [PLANTS[2], { find: 'were loud', replace: 'was loud', code: 'sva' }])).toThrow(/overlap/);
  });
});

describe('scorePlants + seededVerdict', () => {
  const { spans } = applyPlants(CLEAN, PLANTS);
  it('counts found, right code, missed and extra marks', () => {
    const marks = [
      { start: spans[0].start, end: spans[0].end, code: 'tense' },          // found, right
      { start: spans[1].start + 6, end: spans[1].end, code: 'tense' },      // found, wrong code
      { start: 14, end: 19, code: 'spelling' },                              // touches no plant
    ];
    const s = scorePlants(spans, marks);
    expect([s.planted, s.found, s.rightCode, s.extra]).toEqual([3, 2, 1, 1]);
    expect(s.missed.map(m => m.code)).toEqual(['article']);
    expect(s.wrongCode[0].got).toBe('tense');
    expect(seededVerdict(s, 0).pass).toBe(false);
  });
  it('passes when every plant is found with its code and the extra marks stay near the clean essay\'s', () => {
    const marks = spans.map(s => ({ start: s.start, end: s.end, code: s.code }));
    expect(seededVerdict(scorePlants(spans, marks), 0)).toEqual({ pass: true, reasons: [] });
    const noisy = [...marks, ...[0, 1, 2, 3].map(i => ({ start: 100 + i * 3, end: 102 + i * 3, code: null }))];
    expect(seededVerdict(scorePlants(spans, noisy), 0).pass).toBe(false);
    expect(seededVerdict(scorePlants(spans, noisy), 2).pass).toBe(true);
  });
});
