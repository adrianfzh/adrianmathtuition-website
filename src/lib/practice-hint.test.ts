import { describe, it, expect } from 'vitest';
import { buildHintPrompt, normaliseHint, hintMarkdown, HINT_MAX_LINES } from './practice-hint';

describe('normaliseHint', () => {
  it('returns empty for NONE / blank', () => {
    expect(normaliseHint('NONE')).toBe('');
    expect(normaliseHint('none.')).toBe('');
    expect(normaliseHint('')).toBe('');
    expect(normaliseHint(null)).toBe('');
  });
  it('strips bullets, numbering and a stray heading, caps at three lines', () => {
    const raw = 'Hint:\n1. Draw the line first.\n- Mark where the ball turns back.\n• Add the two distances.\n4. Extra line.';
    const out = normaliseHint(raw);
    expect(out.split('\n')).toHaveLength(HINT_MAX_LINES);
    expect(out).toBe('Draw the line first.\nMark where the ball turns back.\nAdd the two distances.');
  });
  it('truncates an over-long line', () => {
    const out = normaliseHint('x'.repeat(300));
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('buildHintPrompt', () => {
  it('carries the question, the key as writer-only background, and the shelf', () => {
    const p = buildHintPrompt(
      { level: 'AM', topics: ['Kinematics'], question_text: 'Find the distance travelled in the first 20 s.', solution: 'v=0 at t=11.07 …' },
      { subject: 'AM', methods: [{ id: '1', topic: 'Kinematics', question_type: 'distance', method: 'Find when v = 0 first.', watch_out: 'distance ≠ displacement' }], pitfalls: [], formulae: [] },
    );
    expect(p).toContain('Find the distance travelled');
    expect(p).toContain('for your eyes only');
    expect(p).toContain('Find when v = 0 first.');
    expect(p).toContain('NONE');
    expect(p).not.toMatch(/Adrian/);
  });
  it('omits the key and shelf blocks when there are none', () => {
    const p = buildHintPrompt({ level: 'EM', topics: [], question_text: 'Q' }, null);
    expect(p).not.toContain('for your eyes only');
    expect(p).not.toContain('Background');
  });
});

describe('hintMarkdown', () => {
  it('renders one paragraph per line and nothing for empty', () => {
    expect(hintMarkdown('a\nb')).toBe('a\n\nb');
    expect(hintMarkdown('')).toBe('');
    expect(hintMarkdown(null)).toBe('');
  });
});
