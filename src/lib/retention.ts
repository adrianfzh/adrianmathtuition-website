// Phase G retention policy (PLAN-PORTAL-SOLO §7 Q4, built 2026-08-21): a
// student's practice attempts are kept while they are active and purged after
// RETENTION_MONTHS of inactivity. "Activity" = their latest graded attempt or
// portal login, whichever is newer, so an active student's history is never
// touched. Pure date logic lives here (tested); /api/cron/retention deletes.
export const RETENTION_MONTHS = 12;

/** UTC ISO cutoff: activity strictly older than this is beyond retention. */
export function retentionCutoffIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - RETENTION_MONTHS;
  // Clamp the day so month-length differences never roll forward (29 Feb → 28 Feb).
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    y, m, Math.min(now.getUTCDate(), daysInTarget),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
  )).toISOString();
}

/** Latest of the given timestamps; null when none are usable. */
export function latestActivityIso(...isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    if (best === null || t > Date.parse(best)) best = iso;
  }
  return best;
}

/**
 * True when the last known activity is beyond the retention window. A student
 * with NO parseable activity at all is treated as expired — rows we cannot
 * date are exactly what a data-minimisation sweep exists to clear.
 */
export function isExpired(lastActivityIso: string | null, cutoffIso: string): boolean {
  if (!lastActivityIso) return true;
  return Date.parse(lastActivityIso) < Date.parse(cutoffIso);
}

// ── The notebook + clippings sweep (5 Oct 2026) ─────────────────────────────
// The privacy page promises "while your child is a student with Adrian, and for
// up to 12 months after the account goes quiet"; docs/PRIVACY-DRAFT-2026-09.md
// and docs/RETENTION.md (classes 3 + 7) name the notebook and the clippings as
// part of that 12-month purge. Marked papers are NOT touched (Adrian's teaching
// record — the privacy page says so).

/**
 * The identity-keyed tables the quiet-account sweep clears: `column` holds the
 * identity, `stamp` dates the row (its newest stamp is "use" — activity).
 * 5 Oct 2026, Adrian ("yes"): Ask questions (ask_skills), essays, humanities
 * answers and the app-use log follow the same rule as the notebook.
 */
export const QUIET_ACCOUNT_TABLES: readonly { table: string; column: string; stamp: string }[] = [
  { table: 'notebook_entries', column: 'airtable_student_id', stamp: 'updated_at' },
  { table: 'notebook_mistakes', column: 'airtable_student_id', stamp: 'updated_at' },
  { table: 'notebook_saves', column: 'airtable_student_id', stamp: 'created_at' },
  { table: 'notebook_private_notes', column: 'airtable_student_id', stamp: 'updated_at' },
  { table: 'portal_notes', column: 'airtable_student_id', stamp: 'created_at' },
  { table: 'ask_skills', column: 'airtable_student_id', stamp: 'created_at' },
  { table: 'essay_runs', column: 'airtable_student_id', stamp: 'created_at' },
  { table: 'humanities_runs', column: 'airtable_student_id', stamp: 'created_at' },
  { table: 'portal_event_log', column: 'identity', stamp: 'created_at' },
];
/** @deprecated name kept for readers of older notes — the list is QUIET_ACCOUNT_TABLES. */
export const NOTEBOOK_TABLES = QUIET_ACCOUNT_TABLES.map((t) => t.table);

export interface IdentityActivity {
  identity: string;
  /** A portal account on this identity that is a current tuition student (rec… and not offboarded). */
  currentTuition: boolean;
  lastLogin?: string | null;
  lastAttempt?: string | null;
  /** Newest paper handed in (paper_marking_runs.created_at) — a Telegram-only student is active too. */
  lastHandIn?: string | null;
  /** Newest change to any of their notebook rows — the student using it is activity. */
  lastNotebook?: string | null;
}

/**
 * True when this identity's notebook + clippings are past retention. Never for a
 * current tuition student ("while your child is a student with Adrian"); otherwise
 * the newest of login, practice, hand-in and notebook use must be older than the cutoff.
 * Unlike isExpired, an identity with NO datable activity is KEPT here — the rows
 * themselves carry dates, so "no activity found" means we failed to look, not that
 * the student vanished.
 */
/** A student's identity (an Airtable record or a self-serve account) — never a bench / calibration key like `calib:…`. */
export function isStudentIdentity(identity: string): boolean {
  return /^rec[A-Za-z0-9]{14}$/.test(identity) || /^acct:[0-9a-f-]{36}$/i.test(identity);
}

export function notebookExpired(a: IdentityActivity, cutoffIso: string): boolean {
  if (!isStudentIdentity(a.identity)) return false; // bench essays / answers are Adrian's, not a student's
  if (a.currentTuition) return false;
  const last = latestActivityIso(a.lastLogin, a.lastAttempt, a.lastHandIn, a.lastNotebook);
  if (!last) return false;
  return Date.parse(last) < Date.parse(cutoffIso);
}
