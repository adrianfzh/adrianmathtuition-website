import { describe, it, expect } from 'vitest';
import { bandForRegion, isPartialBand } from './region-crop';

describe('bandForRegion', () => {
  it('reads the two phrases the marker actually writes', () => {
    // Verbatim from Kayla's EM Practice Set 1 P1.
    const upper = bandForRegion('upper half of page, questions 7(a) and 7(b)');
    expect(upper.top).toBe(0);
    expect(upper.height).toBeCloseTo(0.58);       // half, padded downward
    const lower = bandForRegion('lower half of page');
    expect(lower.top).toBeCloseTo(0.42);
    expect(lower.height).toBeCloseTo(0.58);
  });

  it('honours thirds before halves — "top third" also contains "top"', () => {
    expect(bandForRegion('top third of the page').height).toBeCloseTo(1 / 3 + 0.08);
    expect(bandForRegion('bottom third').top).toBeCloseTo(2 / 3 - 0.08);
  });

  it('pads every band, because clipping the answer line is the real failure', () => {
    expect(bandForRegion('bottom half').top).toBeLessThan(0.5);
    expect(bandForRegion('top half').height).toBeGreaterThan(0.5);
  });

  it('never runs off either edge', () => {
    for (const r of ['top half', 'bottom half', 'top third', 'bottom third', 'middle third']) {
      const b = bandForRegion(r);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.top + b.height).toBeLessThanOrEqual(1.0001);
    }
  });

  it('shows the whole page rather than guessing', () => {
    for (const r of ['', null, undefined, 'left column', 'across the page', 'question 4']) {
      expect(isPartialBand(bandForRegion(r))).toBe(false);
    }
  });
});
