import { describe, it, expect } from 'vitest';
import {
  parseSlotWindows, slotVisibleInWeek, SLOT_WINDOWS_SETTING,
  dayFieldForDate, isDatedSlot, slotOpenOnDate, windowOccurrences,
  mergeSlotWindows, serializeSlotWindows,
  LEVEL_DEFAULT_CAPACITY, SLOT_LEVELS, isSlotLevel, slotLevelLabel,
} from './slot-windows';
import { isSecondaryLevel } from './capacity-override';

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

describe('dayFieldForDate', () => {
  it('maps the live ad-hoc dates to their Slots.Day options', () => {
    expect(dayFieldForDate('2026-08-19')).toBe('3 Wednesday');
    expect(dayFieldForDate('2026-08-20')).toBe('4 Thursday');
  });

  // Monday-first indexing with a Sunday wrap is the easy place to be off by one.
  it('covers the whole week including the Sunday wrap', () => {
    expect(dayFieldForDate('2026-08-17')).toBe('1 Monday');
    expect(dayFieldForDate('2026-08-18')).toBe('2 Tuesday');
    expect(dayFieldForDate('2026-08-21')).toBe('5 Friday');
    expect(dayFieldForDate('2026-08-22')).toBe('6 Saturday');
    expect(dayFieldForDate('2026-08-23')).toBe('7 Sunday');
  });

  it('rejects non-ISO input rather than guessing', () => {
    expect(dayFieldForDate('19/08/2026')).toBeNull();
    expect(dayFieldForDate('')).toBeNull();
  });
});

describe('isDatedSlot', () => {
  it('is true only for slots with a window — dated means "not a weekly class"', () => {
    const windows = { recAdhoc: ADHOC };
    expect(isDatedSlot(windows, 'recAdhoc')).toBe(true);
    expect(isDatedSlot(windows, 'recWeekly')).toBe(false);
    expect(isDatedSlot(undefined, 'recAdhoc')).toBe(false);
  });
});

describe('slotOpenOnDate', () => {
  it('lets unwindowed slots run on any date', () => {
    expect(slotOpenOnDate(undefined, '2027-01-01')).toBe(true);
  });

  it('holds both bounds inclusive', () => {
    expect(slotOpenOnDate(ADHOC, '2026-08-19')).toBe(true);
    expect(slotOpenOnDate(ADHOC, '2026-08-20')).toBe(true);
    expect(slotOpenOnDate(ADHOC, '2026-08-18')).toBe(false);
    expect(slotOpenOnDate(ADHOC, '2026-08-21')).toBe(false);
  });

  // The week check alone is too coarse: the same week contains 26 Aug.
  it('rejects the same weekday a week later', () => {
    expect(slotVisibleInWeek(ADHOC, ...WEEK_OF_17_AUG)).toBe(true);
    expect(slotOpenOnDate(ADHOC, '2026-08-26')).toBe(false);
  });
});

describe('windowOccurrences', () => {
  it('lists the dates a dated Wednesday slot actually runs on', () => {
    expect(windowOccurrences({ from: '2026-08-19', until: '2026-08-20' }, '3 Wednesday'))
      .toEqual(['2026-08-19']);
    expect(windowOccurrences({ from: '2026-08-19', until: '2026-08-20' }, '4 Thursday'))
      .toEqual(['2026-08-20']);
  });

  // The reason the modal previews this: a gap in the picked dates silently
  // becomes an extra session, so Adrian gets to see it before saving.
  it('includes the skipped weekday inside a non-contiguous span', () => {
    expect(windowOccurrences({ from: '2026-08-19', until: '2026-09-02' }, '3 Wednesday'))
      .toEqual(['2026-08-19', '2026-08-26', '2026-09-02']);
  });

  it('returns nothing for one-sided, inverted, or unknown-day input', () => {
    expect(windowOccurrences({ from: '2026-08-19' }, '3 Wednesday')).toEqual([]);
    expect(windowOccurrences({ until: '2026-08-20' }, '3 Wednesday')).toEqual([]);
    expect(windowOccurrences({ from: '2026-08-20', until: '2026-08-19' }, '3 Wednesday')).toEqual([]);
    expect(windowOccurrences(undefined, '3 Wednesday')).toEqual([]);
    expect(windowOccurrences(ADHOC, 'Wednesday')).toEqual([]);
  });

  it('caps runaway windows instead of looping for years', () => {
    expect(windowOccurrences({ from: '2026-01-01', until: '2036-01-01' }, '1 Monday', 5))
      .toHaveLength(5);
  });
});

