import { describe, expect, it } from 'vitest';
import { equal, isCollected, parseExpr, polyTex } from './poly';
import {
  allQuestions, answerTex, expansion, fiveResult, mark, parseBrackets, setFor, working, FIVE,
} from './revise-step';
import { REVISE_STEPS, reviseStepBySlug } from './revise-steps';

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
      '= x(x - 2) + 3(x - 2)',
      '= x^{2} - 2x + 3x - 6',
      '= x^{2} + x - 6',
    ]);
    expect(answerTex(br)).toBe('x^{2} + x - 6');
  });

  it('carries a minus in the first bracket into the split line', () => {
    expect(working(parseBrackets('(2x-5)(3x-1)')!).map(l => l.tex)).toEqual([
      '(2x - 5)(3x - 1)',
      '= 2x(3x - 1) - 5(3x - 1)',
      '= 6x^{2} - 2x - 15x + 5',
      '= 6x^{2} - 17x + 5',
    ]);
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
    expect(reviseStepBySlug('nope')).toBeNull();
  });
});
