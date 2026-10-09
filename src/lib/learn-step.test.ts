import { describe, expect, it } from 'vitest';
import { equal, isCollected, parseExpr, polyTex } from './poly';
import {
  allQuestions, evaluateSquare, exprTex, fiveResult, mark, parseBrackets, qOf, setFor, squareFromSumAndProduct,
  squareLines, sumFromSquareAndProduct, work, FIVE,
} from './learn-step';
import { lessonBySlug } from './lesson-catalog';
import { LEARN_STEPS, learnStepBySlug, learnStepForClip } from './learn-steps';

const tex = (s: string) => polyTex(parseExpr(s)!.poly);
/** A line of working as the checker reads it: no "= ", no KaTeX braces. */
const asTyped = (line: string) => line.replace(/^=\s*/, '').replace(/[{}]/g, '');

describe('poly — reading what a student types', () => {
  it('reads powers, side-by-side products and the minus signs a phone types', () => {
    expect(tex('x² + x − 6')).toBe('x^{2} + x - 6');
    expect(tex('x^2+x-6')).toBe('x^{2} + x - 6');
    expect(tex('-6 + x + x*x')).toBe('x^{2} + x - 6');
    expect(tex('(x+3)(x-2)')).toBe('x^{2} + x - 6');
    expect(tex('2x(3x − 1) − 5(3x − 1)')).toBe('6x^{2} - 17x + 5');
    expect(tex('(x+y)(x-y)')).toBe('x^{2} - y^{2}');
  });

  it('refuses what it cannot read, never guesses', () => {
    for (const bad of ['', 'x +', '(x+3', 'x^', 'x = 2', '3/4', 'x^99', '2..3']) expect(parseExpr(bad)).toBeNull();
  });

  it('knows a collected sum from one with like terms left', () => {
    expect(isCollected(parseExpr('x² + x − 6')!)).toBe(true);
    expect(isCollected(parseExpr('x² − 2x + 3x − 6')!)).toBe(false);
    expect(isCollected(parseExpr('(x+3)(x-2)')!)).toBe(false);
  });
});

describe('learn-step — the Rainbow (his notes, recap and §1)', () => {
  it('works his Example 1a: four arrows, then add up like terms', () => {
    const w = work('(a+b)(a-3b)')!;
    expect(w.shape).toBe('rainbow');
    expect(w.lines.map(l => l.tex)).toEqual(['(a + b)(a - 3b)', '= a^{2} - 3ab + ab - 3b^{2}', '= a^{2} - 2ab - 3b^{2}']);
    expect(w.lines[2].why).toBe('Add up like terms');
    expect(w.taps).toBe(5);
  });

  it('works his Example 1b: no like terms to add up', () => {
    const w = work('(3x-5)(2x-y)')!;
    expect(w.lines.map(l => l.tex)).toEqual(['(3x - 5)(2x - y)', '= 6x^{2} - 3xy - 10x + 5y']);
    expect(w.answerTex).toBe('6x^{2} - 3xy - 10x + 5y');
    expect(w.taps).toBe(4);
  });

  it('works the recap: one term outside, two or three inside', () => {
    expect(work('2(a+3b)')!.lines.map(l => l.tex)).toEqual(['2(a + 3b)', '= 2a + 6b']);
    const w = work('-2b(3-4b+6c)')!;
    // His notes print −12c here; −2b × 6c is −12bc (told to Adrian, 9 Oct 2026).
    expect(w.answerTex).toBe('-6b + 8b^{2} - 12bc');
    expect(w.taps).toBe(3);
  });

  it('leaves an answer in arrow order when nothing collects, as his answer key does', () => {
    expect(work('(3-k)(4+9k)')!.answerTex).toBe('-9k^{2} + 23k + 12');
    expect(work('m(5-m)')!.answerTex).toBe('5m - m^{2}');
    expect(mark('(3-k)(4+9k)', '12 + 23k − 9k²').kind).toBe('correct');
  });
});

