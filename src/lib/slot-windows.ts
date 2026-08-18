// Slot date windows — "this slot exists only for these dates".
//
// Airtable Slots are permanent WEEKLY definitions (Day + Time, no dates), so
// switching one on makes it recur forever. That's correct for the regular
// timetable and wrong for a one-off ad-hoc week — Adrian, 17 Aug 2026: four
// Wednesday + four Thursday slots opened for a single week of makeups, "will
// these wed and thu classes be there after this week? they shouldn't be."
//
// The Slots table has no date fields and the API token has no schema-write
// scope, so the window lives in the same Settings row pattern the exam-season
// and Sec-capacity toggles already use:
//
//   Setting Name = 'slot_date_windows'
//   Value        = {"recXXX": {"from": "2026-08-19", "until": "2026-08-20"}}
//
// Both bounds are INCLUSIVE and both are optional. A slot with no entry is
// unbounded — which is every normal weekly slot, so the timetable is untouched.
//
// SCOPE: slot LISTS, never lessons. Slots referenced by a week's lessons are
// re-fetched separately in /api/admin-schedule (extraSlotIds), so a booking in
// a closed-window slot keeps rendering at its proper time long after the window
// closes.
//
// A dated slot is a one-off session and is never part of the weekly timetable,
// so every "join a weekly class" surface excludes it by DATEDNESS, not by level
// — an ad-hoc session may legitimately carry Level 'Secondary' or 'JC' (that's
// what makes the Sec cap and the bot's level matching apply to it). Surfaces
// that book a specific date keep dated slots and filter with slotOpenOnDate().
// The full list is in docs/SCHEDULE.md → "a dated slot is never a weekly class".

export const SLOT_WINDOWS_SETTING = 'slot_date_windows';

