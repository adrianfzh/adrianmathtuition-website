import { describe, it, expect } from 'vitest';
import { parseSlotWindows, slotVisibleInWeek, SLOT_WINDOWS_SETTING } from './slot-windows';

// The live ad-hoc week this feature was built for: eight Wed/Thu slots opened
// for 19–20 Aug 2026 only. Weeks below are Monday–Sunday, as the schedule
// route computes them.
const ADHOC = { from: '2026-08-19', until: '2026-08-20' };
const WEEK_OF_17_AUG = ['2026-08-17', '2026-08-23'] as const;
const WEEK_OF_24_AUG = ['2026-08-24', '2026-08-30'] as const;
const WEEK_OF_10_AUG = ['2026-08-10', '2026-08-16'] as const;

describe('parseSlotWindows', () => {
  it('parses a well-formed windows map', () => {
    expect(parseSlotWindows('{"recA":{"from":"2026-08-19","until":"2026-08-20"}}')).toEqual({
      recA: { from: '2026-08-19', until: '2026-08-20' },
    });
  });

  it('accepts one-sided windows', () => {
    expect(parseSlotWindows('{"recA":{"from":"2026-08-19"},"recB":{"until":"2026-09-01"}}')).toEqual({
      recA: { from: '2026-08-19' },
      recB: { until: '2026-09-01' },
    });
  });

  // Fail-open is the whole safety story: a bad settings row must never blank
  // out the calendar, so every malformed shape degrades to "unbounded".
  it('fails open on unusable input', () => {
    expect(parseSlotWindows(null)).toEqual({});
    expect(parseSlotWindows(undefined)).toEqual({});
    expect(parseSlotWindows('')).toEqual({});
    expect(parseSlotWindows('not json')).toEqual({});
    expect(parseSlotWindows('[1,2,3]')).toEqual({});
    expect(parseSlotWindows('"a string"')).toEqual({});
    expect(parseSlotWindows('null')).toEqual({});
  });

  it('drops entries with malformed or non-ISO bounds', () => {
    expect(parseSlotWindows('{"recA":{"from":"19/08/2026"}}')).toEqual({});
    expect(parseSlotWindows('{"recA":{"from":12345}}')).toEqual({});
    expect(parseSlotWindows('{"recA":"2026-08-19"}')).toEqual({});
    expect(parseSlotWindows('{"recA":{}}')).toEqual({});
    expect(parseSlotWindows('{"recA":null}')).toEqual({});
  });

  it('keeps the good half of a partly-malformed entry', () => {
    expect(parseSlotWindows('{"recA":{"from":"2026-08-19","until":"nonsense"}}')).toEqual({
      recA: { from: '2026-08-19' },
    });
  });

  it('keeps good entries alongside dropped ones', () => {
    expect(parseSlotWindows('{"recA":{"from":"2026-08-19"},"recB":{"from":"bad"}}')).toEqual({
      recA: { from: '2026-08-19' },
    });
  });

  it('pins the settings row name the route and seeder share', () => {
    expect(SLOT_WINDOWS_SETTING).toBe('slot_date_windows');
  });
});

describe('slotVisibleInWeek', () => {
  it('shows unwindowed slots in every week — the normal weekly timetable', () => {
    expect(slotVisibleInWeek(undefined, ...WEEK_OF_24_AUG)).toBe(true);
    expect(slotVisibleInWeek({}, ...WEEK_OF_24_AUG)).toBe(true);
  });

  // The regression this exists to prevent: ad-hoc slots reappearing forever.
  it('shows the ad-hoc week only in its own week', () => {
    expect(slotVisibleInWeek(ADHOC, ...WEEK_OF_17_AUG)).toBe(true);
    expect(slotVisibleInWeek(ADHOC, ...WEEK_OF_24_AUG)).toBe(false);
    expect(slotVisibleInWeek(ADHOC, ...WEEK_OF_10_AUG)).toBe(false);
  });

  it('treats both bounds as inclusive', () => {
    // Window collapsed onto a single day that is the week's last day…
    expect(slotVisibleInWeek({ from: '2026-08-23', until: '2026-08-23' }, ...WEEK_OF_17_AUG)).toBe(true);
    // …and its first.
    expect(slotVisibleInWeek({ from: '2026-08-17', until: '2026-08-17' }, ...WEEK_OF_17_AUG)).toBe(true);
    // One day either side is out.
    expect(slotVisibleInWeek({ from: '2026-08-24', until: '2026-08-24' }, ...WEEK_OF_17_AUG)).toBe(false);
    expect(slotVisibleInWeek({ from: '2026-08-16', until: '2026-08-16' }, ...WEEK_OF_17_AUG)).toBe(false);
  });

  it('handles one-sided windows', () => {
    expect(slotVisibleInWeek({ from: '2026-08-19' }, ...WEEK_OF_24_AUG)).toBe(true);
    expect(slotVisibleInWeek({ from: '2026-08-19' }, ...WEEK_OF_10_AUG)).toBe(false);
    expect(slotVisibleInWeek({ until: '2026-08-20' }, ...WEEK_OF_10_AUG)).toBe(true);
    expect(slotVisibleInWeek({ until: '2026-08-20' }, ...WEEK_OF_24_AUG)).toBe(false);
  });

  it('spans multiple weeks when the window is wide', () => {
    const term = { from: '2026-08-19', until: '2026-09-30' };
    expect(slotVisibleInWeek(term, ...WEEK_OF_17_AUG)).toBe(true);
    expect(slotVisibleInWeek(term, ...WEEK_OF_24_AUG)).toBe(true);
    expect(slotVisibleInWeek(term, '2026-09-28', '2026-10-04')).toBe(true);
    expect(slotVisibleInWeek(term, '2026-10-05', '2026-10-11')).toBe(false);
  });

  it('crosses a year boundary correctly (string compare holds for ISO dates)', () => {
    const win = { from: '2026-12-28', until: '2027-01-03' };
    expect(slotVisibleInWeek(win, '2026-12-28', '2027-01-03')).toBe(true);
    expect(slotVisibleInWeek(win, '2027-01-04', '2027-01-10')).toBe(false);
  });
});
