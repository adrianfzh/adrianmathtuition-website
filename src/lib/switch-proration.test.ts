import { describe, it, expect } from 'vitest';
import { computeSwitchProration } from './switch-proration';

describe('computeSwitchProration', () => {
  // REGRESSION — Kiara Tan Jia Min, Jul 2026: invoice billed 5 Fridays ($350
  // base at $70), she switched Fri→Sat and actually has 4 Saturday lessons.
  // The old forward-only formula gave $0 (4 remaining Fri == 4 remaining Sat
  // from the switch date) and the $70 overbill was invisible. Ground-truth
  // reconciliation must surface a −$70 credit.
  it('Kiara: 4 actual vs 5 billed → −$70 credit', () => {
    const r = computeSwitchProration(4, 350, 70);
    expect(r.billedLessonCount).toBe(5);
    expect(r.adjustment).toBe(-70);
  });

  it('no change when actual matches billed', () => {
    expect(computeSwitchProration(4, 280, 70).adjustment).toBe(0);
  });

  it('extra lesson gained by the switch → positive charge', () => {
    // Switch mid-month onto a weekday with an extra occurrence: 5 actual vs 4 billed.
    const r = computeSwitchProration(5, 280, 70);
    expect(r.billedLessonCount).toBe(4);
    expect(r.adjustment).toBe(70);
  });

  it('two lessons dropped → −$140 credit', () => {
    expect(computeSwitchProration(3, 350, 70).adjustment).toBe(-140);
  });

  it('no issued invoice (null base) → adjustment 0, nothing to reconcile', () => {
    const r = computeSwitchProration(4, null, 70);
    expect(r.adjustment).toBe(0);
    expect(r.billedLessonCount).toBe(0);
  });

  it('undefined base behaves like null', () => {
    expect(computeSwitchProration(4, undefined, 70).adjustment).toBe(0);
  });

  it('zero / missing rate is a no-op, never divides by zero', () => {
    expect(computeSwitchProration(4, 280, 0).adjustment).toBe(0);
    expect(computeSwitchProration(4, 280, 0).billedLessonCount).toBe(0);
  });

  it('recovers billed count from base even at other rates', () => {
    expect(computeSwitchProration(4, 320, 80).billedLessonCount).toBe(4); // $80 rate
    expect(computeSwitchProration(3, 320, 80).adjustment).toBe(-80);
  });

  it('rounds a base amount carrying float noise to the nearest lesson', () => {
    // 349.99 / 70 = 4.9999 → 5 billed, not 4.
    expect(computeSwitchProration(4, 349.99, 70).billedLessonCount).toBe(5);
  });
});