export type SlotWindow = { from?: string; until?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a Settings.Value JSON into slotId → window.
 *
 * Fails OPEN: anything unparseable or malformed is dropped, leaving the slot
 * unbounded. A corrupt settings row must never blank out Adrian's calendar.
 */
export function parseSlotWindows(value: string | null | undefined): Record<string, SlotWindow> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const out: Record<string, SlotWindow> = {};
  for (const [slotId, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const { from, until } = raw as { from?: unknown; until?: unknown };
    const win: SlotWindow = {};
    if (typeof from === 'string' && ISO_DATE.test(from)) win.from = from;
    if (typeof until === 'string' && ISO_DATE.test(until)) win.until = until;
    // An entry with neither usable bound constrains nothing — skip it rather
    // than store an empty object that later reads as "windowed".
    if (win.from || win.until) out[slotId] = win;
  }
  return out;
}

/**
 * Does a slot's window overlap the viewed week? Both the window and the week
 * are inclusive ranges; ISO dates compare correctly as plain strings.
 *
 * No window (or no entry at all) => always visible.
 */
export function slotVisibleInWeek(
  win: SlotWindow | undefined,
  weekStart: string,
  weekEnd: string
): boolean {
  if (!win) return true;
  if (win.from && win.from > weekEnd) return false;   // window starts after the week
  if (win.until && win.until < weekStart) return false; // window ended before the week
  return true;
}

// ---------------------------------------------------------------------------
// Creating dated sessions from /admin/schedule (Adrian, 18 Aug 2026)
//
// The 19–20 Aug ad-hoc week was hand-built in Airtable. Everything below backs
// the ⚡ Ad-hoc session modal that replaces that by-hand step: pick dates +
// times, pick a level, set the max, and the route creates one Slot per
// (weekday, time) with a window spanning that weekday's own selected dates.
//
// Level is the EXISTING Slots.Level singleSelect — no schema change:
//   Sec → 'Secondary'   JC → 'JC'   Mix → 'Adhoc'
// Choosing 'Secondary' is what makes the Sec class-size toggle apply, because
// effectiveCapacity() keys off exactly that value (see capacity-override.ts).
// ---------------------------------------------------------------------------

/** Slots.Day singleSelect options, in week order. Index 0 = Monday. */
export const SLOT_DAYS = [
  '1 Monday', '2 Tuesday', '3 Wednesday', '4 Thursday', '5 Friday', '6 Saturday', '7 Sunday',
] as const;

/** Slots.Time singleSelect options, in day order. */
export const SLOT_TIMES = ['9-11am', '11am-1pm', '1-3pm', '3-5pm', '5-7pm', '7-9pm'] as const;

/** Slots.Level singleSelect options. 'Adhoc' is the mixed Sec+JC room. */
export const SLOT_LEVELS = ['Secondary', 'JC', 'Adhoc'] as const;
export type SlotLevel = (typeof SLOT_LEVELS)[number];

/**
 * Capacity a level normally carries, used as the modal's starting numbers.
 * `makeup` is the one that gates bookings (and the one the Sec toggle lowers);
 * `normal` is the advisory enrollment figure. Mixed rooms default to 4 across
 * the board — Adrian's call, since a Sec+JC room is harder to teach than either.
 */
export const LEVEL_DEFAULT_CAPACITY: Record<SlotLevel, { normal: number; makeup: number }> = {
  Secondary: { normal: 4, makeup: 6 },
  JC: { normal: 3, makeup: 4 },
  Adhoc: { normal: 4, makeup: 4 },
};

export function isSlotLevel(value: unknown): value is SlotLevel {
  return typeof value === 'string' && (SLOT_LEVELS as readonly string[]).includes(value);
}

/** Human label for a level, for UI and Telegram-free admin copy. */
export function slotLevelLabel(level: SlotLevel): string {
  return level === 'Secondary' ? 'Sec' : level === 'JC' ? 'JC' : 'Mixed';
}

/** ISO date → the Slots.Day option it falls on ('2026-08-19' → '3 Wednesday'). */
export function dayFieldForDate(dateStr: string): string | null {
  if (!ISO_DATE.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  // getUTCDay(): 0=Sunday. SLOT_DAYS is Monday-first, so Sunday wraps to index 6.
  return SLOT_DAYS[(d.getUTCDay() + 6) % 7];
}

/**
 * Is this slot date-windowed? Dated slots are one-off sessions, never part of
 * the weekly timetable — every "join a weekly class" surface must exclude them
 * (public schedule, switch-slot picker, +Add weekly slot).
 */
export function isDatedSlot(
  windows: Record<string, SlotWindow> | undefined,
  slotId: string
): boolean {
  return Boolean(windows && windows[slotId]);
}

/**
 * Does a dated slot run on this exact date? The per-week check
 * (slotVisibleInWeek) is coarser — a Wed-only window that spans a week still
 * has to be rejected for the Thursday in it. Mirrors the bot's slotOpenOnDate.
 */
export function slotOpenOnDate(win: SlotWindow | undefined, dateStr: string): boolean {
  if (!win) return true;
  if (win.from && dateStr < win.from) return false;
  if (win.until && dateStr > win.until) return false;
  return true;
}

/**
 * Every date a dated slot actually runs on: the weekday recurrences of
 * `dayField` inside the window. This is what the modal previews, so the
 * non-contiguous case is visible — picking 19 Aug and 2 Sep spans 26 Aug too,
 * and the preview says so rather than surprising Adrian a fortnight later.
 *
 * Requires both bounds; a one-sided window has no finite date list.
 */
export function windowOccurrences(
  win: SlotWindow | undefined,
  dayField: string,
  maxDates = 60
): string[] {
  if (!win?.from || !win.until || win.from > win.until) return [];
  const target = SLOT_DAYS.indexOf(dayField as (typeof SLOT_DAYS)[number]);
  if (target < 0) return [];

  const out: string[] = [];
  const cursor = new Date(win.from + 'T00:00:00Z');
  const end = new Date(win.until + 'T00:00:00Z');
  while (cursor <= end && out.length < maxDates) {
    if ((cursor.getUTCDay() + 6) % 7 === target) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Apply changes to the windows map. A null value REMOVES that slot's entry
 * (used when an ad-hoc session is cancelled) — leaving a stale window behind
 * would keep a deactivated slot flagged as dated forever.
 */
export function mergeSlotWindows(
  existing: Record<string, SlotWindow>,
  updates: Record<string, SlotWindow | null>
): Record<string, SlotWindow> {
  const out: Record<string, SlotWindow> = { ...existing };
  for (const [slotId, win] of Object.entries(updates)) {
    if (win === null) delete out[slotId];
    else if (win.from || win.until) out[slotId] = win;
  }
  return out;
}

/**
 * Serialize for the Settings row. Round-trips through parseSlotWindows so a
 * caller can never write a shape the reader would silently drop.
 */
export function serializeSlotWindows(windows: Record<string, SlotWindow>): string {
  const clean: Record<string, SlotWindow> = {};
  for (const [slotId, win] of Object.entries(windows)) {
    const w: SlotWindow = {};
    if (typeof win?.from === 'string' && ISO_DATE.test(win.from)) w.from = win.from;
    if (typeof win?.until === 'string' && ISO_DATE.test(win.until)) w.until = win.until;
    if (w.from || w.until) clean[slotId] = w;
  }
  return JSON.stringify(clean);
}
