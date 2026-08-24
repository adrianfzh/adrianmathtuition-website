import { describe, it, expect } from 'vitest';
import { DAILY_SUBMIT_CAP, sgtStartOfDayIso, countHandinsToday } from './portal-submit-limit';
import type { HandinCountingClient } from './portal-submit-limit';

// The submit cap counts hand-ins since SGT midnight, not a rolling 24h window —
// a student who submits at 9pm can submit again the next morning.
describe('sgtStartOfDayIso', () => {
  it('after SGT midnight but before UTC midnight: boundary is 16:00Z the same UTC day', () => {
    // 20 Aug 18:30 UTC = 21 Aug 02:30 SGT → SGT midnight = 20 Aug 16:00 UTC
    expect(sgtStartOfDayIso(new Date('2026-08-20T18:30:00Z'))).toBe('2026-08-20T16:00:00.000Z');
  });
  it('daytime SGT: boundary is 16:00Z the previous UTC day', () => {
    // 20 Aug 10:00 UTC = 20 Aug 18:00 SGT → SGT midnight = 19 Aug 16:00 UTC
    expect(sgtStartOfDayIso(new Date('2026-08-20T10:00:00Z'))).toBe('2026-08-19T16:00:00.000Z');
  });
  it('exactly at SGT midnight the boundary is that instant', () => {
    expect(sgtStartOfDayIso(new Date('2026-08-20T16:00:00Z'))).toBe('2026-08-20T16:00:00.000Z');
  });
  it('23:59 SGT and 00:01 SGT land on different days', () => {
    const before = new Date('2026-08-20T15:59:00Z'); // 23:59 SGT, 20 Aug
    const after = new Date('2026-08-20T16:01:00Z');  // 00:01 SGT, 21 Aug
    expect(sgtStartOfDayIso(before)).not.toBe(sgtStartOfDayIso(after));
  });
  it('cap is one per day', () => {
    expect(DAILY_SUBMIT_CAP).toBe(1);
  });
});

// One paper per STUDENT per day means BOTH surfaces share the allowance: this
// portal and the Telegram bot's /handin (Adrian, 24 Aug 2026). Papers Adrian
// uploads himself on /admin/mark-paper carry neither marker and are not counted.
describe('countHandinsToday', () => {
  type Row = { student_id: string; portal?: boolean; telegram?: boolean; created_at: string };

  function client(rows: Row[], asked: string[][] = []): HandinCountingClient {
    return {
      from() {
        const preds: ((r: Row) => boolean)[] = [];
        const log: string[] = [];
        asked.push(log);
        const b = {
          select: () => b,
          gte: (c: string, v: string) => { log.push(`${c}>=${v}`); preds.push(r => r.created_at >= v); return b; },
          eq: (c: string, v: string) => {
            log.push(`${c}=${v}`);
            preds.push(c === 'student_id' ? (r => r.student_id === v) : (r => r.portal === true));
            return b;
          },
          not: (c: string, op: string) => { log.push(`${c} not ${op} null`); preds.push(r => r.telegram === true); return b; },
          then: (res: (x: { count: number | null; error: unknown }) => unknown) =>
            res({ count: rows.filter(r => preds.every(p => p(r))).length, error: null }),
        };
        return b as unknown as ReturnType<HandinCountingClient['from']>;
      },
    } as HandinCountingClient;
  }

  const NOW = new Date('2026-08-24T10:00:00Z');   // 18:00 SGT, 24 Aug
  const TODAY = '2026-08-24T09:00:00.000Z';       // 17:00 SGT same day
  const YESTERDAY = '2026-08-23T09:00:00.000Z';

  it('a Telegram /handin spends the portal allowance too', async () => {
    const n = await countHandinsToday(client([{ student_id: 'recA', telegram: true, created_at: TODAY }]), 'recA', NOW);
    expect(n).toBe(1);
  });

  it('counts this portal too, and sums both surfaces', async () => {
    const rows: Row[] = [
      { student_id: 'recA', telegram: true, created_at: TODAY },
      { student_id: 'recA', portal: true, created_at: TODAY },
    ];
    expect(await countHandinsToday(client(rows), 'recA', NOW)).toBe(2);
  });

  it("another student's paper is not this student's", async () => {
    const n = await countHandinsToday(client([{ student_id: 'recB', portal: true, created_at: TODAY }]), 'recA', NOW);
    expect(n).toBe(0);
  });

  it("yesterday's paper does not count", async () => {
    const n = await countHandinsToday(client([{ student_id: 'recA', portal: true, created_at: YESTERDAY }]), 'recA', NOW);
    expect(n).toBe(0);
  });

  it("a paper Adrian uploaded himself carries neither marker and is not counted", async () => {
    const n = await countHandinsToday(client([{ student_id: 'recA', created_at: TODAY }]), 'recA', NOW);
    expect(n).toBe(0);
  });

  it('both queries are bounded to SGT midnight and to the student', async () => {
    const asked: string[][] = [];
    await countHandinsToday(client([], asked), 'recA', NOW);
    expect(asked).toHaveLength(2);
    for (const q of asked) {
      expect(q).toContain('created_at>=2026-08-23T16:00:00.000Z');
      expect(q).toContain('student_id=recA');
    }
  });
});