describe('learn-step — special products, by the formula (his notes §4)', () => {
  it('works his Example a and Example c', () => {
    expect(squareLines(parseBrackets('(2p+3q)^2')!)).toEqual([
      { tex: '(2p + 3q)^{2}' },
      { tex: '= (2p)^{2} + 2(2p)(3q) + (3q)^{2}', why: '(a + b)² = a² + 2ab + b²' },
      { tex: '= 4p^{2} + 12pq + 9q^{2}' },
    ]);
    expect(work('(5m-2n)^2')!.lines.map(l => l.tex)).toEqual([
      '(5m - 2n)^{2}', '= (5m)^{2} - 2(5m)(2n) + (2n)^{2}', '= 25m^{2} - 20mn + 4n^{2}',
    ]);
  });

  it('leaves a bare number or letter unbracketed, as he writes (2x)² + 2(2x)(7) + 7²', () => {
    expect(work('(2x+7)^2')!.lines[1].tex).toBe('= (2x)^{2} + 2(2x)(7) + 7^{2}');
    expect(work('(9w-4)^2')!.lines[1].tex).toBe('= (9w)^{2} - 2(9w)(4) + 4^{2}');
    expect(work('(x+3)²')!.lines[1].tex).toBe('= x^{2} + 2(x)(3) + 3^{2}');
  });

  it('names the slips of a square', () => {
    const slip = (a: string) => { const v = mark('(2p+3q)^2', a); return v.kind === 'wrong' ? v.slip : null; };
    expect(slip('4p² + 9q²')).toEqual({ key: 'first-last-only', say: 'The middle term is missing: twice the product, $2(2p)(3q)$.' });
    expect(slip('4p² + 6pq + 9q²')?.key).toBe('half-middle');
    expect(slip('4p² − 12pq + 9q²')?.key).toBe('sign');
    expect(mark('(2p+3q)^2', '4p² + 12pq + 9q²').kind).toBe('correct');
  });
});

describe('learn-step — written working (his notes, recap and "Further Expansion")', () => {
  it('sets a typed question out for reading', () => {
    expect(exprTex('4a-2(4a+5b)')).toBe('4a - 2(4a + 5b)');
    expect(exprTex('2(a+5)-(4a+3)(2a-7)')).toBe('2(a + 5) - (4a + 3)(2a - 7)');
    expect(exprTex('-5(3m-2)(m+1)')).toBe('-5(3m - 2)(m + 1)');
    expect(exprTex('(x^2+4x)(x^2-2)')).toBe('(x^{2} + 4x)(x^{2} - 2)');
  });

  it('shows his lines and ends on his answer', () => {
    const w = work(learnStepBySlug('further-expansion')!.example)!;
    expect(w.shape).toBe('lines');
    expect(w.questionTex).toBe('2(a + 5) - (4a + 3)(2a - 7)');
    expect(w.answerTex).toBe('-8a^{2} + 24a + 31');
    expect(w.taps).toBe(4);
  });

  it('every written line equals its question, and the first line is the question', () => {
    for (const step of LEARN_STEPS) {
      for (const x of [step.example, step.tryOne]) {
        const w = work(x)!;
        expect(w.lines.length, `${step.slug}: the example and the try need working`).toBeGreaterThan(1);
        if (w.prompt !== undefined) continue; // a number answer: its lines are checked below, by value
        expect(w.lines[0].tex).toBe(w.questionTex);
        for (const line of w.lines) {
          const typed = parseExpr(asTyped(line.tex));
          expect(typed, `${qOf(x)} → ${line.tex}`).not.toBeNull();
          expect(equal(typed!.poly, w.want), `${qOf(x)} → ${line.tex}`).toBe(true);
        }
        // The last line is the finished answer.
        expect(mark(x, asTyped(w.lines[w.lines.length - 1].tex)).kind).toBe('correct');
      }
    }
  });

  it('uses the step\'s own warning when no known slip explains a wrong answer', () => {
    const step = learnStepBySlug('expand-and-simplify')!;
    expect(mark(step.example, '−4a + 10b', step.trap)).toEqual({ kind: 'wrong', slip: { key: 'trap', say: step.trap } });
    expect(mark(step.example, '−4a − 10b', step.trap).kind).toBe('correct');
    expect(mark(step.example, '4a − 8a − 10b', step.trap)).toEqual({ kind: 'unfinished', say: 'Right so far. Now add up the like terms.' });
  });
});

