// Sec-capacity override — the "teach smaller classes for a while" toggle.
//
// One Settings row (`Setting Name='sec_capacity_override'`, Value JSON
// `{"secCap":5}` or `{"secCap":null}`) lowers the EFFECTIVE capacity of every
// Secondary-level slot for NEW bookings only. Existing enrollments/lessons are
// untouched by construction: the cap is consulted only where something new is
// created (signup, add lesson, reschedule, slot switch, add weekly slot) and
// where availability is displayed. Toggle OFF (null) restores stored
// capacities exactly — per-slot Airtable values are never rewritten, so a slot
// deliberately set below the override (e.g. capacity 4) keeps its own cap.
//
// NOTE: Airtable's `Is Full` / `Spots Remaining` FORMULA fields know nothing
// about this override — never read them on a surface that must respect it;
// compute from Normal Capacity + Enrolled Count via effectiveCapacity().

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
 * Effective capacity for a slot given the override state.
 * - Only Secondary slots are affected; JC/Adhoc pass through.
 * - null stored capacity stays null (callers that error on "no capacity set"
 *   must keep erroring — the override never conjures a capacity from nothing).
 * - The override can only LOWER a cap (min), never raise one.
 * Use for the PER-DATE occupancy checks (Makeup Capacity 6 → 5) and displays.
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

/**
 * Should a NEW enrollment-level arrangement (signup, add weekly slot, switch
 * in) be blocked? CEILING semantics, deliberately not min(): Secondary slots
 * store Normal Capacity 4 as an advisory number that is routinely exceeded up
 * to the real class-size ceiling of 6 (Makeup Capacity), and no server gate
 * exists when the toggle is off. While ON, the toggle's whole contract is
 * "no new student into a Sec class already holding secCap" — the stored 4
 * plays no part, and classes below secCap are as addable as ever.
 */
export function secEnrollmentBlocked(
  enrolled: number | null | undefined,
  level: string | null | undefined,
  secCap: number | null
): boolean {
  if (secCap == null || !isSecondaryLevel(level)) return false;
  return (enrolled ?? 0) >= secCap;
}
