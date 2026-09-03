import { describe, it, expect } from 'vitest';
import { summariseActivity, relativeDay, type ActivityInput } from './portal-activity';

const DAY_MS = 86_400_000;
// A fixed "now" well inside a Singapore day (2026-09-03 12:00 SGT = 04:00Z).
const NOW = new Date(Date.UTC(2026, 8, 3, 4, 0, 0));

function baseInput(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    accounts: [],
    events: [],
    attempts: [],
    handins: [],
    now: NOW,
    ...overrides,
  };
}

describe('summariseActivity', () => {
  it('marks an account seen exactly 7 days ago as active (inclusive boundary)', () => {
    const iso = new Date(NOW.getTime() - 7 * DAY_MS).toISOString();
    const { rows, totals } = summariseActivity(baseInput({
      accounts: [{ id: 'u1', airtable_student_id: 'recA', display_name: 'Amy', level: 'Sec 4', created_at: iso, last_seen_at: iso, deactivated_at: null }],
    }));
    expect(rows[0].status).toBe('active');
    expect(totals.active7d).toBe(1);
  });

  it('marks an account seen 7 days + 1ms ago as quiet, not active', () => {
    const iso = new Date(NOW.getTime() - 7 * DAY_MS - 1).toISOString();
    const { rows, totals } = summariseActivity(baseInput({
      accounts: [{ id: 'u1', airtable_student_id: 'recA', display_name: 'Amy', level: 'Sec 4', created_at: iso, last_seen_at: iso, deactivated_at: null }],
    }));
    expect(rows[0].status).toBe('quiet');
    expect(totals.active7d).toBe(0);
  });

  it('excludes deactivated accounts from totals but keeps them as a "never" row', () => {
    const recentIso = new Date(NOW.getTime() - DAY_MS).toISOString(); // seen yesterday
    const { rows, totals } = summariseActivity(baseInput({
      accounts: [
        { id: 'u1', airtable_student_id: 'recA', display_name: 'Amy', level: 'Sec 4', created_at: recentIso, last_seen_at: recentIso, deactivated_at: null },
        { id: 'u2', airtable_student_id: 'recB', display_name: 'Ben', level: 'Sec 4', created_at: recentIso, last_seen_at: recentIso, deactivated_at: recentIso },
      ],
    }));
    expect(totals.accounts).toBe(1); // Ben excluded
    expect(totals.active7d).toBe(1);
    const ben = rows.find(r => r.id === 'u2')!;
    expect(ben.status).toBe('never'); // forced 'never' despite a recent last_seen_at
    expect(ben.lastSeenAt).toBe(recentIso); // but the raw stamp is kept on the row
  });

  it('a never-signed-in account (null last_seen_at) is "never" and counted in neverSignedIn', () => {
    const { rows, totals } = summariseActivity(baseInput({
      accounts: [{ id: 'u1', airtable_student_id: 'recA', display_name: 'Amy', level: 'Sec 4', created_at: NOW.toISOString(), last_seen_at: null, deactivated_at: null }],
    }));
    expect(rows[0].status).toBe('never');
    expect(totals.neverSignedIn).toBe(1);
    expect(totals.active7d).toBe(0);
  });

  it('matches events/attempts/handins by portal identity — tuition (rec…) id', () => {
    const iso = NOW.toISOString();
    const { rows } = summariseActivity(baseInput({
      accounts: [{ id: 'u1', airtable_student_id: 'recA', display_name: 'Amy', level: 'Sec 4', created_at: iso, last_seen_at: iso, deactivated_at: null }],
      events: [{ identity: 'recA', kind: 'marking:view', created_at: iso }, { identity: 'recOTHER', kind: 'marking:view', created_at: iso }],
      attempts: [{ airtable_student_id: 'recA', user_id: null, attempted_at: iso }],
      handins: [{ student_id: 'recA', created_at: iso }],
    }));
    expect(rows[0].lastMarkingViewAt).toBe(iso);
    expect(rows[0].lastAttemptAt).toBe(iso);
    expect(rows[0].lastHandinAt).toBe(iso);
  });

  it('matches events/attempts/handins by portal identity — stranger acct:<uuid>', () => {
    const iso = NOW.toISOString();
    const { rows } = summariseActivity(baseInput({
      // airtable_student_id blank ('') → stranger identity is `acct:<id>`, same as lib/portal-auth.ts portalIdentity().
      accounts: [{ id: 'uuid-1', airtable_student_id: '', display_name: 'Stranger', level: null, created_at: iso, last_seen_at: iso, deactivated_at: null }],
      events: [{ identity: 'acct:uuid-1', kind: 'marking:open', created_at: iso }],
      attempts: [{ airtable_student_id: 'acct:uuid-1', user_id: null, attempted_at: iso }],
      handins: [{ student_id: 'acct:uuid-1', created_at: iso }],
    }));
    expect(rows[0].lastMarkingViewAt).toBe(iso);
    expect(rows[0].lastAttemptAt).toBe(iso);
    expect(rows[0].lastHandinAt).toBe(iso);
  });

  it('ignores event kinds outside the marking:view/marking:open allow-list', () => {
    const iso = NOW.toISOString();
    const { rows } = summariseActivity(baseInput({
      accounts: [{ id: 'u1', airtable_student_id: 'recA', display_name: 'Amy', level: 'Sec 4', created_at: iso, last_seen_at: iso, deactivated_at: null }],
      events: [{ identity: 'recA', kind: 'ask_log', created_at: iso }],
    }));
    expect(rows[0].lastMarkingViewAt).toBeNull();
  });

  it('sorts active first (newest last_seen_at first), then quiet, then never', () => {
    const veryRecent = new Date(NOW.getTime() - DAY_MS).toISOString();
    const lessRecent = new Date(NOW.getTime() - 2 * DAY_MS).toISOString();
    const quietIso = new Date(NOW.getTime() - 20 * DAY_MS).toISOString();
    const { rows } = summariseActivity(baseInput({
      accounts: [
        { id: 'never1', airtable_student_id: 'recNEVER', display_name: 'Never', level: null, created_at: quietIso, last_seen_at: null, deactivated_at: null },
        { id: 'quiet1', airtable_student_id: 'recQUIET', display_name: 'Quiet', level: null, created_at: quietIso, last_seen_at: quietIso, deactivated_at: null },
        { id: 'active2', airtable_student_id: 'recA2', display_name: 'ActiveOlder', level: null, created_at: lessRecent, last_seen_at: lessRecent, deactivated_at: null },
        { id: 'active1', airtable_student_id: 'recA1', display_name: 'ActiveNewer', level: null, created_at: veryRecent, last_seen_at: veryRecent, deactivated_at: null },
      ],
    }));
    expect(rows.map(r => r.id)).toEqual(['active1', 'active2', 'quiet1', 'never1']);
  });

  it('totals.accounts / active30d count correctly across a mixed roster', () => {
    const seen3d = new Date(NOW.getTime() - 3 * DAY_MS).toISOString();
    const seen20d = new Date(NOW.getTime() - 20 * DAY_MS).toISOString();
    const seen40d = new Date(NOW.getTime() - 40 * DAY_MS).toISOString();
    const { totals } = summariseActivity(baseInput({
      accounts: [
        { id: 'a', airtable_student_id: 'recA', display_name: 'A', level: null, created_at: seen3d, last_seen_at: seen3d, deactivated_at: null },
        { id: 'b', airtable_student_id: 'recB', display_name: 'B', level: null, created_at: seen20d, last_seen_at: seen20d, deactivated_at: null },
        { id: 'c', airtable_student_id: 'recC', display_name: 'C', level: null, created_at: seen40d, last_seen_at: seen40d, deactivated_at: null },
        { id: 'd', airtable_student_id: 'recD', display_name: 'D', level: null, created_at: NOW.toISOString(), last_seen_at: null, deactivated_at: null },
      ],
    }));
    expect(totals.accounts).toBe(4);
    expect(totals.active7d).toBe(1);
    expect(totals.active30d).toBe(2); // seen3d + seen20d, not seen40d
    expect(totals.neverSignedIn).toBe(1);
  });
});

