import { describe, expect, it } from 'vitest';
import { equal, isCollected, parseExpr, polyTex } from './poly';
import {
  allQuestions, answerTex, expansion, fiveResult, mark, parseBrackets, questionTex, setFor, spreadTex, working, workingTaps, FIVE,
} from './revise-step';
import { REVISE_STEPS, reviseStepBySlug, reviseStepForClip } from './revise-steps';

const tex = (s: string) => polyTex(parseExpr(s)!.poly);

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

describe('revise-step — the working is derived from the brackets', () => {
  it('writes one chain, a line per step', () => {
    const br = parseBrackets('(x+3)(x-2)')!;
    expect(working(br).map(l => l.tex)).toEqual([
      '(x + 3)(x - 2)',
      '= x^{2} - 2x + 3x - 6',
      '= x^{2} + x - 6',
    ]);
    expect(answerTex(br)).toBe('x^{2} + x - 6');
  });

  it('writes one piece per arrow, in the order the arrows are numbered', () => {
    const br = parseBrackets('(2x-5)(3x-1)')!;
    expect(working(br).map(l => l.tex)).toEqual([
      '(2x - 5)(3x - 1)',
      '= 6x^{2} - 2x - 15x + 5',
      '= 6x^{2} - 17x + 5',
    ]);
    expect(workingTaps(br)).toBe(5);
  });

  it('every line of every working equals the question', () => {
    for (const step of REVISE_STEPS) {
      for (const q of allQuestions(step)) {
        const br = parseBrackets(q)!;
        expect(br, q).not.toBeNull();
        for (const line of working(br)) {
          const typed = parseExpr(line.tex.replace(/^= /, '').replace(/[{}]/g, ''));
          expect(typed, `${q} → ${line.tex}`).not.toBeNull();
          expect(equal(typed!.poly, expansion(br)), `${q} → ${line.tex}`).toBe(true);
        }
      }
    }
  });
});

describe('revise-step — one term outside a bracket', () => {
  it('works 2(a + 3b) as two arrows and nothing to add up', () => {
    const br = parseBrackets('2(a+3b)')!;
    expect(working(br).map(l => l.tex)).toEqual(['2(a + 3b)', '= 2a + 6b']);
    expect(workingTaps(br)).toBe(2);
    expect(answerTex(br)).toBe('2a + 6b');
  });

  it('keeps the pieces in arrow order and carries a negative outside', () => {
    expect(answerTex(parseBrackets('m(5-m)')!)).toBe('5m - m^{2}');
    expect(working(parseBrackets('-3(2x-5)')!).map(l => l.tex)).toEqual(['-3(2x - 5)', '= -6x + 15']);
    expect(mark('m(5-m)', '5m − m²').kind).toBe('correct');
    expect(mark('m(5-m)', '−m² + 5m').kind).toBe('correct');
  });

  it('names the slips of a single bracket', () => {
    const slip = (q: string, a: string) => { const v = mark(q, a); return v.kind === 'wrong' ? v.slip.say : v.kind; };
    expect(slip('2(a+3b)', '2a + 3b')).toBe('The term outside multiplies every term inside the bracket: $2 \\times 3b = 6b$.');
    expect(slip('-3(2x-5)', '−6x − 15')).toBe('Check the sign of one piece: $(-3) \\times (-5) = 15$.');
    expect(slip('3(x+4)', '3x + 7')).toBe('The last piece is a product, not a sum: $3 \\times 4 = 12$.');
  });
});

