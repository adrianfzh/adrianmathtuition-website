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
import { SUBMIT_FAILED_KIND, sanitizeSubmitFailure } from './submit-failure';
import { TAB_VIEW_KIND, isTabName, tabLabel } from './portal-tabs';

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
  /** portal_event_log.detail — only 'submit:failed' rows carry one (lib/submit-failure.ts). */
  detail?: unknown;
}

/** A hand-in that failed on a student's phone in the last 24 hours (7 Sep 2026). */
export interface FailedHandin {
  identity: string;
  displayName: string | null;
  at: string;
  stage: string;
  reason: string;
  pages: number;
  uploaded: number;
  paperName: string | null;
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
  /** Newest first, last 24 hours — the hub's red card and the student profile read it. */
  failedHandins: FailedHandin[];
  /** Which app tabs students open (6 Oct 2026) — busiest first; empty when no 'tab:view' rows were passed in. */
  tabs: TabSummaryRow[];
}

/** The last 24 hours of 'submit:failed' events, newest first, named where the identity has an account. Pure. */
export function failedHandinsFrom(events: ActivityEvent[], accounts: ActivityAccount[], now: Date): FailedHandin[] {
  const since = now.getTime() - DAY_MS;
  const nameOf = new Map(accounts.map(a => [identityOf(a), a.display_name] as const));
  return events
    .filter(e => e.kind === SUBMIT_FAILED_KIND && Date.parse(e.created_at) >= since)
    .map(e => {
      const f = sanitizeSubmitFailure(e.detail);
      return {
        identity: e.identity,
        displayName: nameOf.get(e.identity) ?? null,
        at: e.created_at,
        stage: f?.stage ?? 'unknown',
        reason: f?.reason ?? 'unknown',
        pages: f?.pages ?? 0,
        uploaded: f?.uploaded ?? 0,
        paperName: f?.paperName ?? null,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
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

  return { totals, rows, failedHandins: failedHandinsFrom(events, accounts, now), tabs: summariseTabViews(events, now) };
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

// ── Which tabs students open (6 Oct 2026) ───────────────────────────────────
// 'tab:view' rows (lib/portal-tabs.ts): the beacon sends at most one per tab
// per device per 30 minutes, so "opens" = visits, not page loads.

/** The tab name a 'tab:view' row carries — the route stores the bare name; an object `{tab}` is read too. */
export function tabOfEvent(e: Pick<ActivityEvent, 'kind' | 'detail'>): string | null {
  if (e.kind !== TAB_VIEW_KIND) return null;
  const d = e.detail;
  const name = typeof d === 'string' ? d : d && typeof d === 'object' ? (d as { tab?: unknown }).tab : null;
  return isTabName(name) ? name : null;
}

export interface TabSummaryRow {
  tab: string;
  label: string;
  students7d: number;
  opens7d: number;
  students30d: number;
  opens30d: number;
}

/** Per tab: unique students and opens over 7 and 30 days. Busiest first (students this week, then opens, then 30 days). Pure. */
export function summariseTabViews(events: ActivityEvent[], now: Date): TabSummaryRow[] {
  const t7 = now.getTime() - 7 * DAY_MS;
  const t30 = now.getTime() - 30 * DAY_MS;
  const acc = new Map<string, { s7: Set<string>; o7: number; s30: Set<string>; o30: number }>();
  for (const e of events) {
    const tab = tabOfEvent(e);
    if (!tab) continue;
    const at = Date.parse(e.created_at);
    if (!Number.isFinite(at) || at < t30 || at > now.getTime() + 60_000) continue;
    let a = acc.get(tab);
    if (!a) acc.set(tab, (a = { s7: new Set(), o7: 0, s30: new Set(), o30: 0 }));
    a.s30.add(e.identity); a.o30++;
    if (at >= t7) { a.s7.add(e.identity); a.o7++; }
  }
  return [...acc.entries()]
    .map(([tab, a]) => ({ tab, label: tabLabel(tab), students7d: a.s7.size, opens7d: a.o7, students30d: a.s30.size, opens30d: a.o30 }))
    .sort((x, y) => y.students7d - x.students7d || y.opens7d - x.opens7d || y.students30d - x.students30d || x.tab.localeCompare(y.tab));
}

/** Unique students who opened any tab in the last 7 days. Pure. */
export function tabStudents7d(events: ActivityEvent[], now: Date): number {
  const t7 = now.getTime() - 7 * DAY_MS;
  return new Set(events.filter(e => tabOfEvent(e) && Date.parse(e.created_at) >= t7).map(e => e.identity)).size;
}

export interface LastOpenedTab { tab: string; label: string; at: string }

/** One student's tabs, each with its latest open, newest first. Pure. */
export function lastOpenedTabs(events: ActivityEvent[], limit = 5): LastOpenedTab[] {
  const latest = new Map<string, string>();
  for (const e of events) {
    const tab = tabOfEvent(e);
    if (!tab || !Number.isFinite(Date.parse(e.created_at))) continue;
    const prev = latest.get(tab);
    if (!prev || Date.parse(e.created_at) > Date.parse(prev)) latest.set(tab, e.created_at);
  }
  return [...latest.entries()]
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, limit)
    .map(([tab, at]) => ({ tab, label: tabLabel(tab), at }));
}