describe('relativeDay', () => {
  it('returns "never" for null', () => {
    expect(relativeDay(null, NOW)).toBe('never');
  });

  it('returns "today" for a timestamp earlier today (same SGT calendar day)', () => {
    // NOW = 2026-09-03 04:00Z = 12:00 SGT. Same-day earlier stamp: 02:00Z = 10:00 SGT.
    const earlierToday = new Date(Date.UTC(2026, 8, 3, 2, 0, 0)).toISOString();
    expect(relativeDay(earlierToday, NOW)).toBe('today');
  });

  it('returns "yesterday" for a timestamp on the previous SGT calendar day', () => {
    // 2026-09-02 20:00Z = 2026-09-03 04:00 SGT... wait, pick something unambiguous.
    const yesterday = new Date(Date.UTC(2026, 8, 2, 4, 0, 0)).toISOString(); // 2026-09-02 12:00 SGT
    expect(relativeDay(yesterday, NOW)).toBe('yesterday');
  });

  it('returns "N days ago" for older timestamps', () => {
    const fiveDaysAgo = new Date(NOW.getTime() - 5 * DAY_MS).toISOString();
    expect(relativeDay(fiveDaysAgo, NOW)).toBe('5 days ago');
  });

  it('compares Singapore CALENDAR days, not 24h buckets, across the SGT midnight', () => {
    // "now" = 2026-09-03 00:05 SGT (2026-09-02 16:05Z) — 5 minutes into the new SGT day.
    const now = new Date(Date.UTC(2026, 8, 2, 16, 5, 0));
    // Event 15 minutes earlier in real time, but 23:50 SGT on 2026-09-02 — the PREVIOUS SGT day.
    const justBeforeMidnightSgt = new Date(Date.UTC(2026, 8, 2, 15, 50, 0)).toISOString();
    expect(relativeDay(justBeforeMidnightSgt, now)).toBe('yesterday');
  });

  it('never reads a future/clock-skew timestamp as being in the past', () => {
    const future = new Date(NOW.getTime() + DAY_MS).toISOString();
    expect(relativeDay(future, NOW)).toBe('today');
  });
});