describe('learn-step — his printed answers', () => {
  const key: [string, string][] = [
    // Practice 1a
    ['(a+b)(2a+3b)', '2a² + 5ab + 3b²'], ['(3a-b)(4a-b)', '12a² − 7ab + b²'], ['(3p+2)(5p-4)', '15p² − 2p − 8'],
    ['(3-k)(4+9k)', '12 + 23k − 9k²'], ['(x^2+4x)(x^2-2)', 'x^4 − 2x² + 4x^3 − 8x'], ['3(2a+1)(2a+5)', '12a² + 36a + 15'],
    ['2(4+3u)(2-5u)', '16 − 28u − 30u²'], ['-5(3m-2)(m+1)', '−15m² − 5m + 10'],
    // Practice 1b
    // 1b (a): his key prints −xy; 5xy − 12xy + 3xy is −4xy (told to Adrian, 9 Oct 2026).
    ['(x-6y)(2x+5y)+3xy', '2x² − 4xy − 30y²'], ['(2x+4)(3x-5)-4(x+2)', '6x² − 2x − 28'],
    ['(x-4)(2x+1)+7(x+2)(x-1)', '9x² − 18'], ['7x-(2x-1)(4x+5)', '−8x² + x + 5'],
    ['(9a-2b)(3a+2b)-(4a-3b)(3a-2b)', '15a² + 29ab − 10b²'], ['(x+3)(x-1)-3(2x+1)(4x-3)', '−23x² + 8x + 6'],
    // Assignment 1
    ['9x-(2x-1)(4x+5)', '−8x² + 3x + 5'], ['(x-6y)(2x+3y)+6xy', '2x² − 3xy − 18y²'], ['(x-3)(2x+4)-3(x+5)(x-1)', '−x² − 14x + 3'],
    // Examples and Practice 4
    ['(2x+7)^2', '4x² + 28x + 49'], ['(9w-4)^2', '81w² − 72w + 16'],
    ['(x+2y)(3x-5y)-4(x-y)^2', '−x² + 9xy − 14y²'], ['(a+b)(5a+3b)+(a+b)^2', '6a² + 10ab + 4b²'],
    ['10m^2-(7m^2-n)-(m-n)^2', '2m² + 2mn − n² + n'], ['(3-m)(m+3)-2m+6(m+1)^2', '5m² + 10m + 15'],
    // Assignment 1, Q2
    ['(2x+1)(x-3)-2(x+3)^2', '−17x − 21'], ['(3y+1)^2+2(3y-1)^2', '27y² − 6y + 3'], ['(a+4)^2-(a-4)^2', '16a'],
    ['(6m-3n)^2-(2m+5n)^2', '32m² − 56mn − 16n²'], ['4a(a+4)-(a+1)^2', '3a² + 14a − 1'], ['3(2a-3)^2-2(2a-3)(2a+3)', '4a² − 36a + 45'],
  ];
  it('marks each of them correct', () => {
    const used = new Set(LEARN_STEPS.flatMap(s => allQuestions(s).map(qOf)));
    for (const [q, a] of key) {
      expect(used.has(q), `${q} is in a step`).toBe(true);
      expect(mark(q, a).kind, `${q} = ${a}`).toBe('correct');
    }
  });
});

describe('learn-step — answers that are numbers (his notes §5)', () => {
  it('works his Example 5a and gets his 18', () => {
    const q = squareFromSumAndProduct('a', 'b', 30, -6, '+');
    expect(q.prompt).toBe('Given that $ab = -6$ and $a^{2} + b^{2} = 30$, find the value of $(a + b)^{2}$.');
    expect(q.lines.map(l => l.tex)).toEqual([
      '(a + b)^{2} = a^{2} + 2ab + b^{2}', '= a^{2} + b^{2} + 2ab', '= 30 + 2(-6)', '= 18',
    ]);
    expect(q.answer).toBe(18);
  });

  it('works his Example 5b and gets his 33', () => {
    const q = sumFromSquareAndProduct('a', 'b', 9, 12, '-');
    expect(q.lines.map(l => l.tex)).toEqual([
      '(a - b)^{2} = 9', 'a^{2} - 2ab + b^{2} = 9', 'a^{2} + b^{2} - 2(12) = 9', 'a^{2} + b^{2} = 9 + 24', '= 33',
    ]);
    expect(q.answer).toBe(33);
    expect(sumFromSquareAndProduct('x', 'y', 36, -8, '+').lines[3].tex).toBe('x^{2} + y^{2} = 36 + 16');
    expect(sumFromSquareAndProduct('x', 'y', 64, 15, '+').lines[3].tex).toBe('x^{2} + y^{2} = 64 - 30');
  });

  it('works his Example 5c and his Practice 5b', () => {
    expect(evaluateSquare(399).lines.map(l => l.tex)).toEqual([
      '399^{2}', '= (400 - 1)^{2}', '= 400^{2} - 2(400)(1) + 1^{2}', '= 160000 - 800 + 1', '= 159201',
    ]);
    expect(evaluateSquare(399).lines[0].why).toBe('rewrite 399 as 400 − 1');
    // His printed answers: 702², 1001², 997², 3999², 204²; Practice 5a Q1, Q2.
    for (const [n, want] of [[702, 492804], [1001, 1002001], [997, 994009], [3999, 15992001], [204, 41616]]) expect(evaluateSquare(n).answer).toBe(want);
    expect(squareFromSumAndProduct('x', 'y', 29, 10, '-').answer).toBe(9);
    expect(sumFromSquareAndProduct('x', 'y', 58, 6, '-').answer).toBe(70);
    expect(sumFromSquareAndProduct('x', 'y', 100, 2, '-').answer).toBe(104);
  });

  it('every line of a number working has the same value', () => {
    // Each "= …" line of an evaluated square is plain arithmetic: work it out and compare.
    for (const n of [399, 702, 997, 98, 49, 5002]) {
      const q = evaluateSquare(n);
      for (const line of q.lines) {
        const typed = parseExpr(asTyped(line.tex));
        expect(typed && [...typed.poly.values()][0]?.coef, `${n}: ${line.tex}`).toBe(n * n);
      }
    }
  });

  it('marks a typed number, and only a number', () => {
    const q = evaluateSquare(399);
    expect(mark(q, '159201').kind).toBe('correct');
    expect(mark(q, '159 201').kind).toBe('correct');
    expect(mark(q, '159200', 'trap').kind).toBe('wrong');
    expect(mark(q, '400² − 1').kind).toBe('unreadable');
    expect(mark(squareFromSumAndProduct('p', 'q', 45, -18, '-'), '81').kind).toBe('correct');
  });
});

