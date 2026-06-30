import { describe, it, expect } from 'vitest';
import { segment, type Ann } from './segment';

const ann = (quote: string, severity: 'minor' | 'major' = 'minor'): Ann =>
  ({ quote, comment: 'c', tag: 't', severity });

describe('segment', () => {
  it('wraps a found quote and leaves the rest plain', () => {
    const parts = segment('the quick brown fox', [ann('quick')]);
    expect(parts.map((p) => p.text).join('')).toBe('the quick brown fox'); // lossless
    const marked = parts.filter((p) => p.i !== undefined);
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe('quick');
    expect(marked[0].i).toBe(0);
  });

  it('skips a quote that is not present (no crash, no wrap)', () => {
    const parts = segment('hello world', [ann('absent')]);
    expect(parts).toEqual([{ text: 'hello world' }]);
  });

  it('does not double-wrap overlapping quotes', () => {
    // both quotes overlap; only the first non-overlapping range is kept
    const parts = segment('alpha beta gamma', [ann('alpha beta'), ann('beta gamma')]);
    const marked = parts.filter((p) => p.i !== undefined);
    expect(marked).toHaveLength(1);
    expect(marked[0].text).toBe('alpha beta');
  });

  it('wraps multiple non-overlapping quotes in document order', () => {
    const parts = segment('one two three four', [ann('three'), ann('one')]);
    const marked = parts.filter((p) => p.i !== undefined).map((p) => p.text);
    expect(marked).toEqual(['one', 'three']); // ordered by position, not by annotation order
  });

  it('carries severity through to the segment', () => {
    const parts = segment('a major issue here', [ann('major', 'major')]);
    const m = parts.find((p) => p.i !== undefined);
    expect(m?.sev).toBe('major');
  });

  it('ignores empty quotes', () => {
    expect(segment('text', [ann('')])).toEqual([{ text: 'text' }]);
  });
});
