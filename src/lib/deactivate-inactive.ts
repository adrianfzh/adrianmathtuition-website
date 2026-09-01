// ─── Portal auto-offboarding — the decision logic ────────────────────────────
//
// Monthly cron (/api/cron/deactivate-inactive): a TUITION portal account whose
// student has had no Active enrollment for ≥ INACTIVITY_DAYS gets
// `deactivated_at` set, which flips them to the S$29 pass gate like a stranger
// (lib/portal-passes.ts isTuitionAccount). Nothing is deleted — reactivation is
// one call to /api/admin/passes {action:'reactivate'}.
//
// Ground truth is the Airtable Enrollments table (live-schema checked
// 2026-09-02): Status singleSelect 'Active'|'Ended', End Date (date),
// Student (linked record). The canonical discontinue flow
// (/api/admin/student-discontinue) always writes Status='Ended' + End Date, so
// a dated departure is the normal case.
//
// Deliberately FAIL-SAFE: when the data cannot PROVE the student has been gone
// ≥30 days — no enrollments at all, or a non-Active enrollment with no
// parseable End Date — we keep them. A graduate keeping free access one more
// month costs nothing; an active student hitting a paywall is an incident.
// Pure over (enrollments, now) so the 30-day boundary is unit-testable.

/** Days without an active enrollment before the portal account is offboarded. */
export const INACTIVITY_DAYS = 30;

const DAY_MS = 86_400_000;

/** The slice of an Airtable Enrollments record the decision needs. */
export interface EnrollmentLite {
  /** Airtable `Status` — 'Active' | 'Ended' (anything else ≠ active). */
  status: string | null;
  /** Airtable `End Date` — 'YYYY-MM-DD' or null when never set. */
  endDate: string | null;
}

export type KeepReason =
  /** At least one enrollment is Active — they're still a student. */
  | 'active-enrollment'
  /** Every enrollment ended, but the latest End Date is under 30 days ago
   *  (or in the future — a scheduled discontinuation). */
  | 'ended-recently'
  /** Can't date the departure: zero enrollments, or a non-Active enrollment
   *  with no parseable End Date. Fail-safe → keep; Adrian can still offboard
   *  manually via /api/admin/passes {action:'deactivate'}. */
  | 'no-end-date';

export type DeactivationDecision =
  | { action: 'keep'; reason: KeepReason }
  | { action: 'deactivate'; lastEnrollmentEnd: string };

/**
 * Should this student's portal account be deactivated as of `now`?
 * Deactivate only when EVERY enrollment is non-Active, every one of them
 * carries a parseable End Date, and the LATEST of those dates is ≥30 days
 * before `now` (exactly 30 days ago qualifies). End Date is a calendar date —
 * it parses as UTC midnight, which only ever errs a few hours generous.
 */
export function decideDeactivation(
  enrollments: EnrollmentLite[],
  now: Date,
): DeactivationDecision {
  if (enrollments.some((e) => e.status === 'Active')) {
    return { action: 'keep', reason: 'active-enrollment' };
  }
  if (enrollments.length === 0) {
    return { action: 'keep', reason: 'no-end-date' };
  }

  let latestEndMs = -Infinity;
  let latestEndStr: string | null = null;
  for (const e of enrollments) {
    const t = e.endDate ? Date.parse(e.endDate) : NaN;
    if (!Number.isFinite(t)) {
      // A non-Active enrollment we cannot date — the departure is unprovable.
      return { action: 'keep', reason: 'no-end-date' };
    }
    if (t > latestEndMs) {
      latestEndMs = t;
      latestEndStr = e.endDate as string;
    }
  }

  if (latestEndMs + INACTIVITY_DAYS * DAY_MS <= now.getTime()) {
    return { action: 'deactivate', lastEnrollmentEnd: latestEndStr as string };
  }
  return { action: 'keep', reason: 'ended-recently' };
}

/** Airtable list-API record shape (only what we read). */
export interface AirtableEnrollmentRecord {
  id: string;
  fields: {
    /** Linked-record field: an ARRAY of Students rec ids. Never filterable by
     *  formula (the ARRAYJOIN gotcha — it joins display NAMES, not ids), so
     *  callers scan the whole table and we match ids here in JS. */
    Student?: string[];
    Status?: string;
    'End Date'?: string;
  };
}

/**
 * One whole-table Enrollments scan → per-student enrollment slices.
 * An enrollment linked to several students (shouldn't happen, but the field
 * type allows it) counts for each of them.
 */
export function groupEnrollmentsByStudent(
  records: AirtableEnrollmentRecord[],
): Map<string, EnrollmentLite[]> {
  const byStudent = new Map<string, EnrollmentLite[]>();
  for (const r of records) {
    const lite: EnrollmentLite = {
      status: r.fields?.Status ?? null,
      endDate: r.fields?.['End Date'] ?? null,
    };
    for (const sid of r.fields?.Student ?? []) {
      if (!sid) continue;
      const list = byStudent.get(sid);
      if (list) list.push(lite);
      else byStudent.set(sid, [lite]);
    }
  }
  return byStudent;
}
