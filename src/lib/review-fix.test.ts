import { describe, expect, it } from 'vitest';
import { buildReviewFixes, buildWorkingLines } from './review-fix';

const lines = [
  { verdict: 'correct', transcription_latex: '$4p^2 + 2p + 110 = 140$' },
  { verdict: 'correct', transcription_latex: '$4p^2 + 2p - 30 = 0$' },
  { verdict: 'neutral', transcription_latex: '' , transcription_plain: 'a = 4, b = 2' },
  { verdict: 'wrong', transcription_latex: '$p = \\frac{-2 \\pm \\sqrt{484}}{2(-30)}$' },
];
const part = {
  label: '(a)', awarded: 2, max: 3,
  continuation: { from_line_index: 3, steps_latex: ['$p = \\frac{-2 \\pm 22}{8}$', '$p = 2.5$'], step_reasons: ['2a on the bottom'], final_latex: '$p = 2.5$' },
};

describe('buildReviewFixes', () => {
  it('pairs the lines up to the wrong one with the steps from it', () => {
    const [f] = buildReviewFixes([part], lines);
    expect(f.label).toBe('(a)');
    expect(f.yours).toEqual(['$4p^2 + 2p - 30 = 0$', 'a = 4, b = 2', '$p = \\frac{-2 \\pm \\sqrt{484}}{2(-30)}$']);
    expect(f.steps).toEqual([{ latex: '$p = \\frac{-2 \\pm 22}{8}$', why: '2a on the bottom' }, { latex: '$p = 2.5$', why: '' }]);
    expect(f.final).toBeNull(); // same as the last step
  });

  it('skips full-mark, audit-added, unchecked and out-of-range parts', () => {
    expect(buildReviewFixes([{ ...part, awarded: 3 }], lines)).toEqual([]);
    expect(buildReviewFixes([{ ...part, added_by_audit: true }], lines)).toEqual([]);
    expect(buildReviewFixes([{ ...part, continuation_ok: false }], lines)).toEqual([]);
    expect(buildReviewFixes([{ ...part, continuation: { ...part.continuation, from_line_index: 9 } }], lines)).toEqual([]);
    expect(buildReviewFixes([{ ...part, continuation: { ...part.continuation, steps_latex: [] } }], lines)).toEqual([]);
    expect(buildReviewFixes(null, lines)).toEqual([]);
  });

  it('drops the "(whole)" label and keeps a final line that adds something', () => {
    const [f] = buildReviewFixes([{ ...part, label: '(whole)', continuation: { ...part.continuation, final_latex: '$p = 2.5 \\text{ (shown)}$' } }], lines);
    expect(f.label).toBeNull();
    expect(f.final).toBe('$p = 2.5 \\text{ (shown)}$');
  });
});

describe('buildWorkingLines', () => {
  it('keeps the read lines in order, marks the wrong ones, drops crossed-out and blank', () => {
    const w = buildWorkingLines([...lines, { verdict: 'wrong', transcription_latex: '$x = 9$', is_crossed_out: true }, { verdict: 'correct' }]);
    expect(w.map(l => l.text)).toEqual(['$4p^2 + 2p + 110 = 140$', '$4p^2 + 2p - 30 = 0$', 'a = 4, b = 2', '$p = \\frac{-2 \\pm \\sqrt{484}}{2(-30)}$']);
    expect(w.map(l => l.wrong)).toEqual([false, false, false, true]);
  });

  it('is empty when nothing went wrong or nothing was read', () => {
    expect(buildWorkingLines([{ verdict: 'correct', transcription_latex: '$x = 1$' }])).toEqual([]);
    expect(buildWorkingLines(null)).toEqual([]);
  });
});
