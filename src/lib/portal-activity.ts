// Portal activity visibility (2026-09-03): Adrian asked "are we able to see if
// students are active on the portal?" — pure summariser over four signals:
//   - portal_accounts.last_seen_at (touched once/SGT-day by sessionAccount(),
//     see lib/portal-auth.ts) — "did they sign in"
//   - portal_event_log rows kind IN ('marking:view','marking:open') — "did
//     they actually look at a marked paper" (src/app/api/portal/event)
//   - student_attempts.attempted_at — "did they practise"
//   - paper_marking_runs where result_json.portal_submission is set —
//     "did they hand in a paper themselves"
//
// Deliberately framework-free (no supabase-js, no next/navigation) so it is
// trivial to unit-test: the API route (src/app/api/admin/portal-activity) and
// the student-profile route do the fetching and hand rows in here.
//
// Identity matching mirrors lib/portal-auth.ts `portalIdentity()` EXACTLY
// (tuition students key on their Airtable rec… id; self-serve "stranger"
// accounts key on `acct:<account uuid>`) — every row this module reads
// (portal_event_log.identity, student_attempts.airtable_student_id,
// paper_marking_runs.student_id) is stamped with that same string. Re-derived
// here rather than imported so this file stays pure — keep the two in sync by
// hand if that convention ever changes.
import { latestActivityIso } from './retention';
import { sgtDateISO } from './sgt';

const DAY_MS = 86_400_000;

function identityOf(account: { id: string; airtable_student_id: string | null }): string {
  const airtableId = account.airtable_student_id;
  return airtableId && airtableId.trim() !== '' ? airtableId : `acct:${account.id}`;
}

export interface ActivityAccount {
  id: string;
  airtable_student_id: string | null;
  display_name: string | null;
  level: string | null;
  created_at: string;
  last_seen_at: string | null;
  deactivated_at: string | null;
}

export interface ActivityEvent {
  identity: string;
  kind: string;
  created_at: string;
}

export interface ActivityAttempt {
  airtable_student_id: string | null;
  user_id: string | null;
  attempted_at: string;
}

export interface ActivityHandin {
  student_id: string | null;
  created_at: string;
}

export interface ActivityInput {
  accounts: ActivityAccount[];
  events: ActivityEvent[];
  attempts: ActivityAttempt[];
  handins: ActivityHandin[];
  now: Date;
}

export type ActivityStatus = 'active' | 'quiet' | 'never';

export interface PortalActivityRow {
  id: string;
  airtableStudentId: string | null;
  displayName: string | null;
  level: string | null;
  lastSeenAt: string | null;
  lastHandinAt: string | null;
  lastAttemptAt: string | null;
  lastMarkingViewAt: string | null;
  status: ActivityStatus;
}

export interface ActivitySummary {
  totals: { accounts: number; active7d: number; active30d: number; neverSignedIn: number };
  rows: PortalActivityRow[];
}

const MARKING_VIEW_KINDS = new Set(['marking:view', 'marking:open']);

/** 'active' = seen within 7 days of `now`; 'never' = no last_seen_at at all;
 *  otherwise 'quiet'. The 7-day window is inclusive (exactly 7 days = active). */
function statusOf(lastSeenAt: string | null, now: Date): ActivityStatus {
  if (!lastSeenAt) return 'never';
  const diff = now.getTime() - Date.parse(lastSeenAt);
  return diff <= 7 * DAY_MS ? 'active' : 'quiet';
}

const STATUS_RANK: Record<ActivityStatus, number> = { active: 0, quiet: 1, never: 2 };

/** Rows sort active-first (newest last_seen_at first within a group), then
 *  quiet (same), then never. */
function compareRows(a: PortalActivityRow, b: PortalActivityRow): number {
  const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rankDiff !== 0) return rankDiff;
  const at = a.lastSeenAt ? Date.parse(a.lastSeenAt) : -Infinity;
  const bt = b.lastSeenAt ? Date.parse(b.lastSeenAt) : -Infinity;
  return bt - at;
}

export function summariseActivity(input: ActivityInput): ActivitySummary {
  const { accounts, events, attempts, handins, now } = input;

  const rows: PortalActivityRow[] = accounts.map(account => {
    const identity = identityOf(account);
    const lastMarkingViewAt = latestActivityIso(
      ...events
        .filter(e => e.identity === identity && MARKING_VIEW_KINDS.has(e.kind))
        .map(e => e.created_at),
    );
    const lastAttemptAt = latestActivityIso(
      ...attempts
        .filter(a => a.airtable_student_id === identity || (a.user_id != null && a.user_id === account.id))
        .map(a => a.attempted_at),
    );
    const lastHandinAt = latestActivityIso(
      ...handins.filter(h => h.student_id === identity).map(h => h.created_at),
    );
    // Deactivated (offboarded) accounts read as 'never' regardless of their
    // stored last_seen_at — they're kept in the list (their history is still
    // theirs) but never counted as "active" work.
    const status: ActivityStatus = account.deactivated_at ? 'never' : statusOf(account.last_seen_at, now);
    return {
      id: account.id,
      airtableStudentId: account.airtable_student_id,
      displayName: account.display_name,
      level: account.level,
      lastSeenAt: account.last_seen_at,
      lastHandinAt,
      lastAttemptAt,
      lastMarkingViewAt,
      status,
    };
  });
  rows.sort(compareRows);

  const live = accounts.filter(a => !a.deactivated_at);
  const sevenDaysAgo = now.getTime() - 7 * DAY_MS;
  const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;
  const totals = {
    accounts: live.length,
    active7d: live.filter(a => a.last_seen_at && Date.parse(a.last_seen_at) >= sevenDaysAgo).length,
    active30d: live.filter(a => a.last_seen_at && Date.parse(a.last_seen_at) >= thirtyDaysAgo).length,
    neverSignedIn: live.filter(a => !a.last_seen_at).length,
  };

  return { totals, rows };
}

/**
 * Singapore-calendar-day relative label — 'today' / 'yesterday' / 'N days ago'
 * / 'never'. Compares CALENDAR days (lib/sgt.ts `sgtDateISO`), not 24h
 * buckets: an event at 23:50 SGT and "now" 10 minutes later at 00:00 SGT are
 * on different Singapore days and must read as "yesterday", not "today".
 */
export function relativeDay(iso: string | null, now: Date): string {
  if (!iso) return 'never';
  const eventDay = sgtDateISO(new Date(iso));
  const todayDay = sgtDateISO(now);
  if (eventDay === todayDay) return 'today';
  const diffDays = Math.round(
    (Date.parse(`${todayDay}T00:00:00Z`) - Date.parse(`${eventDay}T00:00:00Z`)) / DAY_MS,
  );
  if (diffDays <= 0) return 'today'; // guard: a future/clock-skew timestamp never reads as past
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}
