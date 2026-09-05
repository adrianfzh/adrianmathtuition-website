import { describe, it, expect } from 'vitest';
import {
  ERROR_KINDS, ERROR_KIND_LABEL, ERROR_KIND_HINT, CARELESS_KINDS, CONCEPT_KINDS,
  isErrorKind, errorKindTotals, emptyErrorKindTotals, hasLabelledLoss,
} from './error-kinds';

// Shaped like the bot's results[] entries: the marker writes `marking_output`
// (the contract) and a back-compat `marking` copy of the same parts.
const part = (max: number, awarded: number, error_kind?: unknown) => ({
  label: '(a)', max, awarded, error_summary: awarded < max ? 'lost something' : null,
  ...(error_kind === undefined ? {} : { error_kind }),
});
const question = (parts: unknown[]) => ({
  question_number: '1',
  marking: { parts, total_awarded: 0, total_max: 0 },
  marking_output: { parts, lines: [] },
});

describe('the contract', () => {
  it('is exactly the eight codes the bot writes, in this order', () => {
    expect([...ERROR_KINDS]).toEqual(['concept', 'arithmetic', 'transfer', 'sign', 'rounding', 'units', 'misread', 'incomplete', 'careless']);
  });

  it('every code has a student label and a desk hint', () => {
    for (const k of ERROR_KINDS) {
      expect(ERROR_KIND_LABEL[k]).toBeTruthy();
      expect(ERROR_KIND_HINT[k]).toBeTruthy();
      expect(ERROR_KIND_LABEL[k]).toBe(ERROR_KIND_LABEL[k].toLowerCase());   // sits inside a sentence
    }
  });

  it('buckets partition the codes: careless + concept-side + incomplete', () => {
    const all = [...CARELESS_KINDS, ...CONCEPT_KINDS, 'incomplete'].sort();
    expect(all).toEqual([...ERROR_KINDS].sort());
  });

  it('isErrorKind accepts the codes and nothing else', () => {
    for (const k of ERROR_KINDS) expect(isErrorKind(k)).toBe(true);
    for (const bad of ['Concept', 'arithmetic_slip', 'ratio_inversion', 'wrong_setup', '', null, undefined, 3, {}]) {
      expect(isErrorKind(bad)).toBe(false);
    }
  });
});

describe('errorKindTotals', () => {
  it('attributes marks lost per part to its kind', () => {
    const t = errorKindTotals([
      question([part(3, 1, 'concept'), part(2, 2, null)]),        // 2 lost to concept; full-marks part has null
      question([part(4, 2, 'arithmetic'), part(1, 0, 'sign')]),   // 2 arithmetic, 1 sign
    ]);
    expect(t.byKind.concept).toBe(2);
    expect(t.byKind.arithmetic).toBe(2);
    expect(t.byKind.sign).toBe(1);
    expect(t.lostTotal).toBe(5);
    expect(t.unlabelled).toBe(0);
  });

  it('rolls kinds into the three buckets', () => {
    const t = errorKindTotals([question([
      part(5, 0, 'concept'), part(2, 0, 'misread'),                       // concept-side 7
      part(3, 0, 'arithmetic'), part(2, 0, 'transfer'), part(1, 0, 'sign'),
      part(1, 0, 'rounding'), part(1, 0, 'units'),                        // careless 8
      part(3, 0, 'incomplete'),                                           // incomplete 3
    ])]);
    expect(t.concept).toBe(7);
    expect(t.careless).toBe(8);
    expect(t.incomplete).toBe(3);
    expect(t.lostTotal).toBe(18);
    expect(t.careless + t.concept + t.incomplete + t.unlabelled).toBe(t.lostTotal);
  });

  it('counts a lost part with no valid kind as unlabelled, never as a kind', () => {
    const t = errorKindTotals([question([part(3, 1), part(2, 0, null), part(2, 1, 'concept')])]);
    expect(t.unlabelled).toBe(4);
    expect(t.byKind.concept).toBe(1);
    expect(t.lostTotal).toBe(5);
  });

  it('ignores the old free-text tags — they are not kinds', () => {
    const t = errorKindTotals([question([
      part(2, 0, 'arithmetic_slip'), part(2, 0, 'ratio_inversion'), part(2, 0, 'Concept'), part(1, 0, 'other'),
    ])]);
    expect(t.unlabelled).toBe(7);
    expect(Object.values(t.byKind).every(n => n === 0)).toBe(true);
    expect(hasLabelledLoss(t)).toBe(false);
  });

  it('is robust to missing parts, missing max, and garbage entries', () => {
    const t = errorKindTotals([
      { question_number: '1' },                                   // no marking at all
      { marking_output: { parts: 'nope' } },
      { marking_output: { parts: [{ label: '(a)', awarded: 1 }, null, 7, { max: 'x', awarded: 0, error_kind: 'sign' }] } },
      null, 'string', 42,
      question([part(2, 3, 'sign')]),                             // awarded above max: nothing lost
    ]);
    expect(t).toEqual(emptyErrorKindTotals());
  });

  it('falls back to the back-compat marking.parts when marking_output has none', () => {
    const t = errorKindTotals([{ marking: { parts: [part(2, 0, 'units')] } }]);
    expect(t.byKind.units).toBe(2);
  });

  it('returns zeros for empty or non-array input', () => {
    expect(errorKindTotals([])).toEqual(emptyErrorKindTotals());
    expect(errorKindTotals(undefined)).toEqual(emptyErrorKindTotals());
    expect(errorKindTotals({ results: [] })).toEqual(emptyErrorKindTotals());
    expect(hasLabelledLoss(errorKindTotals([]))).toBe(false);
    expect(hasLabelledLoss(null)).toBe(false);
  });

  it('hasLabelledLoss is true the moment one lost mark carries a kind', () => {
    expect(hasLabelledLoss(errorKindTotals([question([part(3, 1), part(1, 0, 'sign')])]))).toBe(true);
  });
});
