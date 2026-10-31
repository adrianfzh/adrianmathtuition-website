import { describe, it, expect } from 'vitest';
import { calcHelp, CALC_KEYS } from './calculator-help';

describe('calcHelp — the 🧮 card a clip opens', () => {
  it('lists the asked keys in order, each once', () => {
    expect(calcHelp(['power', 'ncr', 'power']).map(h => h.title)).toEqual([calcHelp(['power'])[0].title, calcHelp(['ncr'])[0].title]);
  });
  it('skips unknown keys and nothing', () => {
    expect(calcHelp(['sin', 'ncr'])).toHaveLength(1);
    expect(calcHelp(undefined)).toEqual([]);
  });
  it('every key has steps, one idea a line', () => {
    for (const k of CALC_KEYS) {
      const [h] = calcHelp([k]);
      expect(h.lines.length).toBeGreaterThan(1);
      for (const l of h.lines) expect(l.length).toBeLessThan(120);
    }
  });
});