describe('mergeSlotWindows / serializeSlotWindows', () => {
  it('adds and replaces entries', () => {
    expect(mergeSlotWindows({ recA: ADHOC }, { recB: { from: '2026-09-01' } })).toEqual({
      recA: ADHOC,
      recB: { from: '2026-09-01' },
    });
    expect(mergeSlotWindows({ recA: ADHOC }, { recA: { from: '2026-09-01', until: '2026-09-02' } }))
      .toEqual({ recA: { from: '2026-09-01', until: '2026-09-02' } });
  });

  // A cancelled session must lose its window, or a deactivated slot stays
  // flagged dated forever and the settings row grows without bound.
  it('removes an entry on null', () => {
    expect(mergeSlotWindows({ recA: ADHOC, recB: ADHOC }, { recA: null })).toEqual({ recB: ADHOC });
    expect(mergeSlotWindows({}, { recGone: null })).toEqual({});
  });

  it('ignores an update with no usable bound', () => {
    expect(mergeSlotWindows({ recA: ADHOC }, { recB: {} })).toEqual({ recA: ADHOC });
  });

  it('does not mutate the input map', () => {
    const before = { recA: ADHOC };
    mergeSlotWindows(before, { recA: null, recB: ADHOC });
    expect(before).toEqual({ recA: ADHOC });
  });

  it('round-trips through the parser — writers cannot emit unreadable shapes', () => {
    const windows = { recA: ADHOC, recB: { from: '2026-09-01' } };
    expect(parseSlotWindows(serializeSlotWindows(windows))).toEqual(windows);
  });

  it('strips junk bounds on the way out', () => {
    const dirty = { recA: { from: 'nonsense', until: '2026-08-20' }, recB: {} } as any;
    expect(JSON.parse(serializeSlotWindows(dirty))).toEqual({ recB: undefined, recA: { until: '2026-08-20' } });
    expect(serializeSlotWindows({})).toBe('{}');
  });
});

describe('level defaults', () => {
  // These are the numbers the modal pre-fills; Adrian asked for Mix → 4.
  it('matches the live per-level capacities', () => {
    expect(LEVEL_DEFAULT_CAPACITY.Secondary).toEqual({ normal: 4, makeup: 6 });
    expect(LEVEL_DEFAULT_CAPACITY.JC).toEqual({ normal: 3, makeup: 4 });
    expect(LEVEL_DEFAULT_CAPACITY.Adhoc).toEqual({ normal: 4, makeup: 4 });
  });

  // Sec is spelled exactly as the Sec-cap toggle tests for, or the toggle
  // silently stops applying to ad-hoc Sec sessions.
  it('uses the Level values the Sec-cap toggle keys off', () => {
    expect(isSecondaryLevel('Secondary')).toBe(true);
    expect(SLOT_LEVELS).toEqual(['Secondary', 'JC', 'Adhoc']);
    expect(isSlotLevel('Secondary')).toBe(true);
    expect(isSlotLevel('Sec')).toBe(false);
    expect(isSlotLevel(null)).toBe(false);
  });

  it('labels levels for the UI', () => {
    expect(slotLevelLabel('Secondary')).toBe('Sec');
    expect(slotLevelLabel('JC')).toBe('JC');
    expect(slotLevelLabel('Adhoc')).toBe('Mixed');
  });
});
