import { describe, it, expect } from 'vitest';
import { levelLabel, segmentAnswer, wordCount } from './humanities-report';

describe('levelLabel', () => {
  it('one level when the reads agree, a range when they do not', () => {
    expect(levelLabel(3, 3, 4)).toBe('Level 3 of 4');
    expect(levelLabel(2, 3, 4)).toBe('Level 2–3 of 4');
    expect(levelLabel(3, 2, 4)).toBe('Level 2–3 of 4');
  });
});

describe('segmentAnswer', () => {
  const answer = 'The lift broke. This shows poor upkeep. The council is slow.';
  it('cuts the answer at the claims and keeps every character', () => {
    const segs = segmentAnswer(answer, [
      { quote: 'The council is slow.', tag: 'not_supported' },
      { quote: 'This shows poor upkeep.', tag: 'from_source' },
    ]);
    expect(segs.map(s => s.text).join('')).toBe(answer);
    expect(segs.filter(s => s.claim).map(s => s.claim!.tag)).toEqual(['from_source', 'not_supported']);
  });
  it('drops a quote that is not in the answer, and an overlap', () => {
    const segs = segmentAnswer(answer, [
      { quote: 'never written', tag: 'evaluates' },
      { quote: 'The lift broke. This', tag: 'from_source' },
      { quote: 'This shows', tag: 'evaluates' },
    ]);
    expect(segs.map(s => s.text).join('')).toBe(answer);
    expect(segs.filter(s => s.claim).length).toBe(1);
  });
  it('the same words twice take the second place', () => {
    const a = 'It works. It works.';
    const segs = segmentAnswer(a, [{ quote: 'It works.', tag: 'from_source' }, { quote: 'It works.', tag: 'evaluates' }]);
    expect(segs.filter(s => s.claim).length).toBe(2);
    expect(segs.map(s => s.text).join('')).toBe(a);
  });
});

describe('wordCount', () => {
  it('counts words', () => { expect(wordCount('  one two\nthree ')).toBe(3); expect(wordCount('')).toBe(0); });
});
