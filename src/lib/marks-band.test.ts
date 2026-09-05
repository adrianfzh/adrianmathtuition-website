import { describe, it, expect } from 'vitest';
import { parseBand, bandKey, bandPool, applyBand } from './marks-band';

const q = (id: string, marks: number | null) => ({ id, marks });
// A Plane-Geometry-shaped pool: 4s and 5s, 6s and 7s, 8s and up.
const POOL = [q('a', 4), q('b', 5), q('c', 5), q('d', 6), q('e', 7), q('f', 7), q('g', 8), q('h', 9), q('i', 10)];
const firstN = <T,>(items: T[], n: number) => items.slice(0, n);

describe('parseBand — the wire form', () => {
  it('names, mixed, and splits', () => {
    expect(parseBand('advanced')).toEqual({ kind: 'one', band: 'advanced' });
    expect(parseBand('Mixed')).toBeNull();
    expect(parseBand(undefined)).toBeNull();
    expect(parseBand('2/2/2')).toEqual({ kind: 'split', counts: [2, 2, 2] });
    expect(parseBand('3/3')).toEqual({ kind: 'split', counts: [3, 0, 3] });   // standard / advanced
    expect(parseBand('0/0/0')).toBeNull();
    expect(parseBand('hard')).toBeNull();                                    // the bot maps words; the wire is strict
  });
  it('bandKey round-trips for the blob path', () => {
    expect(bandKey(null)).toBe('mixed');
    expect(bandKey(parseBand('intermediate'))).toBe('intermediate');
    expect(bandKey(parseBand('2/2/2'))).toBe('2-2-2');
  });
});

describe('bandPool — tertiles of marks over THIS topic\'s pool', () => {
  it('splits a spread pool into three', () => {
    const b = bandPool(POOL);
    expect(b.standard.map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(b.intermediate.map(x => x.id)).toEqual(['d', 'e', 'f']);
    expect(b.advanced.map(x => x.id)).toEqual(['g', 'h', 'i']);
  });
  it('a question with no marks is standard, never advanced', () => {
    const b = bandPool([q('x', null), q('y', 2), q('z', 9)]);
    expect(b.standard.map(x => x.id)).toContain('x');
    expect(b.advanced.map(x => x.id)).not.toContain('x');
  });
  it('a flat pool is all standard rather than a pretend three-way split', () => {
    const b = bandPool([q('a', 5), q('b', 5), q('c', 5)]);
    expect(b.standard.length).toBe(3);
    expect(b.advanced.length).toBe(0);
  });
  it('is deterministic — the same pool bands the same way', () => {
    expect(bandPool(POOL)).toEqual(bandPool([...POOL]));
  });
});

describe('applyBand', () => {
  it('mixed is the plain draw', () => {
    expect(applyBand(POOL, null, 4, firstN).items.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('one band draws inside that band', () => {
    const r = applyBand(POOL, parseBand('advanced'), 2, firstN);
    expect(r.items.map(x => x.id)).toEqual(['g', 'h']);
    expect(r.bandFallback).toBe(false);
  });
  it('a 2/2/2 split takes two from each, standard first', () => {
    const r = applyBand(POOL, parseBand('2/2/2'), 6, firstN);
    expect(r.items.map(x => x.id)).toEqual(['a', 'b', 'd', 'e', 'g', 'h']);
    expect(r.bandFallback).toBe(false);
  });
  it('a thin band falls back to the whole pool and SAYS so', () => {
    const thin = [q('a', 5), q('b', 5), q('c', 5), q('d', 5)];
    const r = applyBand(thin, parseBand('advanced'), 2, firstN);
    expect(r.items.length).toBe(2);
    expect(r.bandFallback).toBe(true);
  });
  it('a split never repeats a question across bands', () => {
    const r = applyBand(POOL, parseBand('4/4/4'), 12, firstN);
    const ids = r.items.map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.bandFallback).toBe(true);   // only 3 per band exist, so the 4th came from elsewhere
  });
});
