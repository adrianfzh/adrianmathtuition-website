// The P&C coach engine against Adrian's own notes ("12 Permutations and Combinations
// 1.pdf", H2) — every number below is printed there (the slips found are noted).
import { describe, expect, it } from 'vitest';
import { count, labelCopies, type PcSpec } from './pc-count';
import { explain } from './pc-explain';
import { whereWrong, whereWrongLines } from './pc-wrong';

const letters = (w: string) => w.split('');
const people = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const AZ = letters('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const D10 = letters('0123456789');

function exact(spec: PcSpec): number {
  const c = count(spec);
  if (!c.ok) throw new Error(c.reason);
  return c.count;
}
function method(spec: PcSpec): number {
  const e = explain(spec);
  if (!e.ok) throw new Error(e.reason);
  expect(e.checked).toBe(true);
  return e.total;
}

describe('the exact counter, on his notes', () => {
  const cases: [string, PcSpec, number][] = [
    ['1a(ii) A to C', { mode: 'boxes', items: [], positions: [people('r', 4), people('s', 3)] }, 12],
    ['1a(iii) 4-letter words, repeats', { mode: 'boxes', items: AZ, r: 4 }, 26 ** 4],
    ['1a(iv) telephone numbers', { mode: 'boxes', items: D10, r: 8 }, 1e8],
    ['1a(v) NRIC', { mode: 'boxes', items: [], positions: [letters('STFGM'), ...Array(7).fill(D10), AZ] }, 5 * 1e7 * 26],
    ['1b ABCDE, 5-letter words', { mode: 'row', items: letters('ABCDE') }, 120],
    ['1c 3-letter words', { mode: 'row', items: letters('ABCDE'), r: 3 }, 60],
    ['1d(ii) 7 of 10 people', { mode: 'row', items: people('P', 10), r: 7 }, 604800],
    ['1e choose 2 of 3', { mode: 'choose', items: letters('ABC'), r: 2 }, 3],
    ['1f choose 3 of 4', { mode: 'choose', items: letters('ABCD'), r: 3 }, 4],
    ['1g 3 winners of 20', { mode: 'choose', items: people('P', 20), r: 3 }, 1140],
    ['1h 4 men of 8 and 5 ladies of 7', { mode: 'choose', items: [...people('M', 8), ...people('L', 7)], r: 9, rules: [{ t: 'count', items: people('M', 8), min: 4, max: 4 }] }, 1470],
    ['1i(i) eldest in', { mode: 'choose', items: people('G', 10), r: 4, rules: [{ t: 'count', items: ['G1'], min: 1 }] }, 84],
    ['1i(ii) eldest out', { mode: 'choose', items: people('G', 10), r: 4, rules: [{ t: 'count', items: ['G1'], max: 0 }] }, 126],
    ['1k(b) ABB', { mode: 'row', items: letters('ABB') }, 3],
    ['1k(c) ABCCC', { mode: 'row', items: letters('ABCCC') }, 20],
    ['1l(a) APPLE (printed 40, a slip)', { mode: 'row', items: letters('APPLE') }, 60],
    ['1l(b) PINEAPPLE', { mode: 'row', items: letters('PINEAPPLE') }, 30240],
    ['1m(ii) 12 into two 6s', { mode: 'split', items: people('P', 12), sizes: [6, 6] }, 462],
    ['1m(iii) 12 into three 4s (printed 5575, a slip)', { mode: 'split', items: people('P', 12), sizes: [4, 4, 4] }, 5775],
    ['2a books grouped', { mode: 'row', items: [...people('M', 3), ...people('S', 4), ...people('L', 2)], rules: [{ t: 'together', items: people('M', 3) }, { t: 'together', items: people('S', 4) }, { t: 'together', items: people('L', 2) }] }, 1728],
    ['2c(i) REARRANGE', { mode: 'row', items: letters('REARRANGE') }, 15120],
    ['2c(ii) three R apart', { mode: 'row', items: letters('REARRANGE'), rules: [{ t: 'apart', items: ['R'] }] }, 6300],
    ['2c(iii) vowels apart', { mode: 'row', items: letters('REARRANGE'), rules: [{ t: 'apart', items: ['E', 'A'] }] }, 1800],
    ['3b(i) 5 balls round', { mode: 'circle', items: letters('ABCDE') }, 24],
    ['3b(ii) 3 yellow 2 red round', { mode: 'circle', items: letters('YYYRR') }, 2],
    ['3c(ii) boys together round, 9 seats', { mode: 'circle', items: [...people('B', 3), ...people('G', 6)], rules: [{ t: 'together', items: people('B', 3) }] }, 4320],
    ['3d(i) 3 people in 7 chairs', { mode: 'row', items: ['M', 'W', 'C', '_', '_', '_', '_'] }, 210],
    ['Practice 1 MAMMAL', { mode: 'row', items: letters('MAMMAL') }, 60],
    ['Practice 3 twins', { mode: 'row', items: letters('AABBCC') }, 90],
    ['Practice 7(iv) six balls into three 2s', { mode: 'split', items: letters('ABCDEF'), sizes: [2, 2, 2] }, 15],
    ['Practice 7(iii) into boxes A, B, C', { mode: 'split', items: letters('ABCDEF'), sizes: [2, 2, 2], labelled: true }, 90],
    ['Practice 8(ii) SCIENCE, E apart', { mode: 'row', items: letters('SCIENCE'), rules: [{ t: 'apart', items: ['E'] }] }, 900],
    ['Practice 8(iii) SCIENCE, vowels apart', { mode: 'row', items: letters('SCIENCE'), rules: [{ t: 'apart', items: ['I', 'E'] }] }, 360],
    ['Practice 13 at least 2 of 13 F', { mode: 'choose', items: [...people('F', 13), ...people('M', 7)], r: 4, rules: [{ t: 'count', items: people('F', 13), min: 2 }] }, 4355],
  ];
  for (const [name, spec, want] of cases) it(name, () => expect(exact(spec)).toBe(want));

  it('refuses politely when too big', () => {
    const c = count({ mode: 'row', items: people('P', 12) });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toMatch(/Too big/);
  });
});

describe('explain a question: the method agrees with the counter', () => {
  const cases: [string, PcSpec, number][] = [
    ['boxes 26⁴', { mode: 'boxes', items: AZ, r: 4 }, 456976],
    ['nPr', { mode: 'row', items: letters('ABCDE'), r: 3 }, 60],
    ['identical letters', { mode: 'row', items: letters('PINEAPPLE') }, 30240],
    ['nCr', { mode: 'choose', items: people('P', 20), r: 3 }, 1140],
    ['committee', { mode: 'choose', items: [...people('M', 8), ...people('L', 7)], r: 9, rules: [{ t: 'count', items: people('M', 8), min: 4, max: 4 }] }, 1470],
    ['eldest in', { mode: 'choose', items: people('G', 10), r: 4, rules: [{ t: 'count', items: ['G1'], min: 1 }] }, 84],
    ['at least 2 (cases)', { mode: 'choose', items: [...people('F', 13), ...people('M', 7)], r: 4, rules: [{ t: 'count', items: people('F', 13), min: 2 }] }, 4355],
    ['grouping', { mode: 'row', items: [...people('M', 3), ...people('S', 4), ...people('L', 2)], rules: [{ t: 'together', items: people('M', 3) }, { t: 'together', items: people('S', 4) }, { t: 'together', items: people('L', 2) }] }, 1728],
    ['slotting', { mode: 'row', items: letters('REARRANGE'), rules: [{ t: 'apart', items: ['R'] }] }, 6300],
    ['slotting vowels', { mode: 'row', items: letters('REARRANGE'), rules: [{ t: 'apart', items: ['E', 'A'] }] }, 1800],
    ['circle together', { mode: 'circle', items: [...people('B', 3), ...people('G', 6)], rules: [{ t: 'together', items: people('B', 3) }] }, 4320],
    ['split', { mode: 'split', items: people('P', 12), sizes: [4, 4, 4] }, 5775],
    ['start or end (PARALLEL)', { mode: 'row', items: letters('PARALLEL'), rules: [{ t: 'any', rules: [{ t: 'start', item: 'L' }, { t: 'end', item: 'A' }] }] }, 1740],
    ['between (S and T, 2 between)', { mode: 'row', items: letters('SCHEMT'), rules: [{ t: 'between', a: 'S', b: 'T', k: 2 }] }, 144],
  ];
  for (const [name, spec, want] of cases) it(name, () => expect(method(spec)).toBe(want));

  it('a picture spec for the pictured methods', () => {
    const e = explain({ mode: 'row', items: letters('REARRANGE'), rules: [{ t: 'apart', items: ['R'] }] });
    expect(e.ok && e.picture).toMatchObject({ kind: 'pc_arrange', total: 6300 });
  });

  it('fails closed: a circle with identical objects has no (n − 1)!/p! method shown', () => {
    // (6 − 1)!/(3!·3!) is not a whole number; the true count is 4.
    expect(exact({ mode: 'circle', items: letters('YYYRRR') })).toBe(4);
    expect(explain({ mode: 'circle', items: letters('YYYRRR') }).ok).toBe(false);
  });
});

describe('where did I count wrong', () => {
  it('APPLE as 5! = 120: the two Ps swapped are counted twice', () => {
    const w = whereWrong({ mode: 'row', items: letters('APPLE') }, 120);
    expect(w.kind).toBe('found');
    if (w.kind !== 'found') return;
    expect(w.key).toBe('identical-as-different');
    expect(w.examples.doubles[0]).toEqual(['A P₁ P₂ L E', 'A P₂ P₁ L E']);
    expect(whereWrongLines(w).join('\n')).toMatch(/Counted twice: A P₁ P₂ L E and A P₂ P₁ L E/);
  });
  it('choose 3 of 4 as ⁴P₃ = 24: order counted', () => {
    const w = whereWrong({ mode: 'choose', items: letters('ABCD'), r: 3 }, 24);
    expect(w.kind === 'found' && w.key).toBe('order-counted');
    if (w.kind === 'found') expect(w.examples.doubles[0]).toEqual(['ABC', 'ACB']);
  });
  it('3-letter words as ⁵C₃ = 10: order ignored, ACB missed', () => {
    const w = whereWrong({ mode: 'row', items: letters('ABCDE'), r: 3 }, 10);
    expect(w.kind === 'found' && w.key).toBe('order-ignored');
    if (w.kind === 'found') expect(w.examples.missing.length).toBeGreaterThan(0);
  });
  it('4-letter words with repeats as 26 × 25 × 24 × 23: AAAA missed', () => {
    const w = whereWrong({ mode: 'boxes', items: letters('ABCDEF'), r: 3 }, 120);
    expect(w.kind === 'found' && w.key).toBe('repeat-forbidden');
    if (w.kind === 'found') expect(w.examples.missing[0]).toBe('AAA');
  });
  it('the block not arranged inside', () => {
    const w = whereWrong({ mode: 'row', items: [...people('G', 2), ...people('B', 3)], rules: [{ t: 'together', items: people('G', 2) }] }, 24);
    expect(w.kind === 'found' && w.key).toBe('block-fixed');
  });
  it('round the table counted as a row', () => {
    const w = whereWrong({ mode: 'circle', items: letters('ABCD') }, 24);
    expect(w.kind === 'found' && w.key).toBe('circle-as-row');
  });
  it('equal groups not divided', () => {
    const w = whereWrong({ mode: 'split', items: letters('ABCD'), sizes: [2, 2] }, 6);
    expect(w.kind === 'found' && w.key).toBe('groups-named');
  });
  it('start with L OR end with A, both counted twice', () => {
    const w = whereWrong({ mode: 'row', items: letters('PARALLEL'), rules: [{ t: 'any', rules: [{ t: 'start', item: 'L' }, { t: 'end', item: 'A' }] }] }, 2100);
    expect(w.kind === 'found' && w.key).toMatch(/^or-overlap/);
  });
  it('three apart by total − together', () => {
    // SCIENCE, I E E apart: 1260 − (5!/2! × 3) = 900 is NOT the answer 360.
    const w = whereWrong({ mode: 'row', items: letters('SCIENCE'), rules: [{ t: 'apart', items: ['I', 'E'] }] }, 1260 - 180);
    expect(w.kind === 'found' && w.key).toBe('apart-by-complement');
  });
  it('a number no slip explains', () => {
    expect(whereWrong({ mode: 'row', items: letters('ABCDE'), r: 3 }, 61).kind).toBe('unknown');
  });
  it('copies are numbered for showing', () => expect(labelCopies(letters('APPLE'))).toEqual(['A', 'P₁', 'P₂', 'L', 'E']));
});
