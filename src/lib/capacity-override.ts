// Sec-capacity override — the "teach smaller classes for a while" toggle.
//
// One Settings row (`Setting Name='sec_capacity_override'`, Value JSON
// `{"secCap":5}` or `{"secCap":null}`) lowers the EFFECTIVE per-date MAKEUP
// CAPACITY of Secondary slots (stored 6 → 5) for NEW bookings only — the
// makeup/reschedule/additional checks in this repo AND the Telegram/WhatsApp
// bot's booking checks (repo adrianmath-telegram-bot reads the same Settings
// row). Scope is deliberately Makeup Capacity ONLY (Adrian, 2026-08-03):
// Normal Capacity (enrollment, stored 4) is advisory and stays ungated.
// Already-booked lessons are untouched by construction — the cap is consulted
// only where a new lesson is created. Toggle OFF (null) restores stored
// capacities exactly; per-slot Airtable values are never rewritten.
//
// NOTE: Airtable's `Is Full` / `Spots Remaining` FORMULA fields know nothing
// about this override — never read them on a surface that must respect it.

export const SEC_CAP_SETTING = 'sec_capacity_override';

/** The default toggle target. The API accepts 1–8 for future flexibility. */
export const SEC_CAP_DEFAULT = 5;

export function isSecondaryLevel(level: string | null | undefined): boolean {
  return String(level ?? '').trim().toLowerCase() === 'secondary';
}

/** Parse a Settings.Value JSON into the active cap, or null when off/invalid. */
export function parseSecCapOverride(value: string | null | undefined): number | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const cap = parsed?.secCap;
    if (typeof cap === 'number' && Number.isInteger(cap) && cap >= 1 && cap <= 8) return cap;
    return null;
  } catch {
    return null;
  }
}

/**
 * Effective per-date capacity for a slot given the override state.
 * Use on the MAKEUP CAPACITY occupancy checks (add/reschedule) and displays.
 * - Only Secondary slots are affected; JC/Adhoc pass through.
 * - null stored capacity stays null (callers that error on "no capacity set"
 *   must keep erroring — the override never conjures a capacity from nothing).
 * - The override can only LOWER a cap (min), never raise one.
 */
export function effectiveCapacity(
  stored: number | null | undefined,
  level: string | null | undefined,
  secCap: number | null
): number | null {
  if (stored == null) return null;
  if (secCap == null || !isSecondaryLevel(level)) return stored;
  return Math.min(stored, secCap);
}
