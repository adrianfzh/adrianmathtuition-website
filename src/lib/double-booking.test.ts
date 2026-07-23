import { describe, it, expect } from 'vitest';
import { occupiesSlot, findDoubleBookedIds, BookingLite } from './double-booking';

const mk = (id: string, over: Partial<BookingLite> = {}): BookingLite => ({
  id,
  studentId: 'recStudentA',
  date: '2026-07-26',
  slotId: 'recSlotSun9',
  status: 'Scheduled',
  ...over,
});

describe('occupiesSlot', () => {
  it('Scheduled and Completed occupy', () => {
    expect(occupiesSlot('Scheduled')).toBe(true);
    expect(occupiesSlot('Completed')).toBe(true);
  });
  it('Cancelled / Absent / Rescheduled do not occupy', () => {
    expect(occupiesSlot('Cancelled')).toBe(false);
    expect(occupiesSlot('Absent')).toBe(false);
    expect(occupiesSlot('Rescheduled')).toBe(false);
  });
});

describe('findDoubleBookedIds', () => {
  it('flags BOTH lessons when a student occupies the same date+slot twice (Adele 26 Jul regression)', () => {
    // The real case: end of a thrice-moved chain + an unrelated makeup, both
    // Scheduled for the same student in Sun 9-11am on 26 Jul.
    const flagged = findDoubleBookedIds([mk('recChainEnd'), mk('recMakeup')]);
    expect(flagged).toEqual(new Set(['recChainEnd', 'recMakeup']));
  });

  it('does not flag a rescheduled-away tombstone sharing the slot with its sibling', () => {
    const flagged = findDoubleBookedIds([
      mk('recMovedAway', { status: 'Rescheduled' }),
      mk('recActive'),
    ]);
    expect(flagged.size).toBe(0);
  });

  it('does not flag different students, dates, or slots', () => {
    const flagged = findDoubleBookedIds([
      mk('a'),
      mk('b', { studentId: 'recStudentB' }),
      mk('c', { date: '2026-07-27' }),
      mk('d', { slotId: 'recSlotSat9' }),
    ]);
    expect(flagged.size).toBe(0);
  });

  it('ignores lessons without a student (Trial) or slot (Revision Sprint)', () => {
    const flagged = findDoubleBookedIds([
      mk('t1', { studentId: null }),
      mk('t2', { studentId: null }),
      mk('r1', { slotId: null }),
      mk('r2', { slotId: null }),
    ]);
    expect(flagged.size).toBe(0);
  });

  it('flags all three of a triple-booking', () => {
    const flagged = findDoubleBookedIds([mk('a'), mk('b'), mk('c')]);
    expect(flagged).toEqual(new Set(['a', 'b', 'c']));
  });

  it('Cancelled and Absent records never contribute', () => {
    const flagged = findDoubleBookedIds([
      mk('a', { status: 'Cancelled' }),
      mk('b', { status: 'Absent' }),
      mk('c'),
    ]);
    expect(flagged.size).toBe(0);
  });
});
