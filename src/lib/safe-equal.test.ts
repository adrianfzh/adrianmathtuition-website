import { describe, expect, it } from 'vitest';
import { safeEqual } from './safe-equal';

describe('safeEqual', () => {
  it('accepts identical strings', () => {
    expect(safeEqual('secret-value', 'secret-value')).toBe(true);
  });

  it('rejects different strings of equal length', () => {
    expect(safeEqual('aaaa', 'aaab')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    // Unguarded crypto.timingSafeEqual throws here — the length guard is the point.
    expect(safeEqual('short', 'a-much-longer-string')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });

  it('treats two empty strings as equal (callers must pre-reject empty secrets)', () => {
    expect(safeEqual('', '')).toBe(true);
  });

  it('compares by bytes, not JS code units', () => {
    expect(safeEqual('café', 'café')).toBe(true);
    expect(safeEqual('café', 'cafe')).toBe(false);
  });
});
