import { describe, it, expect } from 'vitest';
import { BEFORE_WRITING, COMMON_SLIPS, FORMATS, PAIRS, WHAT_SCORES } from './english-formats';

const everyLine = [
  ...WHAT_SCORES, ...BEFORE_WRITING, ...COMMON_SLIPS,
  ...PAIRS.flatMap(p => [p.greeting, p.close, p.when]),
  ...FORMATS.flatMap(f => [f.name, f.feel, ...f.layout, ...f.body]),
];

describe('english formats', () => {
  it('covers the seven text types, each with a layout and a body', () => {
    expect(FORMATS.map(f => f.key)).toEqual(['formal-letter', 'informal-letter', 'email', 'speech', 'report', 'proposal', 'article']);
    for (const f of FORMATS) {
      expect(f.layout.length).toBeGreaterThanOrEqual(3);
      expect(f.body.length).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(FORMATS.map(f => f.key)).size).toBe(FORMATS.length);
  });

  it('pairs each greeting with its close', () => {
    expect(PAIRS.find(p => p.greeting.startsWith('Dear Sir'))?.close).toBe('Yours faithfully,');
    expect(PAIRS.find(p => p.greeting.startsWith('Dear Mr'))?.close).toBe('Yours sincerely,');
  });

  it('what scores = the three Task Fulfilment criteria', () => {
    expect(WHAT_SCORES).toHaveLength(3);
    expect(WHAT_SCORES.join(' ')).toMatch(/given information/);
  });

  it('names nobody and no model, and carries no disclaimer', () => {
    for (const line of everyLine) {
      expect(line).not.toMatch(/adrian|claude|opus|sonnet|gemini|\bAI\b|not always|may be wrong/i);
    }
  });

  it('bold markers are balanced on every line', () => {
    for (const line of everyLine) expect((line.match(/\*\*/g) ?? []).length % 2).toBe(0);
  });
});
