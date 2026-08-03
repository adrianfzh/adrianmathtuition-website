import { describe, it, expect } from 'vitest';
import { parseSecCapOverride, effectiveCapacity, isSecondaryLevel, secEnrollmentBlocked } from './capacity-override';

describe('parseSecCapOverride', () => {
  it('parses the on state', () => {
    expect(parseSecCapOverride('{"secCap":5}')).toBe(5);
    expect(parseSecCapOverride('{"secCap":4}')).toBe(4);
  });
  it('null/absent/off states parse to null', () => {
    expect(parseSecCapOverride('{"secCap":null}')).toBeNull();
    expect(parseSecCapOverride('{}')).toBeNull();
    expect(parseSecCapOverride('')).toBeNull();
    expect(parseSecCapOverride(null)).toBeNull();
    expect(parseSecCapOverride(undefined)).toBeNull();
  });
  it('rejects garbage and out-of-range values', () => {
    expect(parseSecCapOverride('not json')).toBeNull();
    expect(parseSecCapOverride('{"secCap":"5"}')).toBeNull();
    expect(parseSecCapOverride('{"secCap":0}')).toBeNull();
    expect(parseSecCapOverride('{"secCap":9}')).toBeNull();
    expect(parseSecCapOverride('{"secCap":5.5}')).toBeNull();
  });
});

describe('isSecondaryLevel', () => {
  it('matches the Slots Level option exactly (case/space tolerant)', () => {
    expect(isSecondaryLevel('Secondary')).toBe(true);
    expect(isSecondaryLevel(' secondary ')).toBe(true);
    expect(isSecondaryLevel('JC')).toBe(false);
    expect(isSecondaryLevel('Adhoc')).toBe(false);
    expect(isSecondaryLevel('')).toBe(false);
    expect(isSecondaryLevel(null)).toBe(false);
  });
});

describe('effectiveCapacity', () => {
  it('caps Secondary slots when the override is on', () => {
    expect(effectiveCapacity(6, 'Secondary', 5)).toBe(5);
  });
  it('leaves everything untouched when the override is off', () => {
    expect(effectiveCapacity(6, 'Secondary', null)).toBe(6);
    expect(effectiveCapacity(6, 'JC', null)).toBe(6);
  });
  it('never affects non-Secondary slots', () => {
    expect(effectiveCapacity(6, 'JC', 5)).toBe(6);
    expect(effectiveCapacity(6, 'Adhoc', 5)).toBe(6);
  });
  it('only lowers, never raises — a deliberately small slot keeps its own cap', () => {
    expect(effectiveCapacity(4, 'Secondary', 5)).toBe(4);
  });
  it('null stored capacity stays null so "no capacity set" errors still fire', () => {
    expect(effectiveCapacity(null, 'Secondary', 5)).toBeNull();
    expect(effectiveCapacity(undefined, 'Secondary', 5)).toBeNull();
  });
});

describe('secEnrollmentBlocked (ceiling semantics — stored Normal Capacity 4 is advisory)', () => {
  it('blocks a Sec class already at/over the ceiling', () => {
    expect(secEnrollmentBlocked(5, 'Secondary', 5)).toBe(true);
    expect(secEnrollmentBlocked(6, 'Secondary', 5)).toBe(true);
  });
  it('classes below the ceiling stay addable — the stored 4 plays no part', () => {
    expect(secEnrollmentBlocked(4, 'Secondary', 5)).toBe(false);
    expect(secEnrollmentBlocked(0, 'Secondary', 5)).toBe(false);
  });
  it('never fires when off, for JC, or with missing count', () => {
    expect(secEnrollmentBlocked(6, 'Secondary', null)).toBe(false);
    expect(secEnrollmentBlocked(6, 'JC', 5)).toBe(false);
    expect(secEnrollmentBlocked(null, 'Secondary', 5)).toBe(false);
    expect(secEnrollmentBlocked(undefined, 'Secondary', 5)).toBe(false);
  });
});
