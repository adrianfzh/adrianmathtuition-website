import { describe, it, expect } from 'vitest';
import { DAILY_SUBMIT_CAP, sgtStartOfDayIso } from './portal-submit-limit';

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
