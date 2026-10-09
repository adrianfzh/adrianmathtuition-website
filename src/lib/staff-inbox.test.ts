import { describe, it, expect } from 'vitest';
import { gistOf } from './staff-inbox';

describe('staff inbox', () => {
  it('the gist is the first readable line, tags stripped', () => {
    expect(gistOf('<b>📋 Follow-ups</b>\n\n· one')).toBe('📋 Follow-ups');
    expect(gistOf('\n\nplain line\nsecond')).toBe('plain line');
    expect(gistOf('')).toBe('');
  });
  it('a long first line is cut at a word, as a gist only', () => {
    const g = gistOf('word '.repeat(60));
    expect(g.length).toBeLessThanOrEqual(140);
    expect(g.endsWith('…')).toBe(true);
  });
});
