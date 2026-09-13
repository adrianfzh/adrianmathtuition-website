import { describe, it, expect } from 'vitest';
import { accountKey, parseSlotAccounts, isSlotAccountOn, offKeys, withSlotAccount, slotAccountRows, SLOT_ACCOUNTS } from './slot-accounts';

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
