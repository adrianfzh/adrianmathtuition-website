import { describe, it, expect } from 'vitest';
import { repairLatex, repairMarkingLatex } from './latex-repair';

// Every case below is a real line off the 28 Jul 2026 marked paper that printed
// wrong. If one of these regresses, the transcript sheet goes back to showing
// "frac5 + (-7)2" where a fraction should be.
describe('repairLatex — dropped backslashes', () => {
  it('restores brace-anchored commands', () => {
    expect(repairLatex('$frac{5+(-7)}{2}$')).toBe('$\\frac{5+(-7)}{2}$');
    expect(repairLatex('$sqrt{45}$')).toBe('$\\sqrt{45}$');
    // KaTeX rendered `text{cm}^2` as the letters t-e-x-t then the group — "textcm²".
    expect(repairLatex('$45 text{cm}^2$')).toBe('$45 \\text{cm}^2$');
  });

  it('restores \\left and \\right before bare delimiters', () => {
    expect(repairLatex('$left( x+1 right)$')).toBe('$\\left( x+1 \\right)$');
    expect(repairLatex('$left| A right|$')).toBe('$\\left| A \\right|$');
  });

  it('restores the nested fraction that printed as fracd^2vdx^2', () => {
    expect(repairLatex('$frac{d^2v}{dx^2} < 0$')).toBe('$\\frac{d^2v}{dx^2} < 0$');
  });

  it('restores greek and operators', () => {
    expect(repairLatex('$theta = pi/3$')).toBe('$\\theta = \\pi/3$');
    expect(repairLatex('$2 times 3 cdot 4$')).toBe('$2 \\times 3 \\cdot 4$');
  });

  it('does not eat a longer command as a shorter one', () => {
    expect(repairLatex('$arcsin x$')).toBe('$\\arcsin x$');
    expect(repairLatex('$cosec x$')).toBe('$\\cosec x$');
  });
});

describe('repairLatex — over-escaped backslashes', () => {
  it('collapses the doubled form that KaTeX printed raw in red', () => {
    expect(repairLatex('$\\\\text{Area} = \\\\frac{1}{2}$')).toBe('$\\text{Area} = \\frac{1}{2}$');
  });

  it('leaves a genuine \\\\ line break alone', () => {
    expect(repairLatex('$a = 1 \\\\ b = 2$')).toBe('$a = 1 \\\\ b = 2$');
  });
});

describe('repairLatex — prose safety', () => {
  it('leaves English words inside \\text{} untouched', () => {
    const src = '$\\text{since the minimum is in the range} \\Rightarrow x = 8$';
    expect(repairLatex(src)).toBe(src);
  });

  it('leaves a plain-prose line alone entirely', () => {
    expect(repairLatex('no working shown')).toBe('no working shown');
    expect(repairLatex('student went straight to the answer')).toBe('student went straight to the answer');
  });

  it('is idempotent — correct LaTeX survives a second pass', () => {
    const good = '$\\frac{1}{2}\\left(a+b\\right)h = \\sqrt{45}$';
    expect(repairLatex(good)).toBe(good);
    expect(repairLatex(repairLatex(good))).toBe(good);
  });
});

describe('repairLatex — undelimited maths', () => {
  it('wraps a bare LaTeX line so auto-render sees it at all', () => {
    expect(repairLatex('\\frac{1}{2}bh')).toBe('$\\frac{1}{2}bh$');
  });

  it('does not double-wrap a line that already has delimiters', () => {
    expect(repairLatex('$x=1$ and $y=2$')).toBe('$x=1$ and $y=2$');
  });
});

describe('repairMarkingLatex', () => {
  it('repairs every LaTeX-bearing field and leaves the rest of the shape intact', () => {
    const out = repairMarkingLatex({
      lines: [
        { line_index: 0, transcription_latex: '$frac{1}{2}$', verdict: 'wrong',
          correction: { text_latex: '$sqrt{9} = 3$' } },
        null,
      ],
      student_final_answer: { value_latex: '$theta = 60^circ$', matches_correct: false },
      marks: { awarded: 2, max: 3 },
    } as never) as {
      lines: Array<{ transcription_latex?: string; correction?: { text_latex?: string } } | null>;
      student_final_answer: { value_latex: string; matches_correct: boolean };
      marks: { awarded: number; max: number };
    };

    expect(out.lines[0]!.transcription_latex).toBe('$\\frac{1}{2}$');
    expect(out.lines[0]!.correction!.text_latex).toBe('$\\sqrt{9} = 3$');
    expect(out.lines[1]).toBeNull();
    expect(out.student_final_answer.value_latex).toBe('$\\theta = 60^\\circ$');
    expect(out.student_final_answer.matches_correct).toBe(false);
    expect(out.marks).toEqual({ awarded: 2, max: 3 });
  });
});
