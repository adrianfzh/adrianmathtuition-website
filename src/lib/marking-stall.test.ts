import { describe, it, expect } from 'vitest';
import { slotAccountRows, withSlotUsage, parseSlotUsage, type SlotAccountMap, type SlotUsageMap } from './slot-accounts';
import { loginHealths, poolStall, signinWarnings, stallDecision, rowStallNote, signInSteps } from './marking-stall';

// 20 Oct 2026, 6:30 pm SGT
const NOW = Date.parse('2026-10-20T10:30:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const H = 3600_000;

// The evening it happened: 1 and 2 switched off, 3 on but its sign-in dead since 3:31 pm.
const OFF: SlotAccountMap = {
  'adrianmathtuition-gmail-com': { on: false, at: '2026-10-16T01:00:00Z', by: 'adrian' },
  'ablnon-gmail-com': { on: false, at: '2026-10-19T01:00:00Z', by: 'adrian' },
};
const USAGE: SlotUsageMap = {
  'adrianmathtuition-gmail-com': { five_hour: 3, seven_day: 40, resets_5h: null, resets_7d: null, at: iso(NOW - H), from: 'fly', signin: 'ok', signin_ends: '2026-10-22T04:40:00Z', login: '1' },
  'ablnon-gmail-com': { five_hour: 0, seven_day: 20, resets_5h: null, resets_7d: null, at: iso(NOW - H), from: 'fly', signin: 'ok', signin_ends: '2026-10-22T10:34:00Z', login: '2' },
  'ablnon-hotmail-com': { five_hour: 10, seven_day: 50, resets_5h: null, resets_7d: null, at: iso(NOW - 4 * H), from: 'fly', signin: 'ok', signin_ends: '2026-10-20T07:30:57Z', login: '3' },
};

describe('loginHealth — the card tells the truth', () => {
  it('a login past its sign-in end date needs sign-in, even when the last post said ok', () => {
    const h = loginHealths(slotAccountRows(OFF, USAGE), NOW);
    expect(h.map(x => [x.login, x.on, x.worker, x.usable])).toEqual([['1', false, 'ready', false], ['2', false, 'ready', false], ['3', true, 'needs', false]]);
    expect(h[2].text).toBe('needs sign-in');
  });
  it('a full meter says until when; a meter whose reset passed is empty again', () => {
    const u: SlotUsageMap = { 'ablnon-hotmail-com': { five_hour: 99, seven_day: 50, resets_5h: iso(NOW + 2 * H), resets_7d: null, at: iso(NOW), from: 'fly' } };
    const [, , three] = loginHealths(slotAccountRows({}, u), NOW);
    expect(three.worker).toBe('full');
    expect(three.text).toMatch(/^full until Tue 20 Oct, 8:30 pm$/);
    const past: SlotUsageMap = { 'ablnon-hotmail-com': { ...u['ablnon-hotmail-com'], resets_5h: iso(NOW - 60_000) } };
    expect(loginHealths(slotAccountRows({}, past), NOW)[2].usable).toBe(true);
  });
  it('no reading at all = usable (fail open)', () => {
    expect(loginHealths(slotAccountRows({}, {}), NOW).every(x => x.usable && x.worker === 'unknown')).toBe(true);
  });
});

describe('poolStall — why nothing can mark, in plain words', () => {
  it('names the switched-off logins and the dead one', () => {
    expect(poolStall(loginHealths(slotAccountRows(OFF, USAGE), NOW))).toBe('login 1 and 2 are switched off and login 3 needs a fresh sign-in');
  });
  it('null when any login can mark', () => {
    expect(poolStall(loginHealths(slotAccountRows({}, USAGE), NOW))).toBeNull();
  });
});

describe('signinWarnings — a day and two hours before a sign-in ends', () => {
  const h = (now: number) => loginHealths(slotAccountRows({}, USAGE), now);
  it('fires once about a day ahead, once again two hours ahead, never twice', () => {
    const at1 = Date.parse('2026-10-21T05:00:00Z');                       // ~23.7 h before login 1 ends
    const a = signinWarnings(h(at1), {}, at1);
    expect(a.send.map(s => s.key)).toEqual(['adrianmathtuition-gmail-com']);
    expect(a.send[0].text).toMatch(/Marking login 1 \(adrianmathtuition@gmail.com\) stops working Thu 22 Oct, 12:40 pm/);
    expect(a.send[0].text).toMatch(/Type: sign in marking login 1 again/);
    expect(signinWarnings(h(at1 + 600_000), a.told, at1 + 600_000).send).toEqual([]);
    const at2 = Date.parse('2026-10-22T03:00:00Z');                       // 1 h 40 before
    const b = signinWarnings(h(at2), a.told, at2);
    // login 2 (ends 6:34 pm that day) gets its day-ahead line in the same tick
    expect(b.send.map(s => s.key)).toEqual(['adrianmathtuition-gmail-com', 'ablnon-gmail-com']);
    expect(b.send[0].text).toMatch(/in about 1 hour/);
    expect(signinWarnings(h(at2 + 600_000), b.told, at2 + 600_000).send).toEqual([]);
  });
  it('a new end date (signed in again) starts the warnings over', () => {
    const at = Date.parse('2026-10-21T05:00:00Z');
    const told = { 'adrianmathtuition-gmail-com': { ends: '2026-10-15T00:00:00Z', day: true, hours: true } };
    expect(signinWarnings(h(at), told, at).send).toHaveLength(1);
  });
  it('a login already dead is not warned (the stall alarm covers it)', () => {
    expect(signinWarnings(h(NOW), {}, NOW).send).toEqual([]);
  });
});

describe('stallDecision — one line per stall', () => {
  const papers = [0, 1, 2, 3].map(i => ({ id: `p${i}`, queued_at: '2026-10-20T09:59:00Z', claimed: false }));
  const h = loginHealths(slotAccountRows(OFF, USAGE), NOW);
  it('4 papers, every login off or dead → says why and how to fix', () => {
    const d = stallDecision(papers, h, {}, NOW);
    expect(d.message).toMatch(/^⏸ 4 papers waiting for marking \(the oldest for 31 min\): login 1 and 2 are switched off and login 3 needs a fresh sign-in\./);
    expect(d.message).toMatch(/admin\/switches/);
    expect(d.message).toMatch(/sign in marking login 3 again/);
    expect(d.message).toMatch(/Batch now/);
    // ten minutes later: quiet; two hours later: once more
    expect(stallDecision(papers, h, d.state, NOW + 600_000).message).toBeNull();
    expect(stallDecision(papers, h, d.state, NOW + 2 * H + 60_000).message).toMatch(/Still stuck/);
  });
  it('under 30 minutes, or a login free and the worker marking → nothing', () => {
    expect(stallDecision(papers, h, {}, Date.parse('2026-10-20T10:20:00Z')).message).toBeNull();
    const ok = loginHealths(slotAccountRows({}, USAGE), NOW);
    expect(stallDecision([...papers, { id: 'x', queued_at: '2026-10-20T09:00:00Z', claimed: true }], ok, {}, NOW).message).toBeNull();
  });
  it('a login free but nothing marking at all → the worker is not picking them up', () => {
    const ok = loginHealths(slotAccountRows({}, USAGE), NOW);
    expect(stallDecision(papers, ok, {}, NOW).message).toMatch(/a login has room, but the cloud worker is not picking them up/);
  });
  it('the stall ends → the record clears, so the next stall is told again', () => {
    expect(stallDecision([], h, { told_at: iso(NOW) }, NOW).state).toEqual({});
  });
});

describe('rowStallNote + signInSteps', () => {
  it('a row queued over 30 min with no usable login shows the reason', () => {
    const h = loginHealths(slotAccountRows(OFF, USAGE), NOW);
    expect(rowStallNote('2026-10-20T09:59:00Z', h, NOW)).toBe('not moving: login 1 and 2 are switched off and login 3 needs a fresh sign-in');
    expect(rowStallNote('2026-10-20T10:20:00Z', h, NOW)).toBeNull();
  });
  it('steps name the app, the words to type and the account', () => {
    expect(signInSteps({ login: '3', email: 'ablnon@hotmail.com' })).toMatch(/Claude app[\s\S]*sign in marking login 3 again[\s\S]*ablnon@hotmail.com/);
  });
});

describe('slot usage merge keeps meters when a dead login posts only its sign-in state', () => {
  it('signin-only post updates the state, keeps the last meters', () => {
    const map = parseSlotUsage(JSON.stringify({ 'ablnon-hotmail-com': { five_hour: 10, seven_day: 50, at: '2026-10-20T06:00:00Z' } }));
    const next = withSlotUsage(map, { 'ablnon-hotmail-com': { five_hour: null, seven_day: null, at: '2026-10-20T10:00:00Z', signin: 'needs', signin_ends: '2026-10-20T07:30:57Z', login: '3' } });
    expect(next['ablnon-hotmail-com']).toMatchObject({ five_hour: 10, seven_day: 50, at: '2026-10-20T06:00:00Z', signin: 'needs', signin_ends: '2026-10-20T07:30:57Z', login: '3' });
  });
});

describe('🗝 year-long keys (20 Oct 2026)', () => {
  const KEYS: SlotUsageMap = {
    'adrianmathtuition-gmail-com': { five_hour: null, seven_day: null, resets_5h: null, resets_7d: null, at: iso(NOW), from: 'fly', signin: 'ok', signin_ends: '2027-10-20T10:00:00Z', login: '1', kind: 'key' },
    'ablnon-gmail-com': { five_hour: null, seven_day: null, resets_5h: null, resets_7d: null, at: iso(NOW), from: 'fly', signin: 'ok', signin_ends: '2027-10-20T10:00:00Z', login: '2', kind: 'key', resting_until: iso(NOW + 2 * H) },
  };
  it('a key is ready, or resting until its reset — never meters', () => {
    const h = loginHealths(slotAccountRows({}, KEYS), NOW);
    expect(h[0]).toMatchObject({ kind: 'key', worker: 'ready', usable: true });
    expect(h[1]).toMatchObject({ kind: 'key', worker: 'full', usable: false, text: 'resting until Tue 20 Oct, 8:30 pm' });
  });
  it('a key is warned a week ahead, then a day, then two hours — with the Terminal steps', () => {
    const at = Date.parse('2027-10-14T10:00:00Z');
    const a = signinWarnings(loginHealths(slotAccountRows({}, KEYS), at), {}, at);
    expect(a.send).toHaveLength(2);
    expect(a.send[0].text).toMatch(/year-long key .* ends Wed 20 Oct, 6:00 pm — in about 6 days/);
    expect(a.send[0].text).toMatch(/claude-key-capture\.sh 1/);
    const at2 = Date.parse('2027-10-19T11:00:00Z');
    expect(signinWarnings(loginHealths(slotAccountRows({}, KEYS), at2), a.told, at2).send).toHaveLength(2);
  });
  it('a key post replaces the old sign-in meters', () => {
    const map = parseSlotUsage(JSON.stringify({ 'ablnon-gmail-com': { five_hour: 10, seven_day: 50, at: '2026-10-20T06:00:00Z' } }));
    const next = withSlotUsage(map, { 'ablnon-gmail-com': { five_hour: null, seven_day: null, at: '2026-10-20T10:00:00Z', signin: 'ok', kind: 'key', login: '2' } });
    expect(next['ablnon-gmail-com']).toMatchObject({ five_hour: null, seven_day: null, kind: 'key' });
  });
});
