import { describe, it, expect } from 'vitest';
import { markBands, marksForLevels, printedMarks, USUAL_MARKS } from './humanities-marks';
import { schemeFor } from './humanities-questions';

describe('markBands', () => {
  it('has one range per level of our scheme, joined, ending at the total', () => {
    for (const skill of Object.keys(USUAL_MARKS)) {
      const levels = schemeFor(skill)!.levels.length;
      for (const marks of [5, 6, 7, 8, 9, 10, 12]) {
        const b = markBands(skill, marks);
        if (!b) continue;
        expect(b.length, `${skill} ${marks}`).toBe(levels);
        expect(b[0][0]).toBe(1);
        expect(b[b.length - 1][1]).toBe(marks);
        for (let i = 1; i < b.length; i++) expect(b[i][0]).toBe(b[i - 1][1] + 1);
      }
    }
  });
  it('uses the usual total when none is printed', () => {
    expect(markBands('how_far', null)).toEqual([[1, 1], [2, 4], [5, 8], [9, 10]]);
  });
  it('is null for a point-marked or unknown type', () => {
    expect(markBands('geo_describe', 4)).toBeNull();
  });
});

describe('marksForLevels', () => {
  it('says the range of the levels read', () => {
    expect(marksForLevels('comparison', 6, 3, 3)).toBe('5 out of 6 marks');
    expect(marksForLevels('how_far', 10, 2, 3)).toBe('2–8 out of 10 marks');
    expect(marksForLevels('sr_explain', 7, 3, 3)).toBe('5–7 out of 7 marks');
    expect(marksForLevels('inference', 5, 1, 1)).toBe('1 out of 5 marks');
  });
  it('is null outside the scale', () => {
    expect(marksForLevels('inference', 5, 4, 4)).toBeNull();
  });
});

describe('printedMarks', () => {
  it('reads the marks printed at the end', () => {
    expect(printedMarks('How similar are these sources? Explain your answer. [6]')).toBe(6);
    expect(printedMarks('Explain two ways. [7 marks]')).toBe(7);
    expect(printedMarks('Describe the pattern (4 marks)')).toBe(4);
    expect(printedMarks('No marks here')).toBeNull();
  });
});
