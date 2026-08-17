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
// SCOPE: the admin calendar's slot list only (/api/admin-schedule). It never
// hides a LESSON — slots referenced by a week's lessons are re-fetched
// separately there (extraSlotIds), so ad-hoc lessons keep rendering at their
// proper time long after the window closes. The public homepage never sees
// Adhoc slots at all (/api/schedule filters {Level}!='Adhoc').

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