describe('learn-step — marking and the five', () => {
  const q = '(x+3)(x-2)';
  it('passes the answer in any order and any way of typing it', () => {
    for (const a of ['x² + x − 6', 'x^2+x-6', 'x - 6 + x²', '1x² + 1x − 6']) expect(mark(q, a).kind, a).toBe('correct');
  });

  it('does not count an unfinished or unreadable line as an attempt', () => {
    expect(mark(q, '(x+3)(x-2)')).toEqual({ kind: 'unfinished', say: 'That is still in brackets. Expand it fully.' });
    expect(mark(q, 'x² − 2x + 3x − 6').kind).toBe('unfinished');
    expect(mark(q, 'x² +').kind).toBe('unreadable');
  });

  it('names the slip a wrong answer came from', () => {
    const slip = (question: string, a: string) => { const v = mark(question, a); return v.kind === 'wrong' ? v.slip.key : v.kind; };
    expect(slip(q, 'x² − 6')).toBe('first-last-only');
    expect(slip(q, 'x² + x + 1')).toBe('added-last');
    expect(slip(q, 'x² + x + 6')).toBe('sign');
    expect(slip(q, 'x² + 3x − 6')).toBe('missing-piece');
    expect(slip(q, 'x² − x − 6')).toBe('collecting');
    expect(slip(q, '7x')).toBe('other');
    expect(slip('2(a+3b)', '2a + 3b')).toBe('first-only');
  });

  it('says the sign slip with the two numbers in it', () => {
    const v = mark('(x-6)(x-2)', 'x² − 8x − 12');
    expect(v.kind === 'wrong' && v.slip.say).toBe('Check the sign of one piece: $(-6) \\times (-2) = 12$.');
  });

  it('passes on four of five and names the slip made most', () => {
    const sign = { key: 'sign', say: 's' }, other = { key: 'other', say: 'o' };
    expect(fiveResult([null, null, null, null, sign])).toEqual({ right: 4, passed: true, watch: sign });
    expect(fiveResult([null, other, sign, sign, null])).toEqual({ right: 2, passed: false, watch: sign });
    expect(fiveResult([null, null, null, null, null])).toEqual({ right: 5, passed: true, watch: null });
  });
});

describe('learn-steps — the chapter', () => {
  it('every question can be read and answered, every set is five, and none repeats in a step', () => {
    for (const step of LEARN_STEPS) {
      for (const set of step.sets) expect(set).toHaveLength(FIVE);
      const all = allQuestions(step).map(qOf);
      expect(new Set(all).size, step.slug).toBe(all.length);
      for (const x of allQuestions(step)) {
        const w = work(x);
        expect(w, `${step.slug}: ${qOf(x)}`).not.toBeNull();
        expect(mark(x, asTyped(w!.answerTex)).kind, `${step.slug}: ${qOf(x)} = ${w!.answerTex}`).toBe('correct');
      }
      expect(setFor(step, step.sets.length)).toBe(step.sets[0]);
    }
  });

  it('runs in the order of his notes, each step leading to one that exists', () => {
    expect(LEARN_STEPS.map(s => s.index)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
    for (const step of LEARN_STEPS) {
      if (step.nextSlug) expect(learnStepBySlug(step.nextSlug), `${step.slug} → ${step.nextSlug}`).not.toBeNull();
      // A step's clip must be a lesson that exists.
      if (step.clipSlug) expect(lessonBySlug(step.clipSlug), step.clipSlug).not.toBeNull();
    }
    expect(learnStepForClip('expand-two-brackets-s2')?.slug).toBe('expand-two-brackets');
    expect(learnStepForClip('binomial-theorem-am')).toBeNull();
    expect(learnStepBySlug('nope')).toBeNull();
  });
});
