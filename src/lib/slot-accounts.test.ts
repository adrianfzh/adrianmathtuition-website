import { describe, it, expect } from 'vitest';
import { accountKey, parseSlotAccounts, isSlotAccountOn, offKeys, withSlotAccount, slotAccountRows, SLOT_ACCOUNTS, parseSlotUsage, withSlotUsage } from './slot-accounts';

describe('accountKey — the workers\' plan-limit key', () => {
  it('lowercases and turns every non-alphanumeric run into a dash, like ~/.adrianmath-plan-limit-until.<key>', () => {
    expect(accountKey('ablnon@gmail.com')).toBe('ablnon-gmail-com');
    expect(accountKey('  AdrianMathTuition@Gmail.com ')).toBe('adrianmathtuition-gmail-com');
    expect(accountKey('')).toBe('default');
  });
});

describe('parseSlotAccounts — fail open', () => {
  it('reads a map keyed by email or by key, and treats anything but on:false as on', () => {
    const m = parseSlotAccounts(JSON.stringify({ 'ablnon@gmail.com': { on: false, at: '2026-09-13T13:00:00Z', by: 'adrian' }, 'ablnon-hotmail-com': { on: true } }));
    expect(isSlotAccountOn(m, 'ablnon@gmail.com')).toBe(false);
    expect(isSlotAccountOn(m, 'ablnon@hotmail.com')).toBe(true);
    expect(isSlotAccountOn(m, 'adrianmathtuition@gmail.com')).toBe(true);
    expect(offKeys(m)).toEqual(['ablnon-gmail-com']);
  });
  it('an unreadable row is an empty map — every account on', () => {
    expect(parseSlotAccounts('not json')).toEqual({});
    expect(parseSlotAccounts(null)).toEqual({});
    expect(offKeys(parseSlotAccounts(undefined))).toEqual([]);
  });
});

describe('withSlotAccount and the card rows', () => {
  it('flips one account and keeps the rest; the rows list every known account with its state', () => {
    const m = withSlotAccount({}, 'ablnon@hotmail.com', false, 'adrian', '2026-09-13T13:30:00Z');
    const m2 = withSlotAccount(m, 'ablnon@gmail.com', true, 'adrian', '2026-09-13T13:31:00Z');
    expect(offKeys(m2)).toEqual(['ablnon-hotmail-com']);
    const rows = slotAccountRows(m2);
    expect(rows).toHaveLength(SLOT_ACCOUNTS.length);
    expect(rows.find(r => r.email === 'ablnon@hotmail.com')).toMatchObject({ on: false, by: 'adrian', key: 'ablnon-hotmail-com' });
    expect(rows.find(r => r.email === 'adrianmathtuition@gmail.com')).toMatchObject({ on: true, at: null });
  });
});

describe('slot usage — the picker\'s meters (22 Sep 2026)', () => {
  it('parses what the picker posts, keyed by email or key, clamps to 0–100 and drops an entry with no meter', () => {
    const u = parseSlotUsage(JSON.stringify({
      'ablnon@gmail.com': { five_hour: 28, seven_day: 49.04, resets_5h: '2026-09-22T12:00:00Z', at: '2026-09-22T10:00:00Z', from: 'fly' },
      'ablnon-hotmail-com': { h5: '101', d7: -3 },
      'adrianmathtuition@gmail.com': { from: 'air' },
    }));
    expect(u['ablnon-gmail-com']).toMatchObject({ five_hour: 28, seven_day: 49, resets_5h: '2026-09-22T12:00:00Z', from: 'fly' });
    expect(u['ablnon-hotmail-com']).toMatchObject({ five_hour: 100, seven_day: 0 });
    expect(u['adrianmathtuition-gmail-com']).toBeUndefined();
    expect(parseSlotUsage('nope')).toEqual({});
  });
  it('merges a post over the stored map, keeps accounts not named, and ignores a reading older than the stored one', () => {
    const stored = parseSlotUsage(JSON.stringify({ a: { five_hour: 10, seven_day: 20, at: '2026-09-22T10:00:00Z' }, b: { five_hour: 50, seven_day: 60, at: '2026-09-22T10:00:00Z' } }));
    const m = withSlotUsage(stored, { a: { five_hour: 15, seven_day: 25, at: '2026-09-22T11:00:00Z' }, b: { five_hour: 1, seven_day: 1, at: '2026-09-22T09:00:00Z' } });
    expect(m.a).toMatchObject({ five_hour: 15, seven_day: 25 });
    expect(m.b).toMatchObject({ five_hour: 50, seven_day: 60 });
    expect(withSlotUsage(stored, null)).toBe(stored);
  });
  it('the card rows carry each account\'s usage, null when nothing was read', () => {
    const rows = slotAccountRows({}, parseSlotUsage(JSON.stringify({ 'ablnon@gmail.com': { five_hour: 5, seven_day: 40, at: '2026-09-22T10:00:00Z' } })));
    expect(rows.find(r => r.email === 'ablnon@gmail.com')?.usage).toMatchObject({ five_hour: 5, seven_day: 40 });
    expect(rows.find(r => r.email === 'ablnon@hotmail.com')?.usage).toBeNull();
  });
});