describe('revise-step — squares', () => {
  it('works (x + 3)² as the bracket times itself', () => {
    const br = parseBrackets('(x+3)^2')!;
    expect(questionTex(br)).toBe('(x + 3)^{2}');
    expect(spreadTex(br)).toBe('(x + 3)(x + 3)');
    expect(working(br).map(l => l.tex)).toEqual(['(x + 3)^{2}', '= x^{2} + 3x + 3x + 9', '= x^{2} + 6x + 9']);
    expect(parseBrackets('(x+3)²')?.squared).toBe(true);
  });

  it('catches the square of each term on its own', () => {
    const v = mark('(x-4)^2', 'x² + 16');
    expect(v.kind === 'wrong' && v.slip.key).toBe('first-last-only');
    expect(mark('(x-4)^2', 'x² − 8x + 16').kind).toBe('correct');
  });

  it('lets the middle pieces of a difference of squares cancel', () => {
    const br = parseBrackets('(2x+3)(2x-3)')!;
    expect(working(br).map(l => l.tex)).toEqual(['(2x + 3)(2x - 3)', '= 4x^{2} - 6x + 6x - 9', '= 4x^{2} - 9']);
    expect(mark('(2x+3)(2x-3)', '4x² − 9').kind).toBe('correct');
  });
});

describe('revise-step — marking a typed answer', () => {
  const q = '(x+3)(x-2)';
  it('passes the answer in any order and any way of typing it', () => {
    for (const a of ['x² + x − 6', 'x^2+x-6', 'x - 6 + x²', '1x² + 1x − 6']) expect(mark(q, a).kind, a).toBe('correct');
  });

  it('does not count an unfinished or unreadable line as an attempt', () => {
    expect(mark(q, '(x+3)(x-2)')).toEqual({ kind: 'unfinished', say: 'That is still in brackets. Expand it fully.' });
    expect(mark(q, 'x² − 2x + 3x − 6')).toEqual({ kind: 'unfinished', say: 'Right so far. Now collect the like terms.' });
    expect(mark(q, 'x² +').kind).toBe('unreadable');
  });

  it('names the slip a wrong answer came from', () => {
    const slip = (a: string) => { const v = mark(q, a); return v.kind === 'wrong' ? v.slip.key : v.kind; };
    expect(slip('x² − 6')).toBe('first-last-only');
    expect(slip('x² + x + 1')).toBe('added-last');
    expect(slip('x² + x + 6')).toBe('sign');
    expect(slip('x² + 5x − 6')).toBe('sign');
    expect(slip('x² + 3x − 6')).toBe('missing-piece');
    expect(slip('x² − x − 6')).toBe('collecting');
    expect(slip('7x')).toBe('other');
  });

  it('says the sign slip with the two numbers in it', () => {
    const v = mark('(x-6)(x-2)', 'x² − 8x − 12');
    expect(v.kind === 'wrong' && v.slip.say).toBe('Check the sign of one piece: $(-6) \\times (-2) = 12$.');
  });
});

describe('revise-step — the five', () => {
  it('passes on four of five and names the slip made most', () => {
    const sign = { key: 'sign', say: 's' }, other = { key: 'other', say: 'o' };
    expect(fiveResult([null, null, null, null, sign])).toEqual({ right: 4, passed: true, watch: sign });
    expect(fiveResult([null, other, sign, sign, null])).toEqual({ right: 2, passed: false, watch: sign });
    expect(fiveResult([null, null, null, null, null])).toEqual({ right: 5, passed: true, watch: null });
  });

  it('every set is five different questions, and no question is used twice in a step', () => {
    for (const step of REVISE_STEPS) {
      for (const set of step.sets) expect(set).toHaveLength(FIVE);
      const all = allQuestions(step);
      expect(new Set(all).size).toBe(all.length);
      expect(setFor(step, step.sets.length)).toBe(step.sets[0]);
    }
    expect(reviseStepBySlug('expand-two-brackets')?.index).toBe(2);
    expect(reviseStepBySlug('expand-one-bracket')?.nextSlug).toBe('expand-two-brackets');
    expect(reviseStepBySlug('nope')).toBeNull();
    expect(reviseStepForClip('expand-two-brackets-s2')?.slug).toBe('expand-two-brackets');
    expect(reviseStepForClip('binomial-theorem-am')).toBeNull();
  });
});
