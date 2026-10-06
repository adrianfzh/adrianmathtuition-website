import { describe, it, expect } from 'vitest';
import { essayGuidanceFor } from './essay-guidance';

describe('essayGuidanceFor', () => {
  it('gives lines for both kinds of English writing, and none for anything else', () => {
    expect(essayGuidanceFor('english', 'continuous_writing').length).toBeGreaterThan(4);
    expect(essayGuidanceFor('english', 'situational_writing').length).toBeGreaterThan(4);
    expect(essayGuidanceFor('english', 'poem')).toEqual([]);
    expect(essayGuidanceFor('chinese', 'continuous_writing')).toEqual([]);
  });

  it('continuous writing reads the question: absolute and comparing words', () => {
    const t = essayGuidanceFor('english', 'continuous_writing').join('\n');
    expect(t).toMatch(/only, never, always/);
    expect(t).toMatch(/What more can be done/);
  });

  it('situational writing never marks a school layout habit as a slip', () => {
    const t = essayGuidanceFor('english', 'situational_writing').join('\n');
    expect(t).toMatch(/LAYOUT IS NOT A MARKING LINE/);
    expect(t).toMatch(/Yours faithfully/);
  });

  it('holds no mark, no band and no model name — the rubric is the only scale', () => {
    for (const kind of ['continuous_writing', 'situational_writing']) {
      const t = essayGuidanceFor('english', kind).join('\n');
      expect(t).not.toMatch(/\bband \d|\/\s?30|\bout of \d/i);
      expect(t).not.toMatch(/claude|opus|sonnet|haiku|gemini/i);
    }
  });
});
