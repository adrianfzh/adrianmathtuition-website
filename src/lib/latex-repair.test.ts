import { describe, it, expect } from 'vitest';
import { repairLatex, repairMarkingLatex, repairSolution, splitStepChain } from './latex-repair';

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

  it('repairs the worked solution too — the transcript has no other source for it', () => {
    const out = repairMarkingLatex({
      correct: { full_solution_latex: '$frac{1}{2}x$\\n$x = 3$', final_answer: '3' },
    } as never) as { correct: { full_solution_latex: string; final_answer: string } };

    expect(out.correct.full_solution_latex).toBe('$\\frac{1}{2}x$\n$x = 3$');
    expect(out.correct.final_answer).toBe('3');
  });
});

describe('repairSolution — a solution is several steps in one string', () => {
  it('repairs each step and never wraps the whole block in one $…$', () => {
    // Rule 4 wraps an undelimited LaTeX line; applied to the block it would set
    // the prose between steps in math italic.
    const out = repairSolution('theta = 60^circ\nIn triangle ABC, AB = 5');
    expect(out).toBe('$\\theta = 60^\\circ$\nIn triangle ABC, AB = 5');
  });

  it('splits on a literal \\n but not on \\neq — the step that came back as "eq 0"', () => {
    // `\ne`, `\neq`, `\nabla`, `\not`, `\nu` all start with the two characters a
    // naive split treats as a separator; `6>0\neq 0` became `6>0` + `eq 0`, and
    // both halves printed as raw source because neither parses.
    expect(repairSolution('$6>0 \\neq 0$').split('\n')).toEqual(['$6>0 \\neq 0$']);
    expect(repairSolution('$a=1$\\n$b=2$').split('\n')).toEqual(['$a=1$', '$b=2$']);
  });

  it('splits before a capitalised word — the step that printed a visible "\\nAt"', () => {
    // The old rule refused to split before ANY letter, to protect `\neq` and
    // friends. But a step opening with an ordinary capitalised word is common,
    // and merging it left a literal `\nAt` in the middle of a rendered sheet.
    expect(repairSolution('$t=3$\\nAt $t=1$, $s=4$').split('\n'))
      .toEqual(['$t=3$', 'At $t=1$, $s=4$']);
  });

  it('does not split \\nRightarrow — the one command that continues in caps', () => {
    // The exception list earns its keep here: judging on "not a lowercase letter"
    // alone would tear the negated arrows and turnstiles in half.
    expect(repairSolution('$a \\nRightarrow b$').split('\n')).toEqual(['$a \\nRightarrow b$']);
    expect(repairSolution('$a \\nVdash b$').split('\n')).toEqual(['$a \\nVdash b$']);
  });

  it('normalises CR/LF and drops blank steps', () => {
    expect(repairSolution('$a=1$\r\n\r\n$b=2$\r$c=3$')).toBe('$a=1$\n$b=2$\n$c=3$');
  });

  it('survives an empty or missing solution', () => {
    expect(repairSolution('')).toBe('');
    expect(repairSolution(undefined as never)).toBe('');
  });
});

// The model chains "$A \Rightarrow B$" on one line despite the one-step-per-line
// spec, and the chained line rendered as the "continuous statement… long double
// arrow sign" Adrian flagged (20 Aug 2026). Mirrors the bot's splitStepChain
// (ai/pen-math.js, test/pen-math.test.js) — keep the two splitting alike.
describe('repairSolution — ⇒-chained lines become separate steps', () => {
  it('splits a \\Rightarrow chain into separate steps, dropping the arrows', () => {
    expect(repairSolution('$\\tan^3 A = -1 \\Rightarrow \\tan A = -1$').split('\n'))
      .toEqual(['$\\tan^3 A = -1$', '$\\tan A = -1$']);
    expect(repairSolution('$3x = 6 ⇒ x = 2 ⟹ x^2 = 4$').split('\n'))
      .toEqual(['$3x = 6$', '$x = 2$', '$x^2 = 4$']);
  });

  it('splits at \\Longrightarrow and \\implies too', () => {
    expect(repairSolution('$a = 1 \\Longrightarrow b = 2 \\implies c = 3$').split('\n'))
      .toEqual(['$a = 1$', '$b = 2$', '$c = 3$']);
  });

  it('keeps a leading \\therefore as the opening of its own line', () => {
    expect(repairSolution('$x^2 = 4 \\Rightarrow x = \\pm 2 \\therefore x = 2$').split('\n'))
      .toEqual(['$x^2 = 4$', '$x = \\pm 2$', '$\\therefore x = 2$']);
    // A line that only OPENS with ∴ is a single step — untouched, dollars and all.
    expect(splitStepChain('$\\therefore x = 3$')).toEqual(['$\\therefore x = 3$']);
  });

  it('never splits arrows inside braces or prose', () => {
    // Depth-zero only: an arrow inside \text{…} is part of a sentence.
    expect(splitStepChain('$\\text{so } A \\text{ (\\Rightarrow B)}$'))
      .toEqual(['$\\text{so } A \\text{ (\\Rightarrow B)}$']);
    // Prose around the dollars means a sentence, and a sentence keeps its arrows.
    expect(splitStepChain('hence $a = 1 \\Rightarrow b = 2$ holds'))
      .toEqual(['hence $a = 1 \\Rightarrow b = 2$ holds']);
    expect(splitStepChain('$a=1$ and $b=2$')).toEqual(['$a=1$ and $b=2$']);
  });

  it('leaves commands that merely START like a connective untouched', () => {
    expect(splitStepChain('$a \\Rightarrowx b$')).toEqual(['$a \\Rightarrowx b$']);
  });

  it('splits AFTER repair — a dropped-backslash Rightarrow still chains', () => {
    // repairLatex restores `Rightarrow` → `\Rightarrow` first; splitting before
    // repair would leave the bare word both unsplit and unrendered.
    expect(repairSolution('$3x = 6 Rightarrow x = 2$').split('\n'))
      .toEqual(['$3x = 6$', '$x = 2$']);
  });

  it('chain-splits each newline-separated step independently', () => {
    expect(repairSolution('$a = 1 \\Rightarrow b = 2$\\n$c = 3$').split('\n'))
      .toEqual(['$a = 1$', '$b = 2$', '$c = 3$']);
  });
});
