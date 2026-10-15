import { describe, expect, it } from 'vitest';
import { coreLength, fromScienceLevel } from './practice-levels';

describe('practice levels', () => {
  it('splits Core by marks', () => {
    expect(coreLength(4)).toBe('short');
    expect(coreLength(5)).toBe('long');
    expect(coreLength(null)).toBeNull();
  });
  it('maps science levels onto the three names', () => {
    expect(fromScienceLevel('core')).toBe('core');
    expect(fromScienceLevel('exam')).toBe('core');
    expect(fromScienceLevel('challenge')).toBe('advanced');
  });
});
