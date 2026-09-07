import { describe, it, expect } from 'vitest';
import { remarkDiff, plainMath, clip } from './remark-diff';

const mo = (parts: unknown[]) => ({ parts });

describe('remarkDiff (8 Sep 2026)', () => {
  it('compares every part on the re-marked pages before and after', () => {
    const prev = [{ photo_index: 11, question_number: '7', marking_output: mo([{ label: '(b)(ii)', awarded: 1, max: 2 }, { label: '(b)(iii)', awarded: 0, max: 1 }]) },
      { photo_index: 10, question_number: '7', marking_output: mo([{ label: '(a)', awarded: 0, max: 4 }]) }];
    const curr = [{ photo_index: 11, question_number: '7', marking_output: mo([{ label: '(b)(ii)', awarded: 0, max: 2, error_summary: 'no line of lg n gives 0' }, { label: '(b)(iii)', awarded: 0, max: 1 }]) },
      { photo_index: 10, question_number: '7', marking_output: mo([{ label: '(a)', awarded: 0, max: 4 }]) }];
    const d = remarkDiff(prev, curr, [11]);
    expect(d.pages).toEqual([11]);
    expect(d.parts.map(p => `Q${p.q}${p.part}`)).toEqual(['Q7(b)(ii)', 'Q7(b)(iii)']);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]).toMatchObject({ q: '7', part: '(b)(ii)', before: { awarded: 1, max: 2 }, after: { awarded: 0, max: 2, why: 'no line of lg n gives 0' } });
    expect(remarkDiff(prev, curr, null).parts).toHaveLength(3);
  });
  it('no previous marking → nothing counts as changed; identical → changed is empty', () => {
    const curr = [{ photo_index: 0, question_number: '1', marking_output: mo([{ label: '(whole)', awarded: 2, max: 5 }]) }];
    expect(remarkDiff(undefined, curr, [0])).toMatchObject({ hadPrevious: false, changed: [] });
    expect(remarkDiff(curr, curr, [0])).toMatchObject({ hadPrevious: true, changed: [] });
    expect(remarkDiff(curr, curr, [0]).parts[0].part).toBe('');
  });
});

describe('plainMath + clip', () => {
  it('turns the marker\'s LaTeX into Telegram text', () => {
    expect(plainMath('at $t = 5$ your line gives $\\lg n \\approx 1.87$, so $n = 10^{1.87} \\approx 74$')).toBe('at t = 5 your line gives lg n ≈ 1.87, so n = 10^1.87 ≈ 74');
  });
  it('clips on a word boundary with an ellipsis', () => {
    expect(clip('Page 12 was re-marked. Marks that changed: Q7(b)(ii)', 30)).toBe('Page 12 was re-marked. Marks…');
    expect(clip('short', 30)).toBe('short');
  });
});
