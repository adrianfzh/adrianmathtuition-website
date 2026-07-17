import { describe, it, expect } from 'vitest';
import { resolveRescheduleChain, chainIdsFrom, ChainLesson } from './reschedule-chain';

const TODAY = '2026-07-17';

// Build a byId map from terse tuples: [id, date, status, rescheduledToId?]
function map(...rows: [string, string, string, string?][]): Record<string, ChainLesson> {
  return Object.fromEntries(
    rows.map(([id, date, status, to]) => [id, { id, date, status, slotId: `slot-${id}`, rescheduledToId: to ?? null }])
  );
}

describe('resolveRescheduleChain — single hop', () => {
  it('delivered: the makeup was completed', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-10', 'Completed']), TODAY);
    expect(r.outcome).toBe('delivered');
    expect(r.finalDate).toBe('2026-07-10');
    expect(r.hops).toBe(1);
  });

  it('upcoming: the makeup is scheduled in the future', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-28', 'Scheduled']), TODAY);
    expect(r.outcome).toBe('upcoming');
  });

  it('a makeup scheduled for TODAY still counts as upcoming, not unmarked', () => {
    const r = resolveRescheduleChain('b', map(['b', TODAY, 'Scheduled']), TODAY);
    expect(r.outcome).toBe('upcoming');
  });

  it('unmarked: the makeup date has passed but attendance was never set', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-04', 'Scheduled']), TODAY);
    expect(r.outcome).toBe('unmarked');
  });

  it('cancelled: covers the live "Cancelled - Prorated" option too', () => {
    expect(resolveRescheduleChain('b', map(['b', '2026-07-04', 'Cancelled']), TODAY).outcome).toBe('cancelled');
    expect(resolveRescheduleChain('b', map(['b', '2026-07-04', 'Cancelled - Prorated']), TODAY).outcome).toBe('cancelled');
  });
});

// REGRESSION — Rickile kumar (live 2026-07-17): missed 12 Jul, makeup set for
// 14 Jul, and he missed that too. The chip read blue "Rescheduled → 14 Jul",
// which looks handled — the lesson was never delivered and nothing was booked.
// 6 such cases existed. 'missed' must be distinguishable from 'upcoming'.
describe('resolveRescheduleChain — the makeup was ALSO missed', () => {
  it('reports missed, not upcoming', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-14', 'Absent']), TODAY);
    expect(r.outcome).toBe('missed');
    expect(r.finalDate).toBe('2026-07-14');
  });
});

// REGRESSION — Abel Tan Zhi Yi (live 2026-07-17): missed 18 Jan, makeup 18 Apr,
// moved again, actually taught 21 Jun. Reading one hop saw 18 Apr / 'Rescheduled'
// (not Completed) and painted it blue "pending" — understating a settled lesson.
// 20 such cases existed. The chain must resolve to the FINAL lesson.
describe('resolveRescheduleChain — multi-hop chains', () => {
  it('follows two hops to a completed lesson and reports the FINAL date', () => {
    const r = resolveRescheduleChain('b', map(
      ['b', '2026-04-18', 'Rescheduled', 'c'],
      ['c', '2026-06-21', 'Completed'],
    ), TODAY);
    expect(r.outcome).toBe('delivered');
    expect(r.finalDate).toBe('2026-06-21'); // NOT the 18 Apr first hop
    expect(r.finalId).toBe('c');
    expect(r.hops).toBe(2);
  });

  it('follows a long chain to its end', () => {
    const r = resolveRescheduleChain('b', map(
      ['b', '2026-03-01', 'Rescheduled', 'c'],
      ['c', '2026-03-08', 'Rescheduled', 'd'],
      ['d', '2026-03-15', 'Rescheduled', 'e'],
      ['e', '2026-03-22', 'Absent'],
    ), TODAY);
    expect(r.outcome).toBe('missed');
    expect(r.finalDate).toBe('2026-03-22');
    expect(r.hops).toBe(4);
  });

  it('a chain that ends cancelled is not pending (Yong Wen Xuan, live)', () => {
    const r = resolveRescheduleChain('b', map(
      ['b', '2026-03-29', 'Rescheduled', 'c'],
      ['c', '2026-04-04', 'Cancelled'],
    ), TODAY);
    expect(r.outcome).toBe('cancelled');
  });
});

describe('resolveRescheduleChain — bad data never hangs or throws', () => {
  it('dangling link (destination not in the map) → broken', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-10', 'Rescheduled', 'ghost']), TODAY);
    expect(r.outcome).toBe('broken');
  });

  it('Rescheduled with no forward link at all → broken', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-10', 'Rescheduled']), TODAY);
    expect(r.outcome).toBe('broken');
  });

  it('start id absent from the map → broken, no throw', () => {
    expect(resolveRescheduleChain('nope', map(['b', '2026-07-10', 'Completed']), TODAY).outcome).toBe('broken');
  });

  it('null/undefined start → broken', () => {
    expect(resolveRescheduleChain(null, {}, TODAY).outcome).toBe('broken');
    expect(resolveRescheduleChain(undefined, {}, TODAY).outcome).toBe('broken');
  });

  it('a cycle terminates instead of spinning forever', () => {
    const r = resolveRescheduleChain('b', map(
      ['b', '2026-07-10', 'Rescheduled', 'c'],
      ['c', '2026-07-17', 'Rescheduled', 'b'],
    ), TODAY);
    expect(r.outcome).toBe('broken');
  });

  it('a self-referential link terminates', () => {
    const r = resolveRescheduleChain('b', map(['b', '2026-07-10', 'Rescheduled', 'b']), TODAY);
    expect(r.outcome).toBe('broken');
  });
});

describe('chainIdsFrom — ids needed to fetch a whole chain', () => {
  it('lists each onward hop', () => {
    const m = map(
      ['b', '2026-03-01', 'Rescheduled', 'c'],
      ['c', '2026-03-08', 'Rescheduled', 'd'],
      ['d', '2026-03-15', 'Completed'],
    );
    expect(chainIdsFrom('b', m)).toEqual(['c', 'd']);
  });

  it('returns nothing for a terminal lesson', () => {
    expect(chainIdsFrom('b', map(['b', '2026-03-01', 'Completed']))).toEqual([]);
  });

  it('returns the unfetched next id so the caller knows to fetch it', () => {
    // 'c' is not in the map yet — the caller needs it to continue the walk.
    expect(chainIdsFrom('b', map(['b', '2026-03-01', 'Rescheduled', 'c']))).toEqual(['c']);
  });

  it('does not loop on a cycle', () => {
    const m = map(
      ['b', '2026-03-01', 'Rescheduled', 'c'],
      ['c', '2026-03-08', 'Rescheduled', 'b'],
    );
    expect(chainIdsFrom('b', m)).toEqual(['c']);
  });
});
