import { describe, it, expect } from 'vitest';
import { hasParts, parseSplit, partQuestion, groupTotal } from './humanities-parts';

describe('hasParts', () => {
  it('sees a question with parts', () => {
    expect(hasParts('Study Fig. 1.\n(a) Describe the trend. [3]\n(b) Explain two reasons. [4]')).toBe(true);
    expect(hasParts('(a) Explain two ways citizens can take part. [7] (b) Which is more important? [8]')).toBe(false);
    expect(hasParts('(a) Explain two ways. [7]\n(b) Which is more important? [8]')).toBe(true);
    expect(hasParts('Study Source A. What is the message of this poster? [5]')).toBe(false);
  });
});

describe('parseSplit', () => {
  it('takes two or more parts with their answers', () => {
    const s = parseSplit('{"stem":"Study Fig. 1.","parts":[{"label":"(a)","question":"Describe the trend.","marks":3,"answer":"It rose."},{"label":"b","question":"Explain two reasons.","marks":"4","answer":""}]}')!;
    expect(s.parts.map(p => p.label)).toEqual(['a', 'b']);
    expect(s.parts[1].marks).toBe(4);
    expect(s.parts[1].answer).toBe('');
  });
  it('a single part is not a split', () => {
    expect(parseSplit('{"stem":"","parts":[{"label":"a","question":"x","marks":3,"answer":"y"}]}')).toBeNull();
  });
});

describe('partQuestion', () => {
  it('puts the stem first and keeps the marks', () => {
    expect(partQuestion('Study Fig. 1.', { label: 'a', question: 'Describe the trend.', marks: 3, answer: '' })).toBe('Study Fig. 1.\n\n(a) Describe the trend. [3]');
  });
});

describe('groupTotal', () => {
  it('adds up once every part has a number', () => {
    expect(groupTotal([{ got: 2, outOf: 3 }, { got: 3, outOf: 4 }])).toEqual([5, 7]);
    expect(groupTotal([{ got: 2, outOf: 3 }, { got: null, outOf: 4 }])).toBeNull();
  });
});
