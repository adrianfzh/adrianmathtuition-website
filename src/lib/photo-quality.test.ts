// The browser photo-quality check (SPEC-PHOTO-QUALITY.md). The maths and the limits must stay
// the SAME as the bot's lib/photo-quality.js — these cases are the bot's own.
import { describe, expect, it } from 'vitest';
import { judge, scoreGrey, issueLine, LIMITS } from './photo-quality';

describe('photo-quality', () => {
  it('limits match the bot (measured on 758 real photos, 5 Nov 2026)', () => {
    expect(LIMITS).toEqual({ tinySide: 200, blurEdge: 30, dark: 40, darkEdge: 60, bright: 235, brightClip: 0.85 });
  });
  it('judge: the same verdicts as the bot', () => {
    const base = { mean: 160, edge: 53, maxSide: 4032, darkFrac: 0, clipFrac: 0, lapVar: 0 };
    expect(judge(base).ok).toBe(true);
    expect(judge({ ...base, edge: 29 }).issues).toEqual(['blurry']);
    expect(judge({ ...base, edge: 10, mean: 245, clipFrac: 0.97 }).issues).toEqual(['bright']);
    expect(judge({ ...base, edge: 10, mean: 245, clipFrac: 0.7 }).issues).toEqual(['blurry']);
    expect(judge({ ...base, edge: 50, mean: 20 }).issues).toEqual(['dark']);
    expect(judge({ ...base, edge: 300, mean: 20 }).ok).toBe(true);
    expect(judge({ ...base, maxSide: 120 }).issues).toEqual(['small']);
  });
  it('scoreGrey: crisp black-on-white strokes score high, a flat grey scores 0', () => {
    const w = 100, h = 100;
    const page = new Uint8Array(w * h).fill(240);
    for (let y = 10; y < 90; y += 8) for (let x = 10; x < 90; x++) page[y * w + x] = 20;
    expect(scoreGrey(page, w, h).edge).toBeGreaterThan(200);
    expect(scoreGrey(new Uint8Array(w * h).fill(128), w, h).edge).toBe(0);
  });
  it('each problem has a plain line', () => {
    expect(issueLine(['blurry'])).toMatch(/blurry/);
    expect(issueLine(['dark'])).toMatch(/dark/);
  });
});
