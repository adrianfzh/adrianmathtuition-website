// Every P&C learn-step question: its method agrees with the exact counter, his own
// written lines end on the counted answer, and his printed answers are the count.
import { describe, expect, it } from 'vitest';
import { count } from './pc-count';
import { explain } from './pc-explain';
import { markPc, methodLines, pcFiveResult, readNumber, workedOf } from './pc-learn';
import { HIS_PRINTED, PC_STEPS, pcAllQuestions } from './pc-steps';

describe('P&C learn steps', () => {
  for (const step of PC_STEPS) {
    describe(step.slug, () => {
      it('every question is worked, checked and counted', () => {
        for (const q of pcAllQuestions(step)) {
          const w = workedOf(q);
          expect(w, q.prompt).not.toBeNull();
          const e = explain(q.spec);
          expect(e.ok && e.checked, q.prompt).toBe(true);
          const c = count(q.spec);
          expect(c.ok && c.count, q.prompt).toBe(w!.answer);
        }
      });
      it('sets of five, no question twice', () => {
        expect(step.sets.length).toBeGreaterThanOrEqual(3);
        for (const s of step.sets) expect(s).toHaveLength(5);
        const prompts = pcAllQuestions(step).map(q => q.prompt);
        expect(new Set(prompts).size).toBe(prompts.length);
      });
      it('the example has a picture or his boxes', () => {
        const w = workedOf(step.example)!;
        expect(!!w.picture || !!w.boxes).toBe(true);
      });
      it('the hints come in lines', () => expect(methodLines(step.method.fallback).length).toBeGreaterThanOrEqual(2));
    });
  }
  it('steps link up', () => {
    for (const s of PC_STEPS) if (s.nextSlug) expect(PC_STEPS.some(t => t.slug === s.nextSlug)).toBe(true);
  });
  it('his printed answers agree with the count', () => {
    for (const p of HIS_PRINTED) {
      const c = count(p.spec);
      expect(c.ok && c.count, p.where).toBe(p.printed);
    }
  });
});

describe('marking a typed number', () => {
  const apple = PC_STEPS.find(s => s.slug === 'pc-identical')!.example;
  it('reads numbers', () => {
    expect(readNumber('1,300,000,000')).toBe(1300000000);
    expect(readNumber('60 ways')).toBe(60);
    expect(readNumber('5!/2!')).toBeNull();
  });
  it('right, unreadable, and wrong with the double-count help', () => {
    expect(markPc(apple, 60, '60').kind).toBe('correct');
    expect(markPc(apple, 60, 'sixty').kind).toBe('unreadable');
    const v = markPc(apple, 60, '120', 'watch');
    expect(v.kind).toBe('wrong');
    if (v.kind === 'wrong') expect(v.help.join(' ')).toMatch(/Counted twice: A P₁ P₂ L E and A P₂ P₁ L E/);
  });
  it('a five: 4 right passes, the slip made most is the one to watch', () => {
    const r = pcFiveResult([{ kind: 'correct' }, { kind: 'correct' }, { kind: 'correct' }, { kind: 'correct' }, { kind: 'wrong', key: 'k', help: ['x'] }]);
    expect(r).toEqual({ right: 4, passed: true, watch: 'x' });
  });
});
