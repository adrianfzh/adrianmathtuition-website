import { describe, it, expect } from 'vitest';
import { evaluate, type EvalCtx } from '../engine';

const ctx: EvalCtx = { angle: 'RAD', ans: 0, vars: {} };

function val(input: string): number {
  const r = evaluate(input, ctx);
  if (!r.ok) throw new Error(`evaluate("${input}") failed: ${r.error}`);
  return r.value;
}

describe('engine.evaluate — arithmetic', () => {
  it('respects operator precedence', () => {
    expect(val('2+3*4')).toBe(14);
    expect(val('(2+3)*4')).toBe(20);
  });
  it('division and powers', () => {
    expect(val('10/4')).toBe(2.5);
    expect(val('2^10')).toBe(1024);
  });
  it('factorial (postfix !)', () => {
    expect(val('5!')).toBe(120);
    expect(val('0!')).toBe(1);
  });
});

describe('engine.evaluate — error paths', () => {
  it('division by zero is a clean error, not a throw', () => {
    const r = evaluate('1/0', ctx);
    expect(r.ok).toBe(false);
  });
  it('garbage input is a clean error', () => {
    const r = evaluate('2++', ctx);
    expect(r.ok).toBe(false);
  });
});
