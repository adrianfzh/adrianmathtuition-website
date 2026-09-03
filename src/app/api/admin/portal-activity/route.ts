// GET /api/admin/portal-activity — "are we able to see if students are active
// on the portal?" (Adrian, 2026-09-03). Reads the four activity signals and
// hands them to the pure summariser (lib/portal-activity.ts):
//   - portal_accounts.last_seen_at (touched once/SGT-day by sessionAccount()
//     in lib/portal-auth.ts — see that file for why the column existed but
//     was never written before this build)
//   - portal_event_log kind IN ('marking:view','marking:open') — written by
//     POST /api/portal/event, fired from /app/marking (MarkingBeacon.tsx)
//   - student_attempts.attempted_at — practice
//   - paper_marking_runs where result_json.portal_submission is set —
//     student-initiated hand-ins (same predicate mark-triage uses to find
//     portal submissions)
//
// Service-role reads (this table has no admin-readable RLS policy), admin-
// auth gated. Read-only — writes nothing. Consumed by the hub's attention
// card (/admin/page.tsx) and the student-profile route's `portal` field.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { summariseActivity, type ActivityAccount, type ActivityEvent, type ActivityAttempt, type ActivityHandin } from '@/lib/portal-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;
const windowStartIso = () => new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  const since = windowStartIso();

  const [accountsRes, eventsRes, attemptsRes, handinsRes] = await Promise.all([
    sb.from('portal_accounts')
      .select('id, airtable_student_id, display_name, level, created_at, last_seen_at, deactivated_at'),
    sb.from('portal_event_log')
      .select('identity, kind, created_at')
      .in('kind', ['marking:view', 'marking:open'])
      .gte('created_at', since),
    sb.from('student_attempts')
      .select('airtable_student_id, user_id, attempted_at')
      .gte('attempted_at', since),
    sb.from('paper_marking_runs')
      .select('student_id, created_at')
      .gte('created_at', since)
      .not('result_json->portal_submission', 'is', null),
  ]);

  if (accountsRes.error) return NextResponse.json({ error: accountsRes.error.message }, { status: 500 });
  // The other three feed context columns, not the roster itself — degrade to
  // empty rather than failing the whole card when one has a hiccup.
  if (eventsRes.error) console.warn('[portal-activity] portal_event_log read failed:', eventsRes.error.message);
  if (attemptsRes.error) console.warn('[portal-activity] student_attempts read failed:', attemptsRes.error.message);
  if (handinsRes.error) console.warn('[portal-activity] paper_marking_runs read failed:', handinsRes.error.message);

  const summary = summariseActivity({
    accounts: (accountsRes.data ?? []) as ActivityAccount[],
    events: (eventsRes.data ?? []) as ActivityEvent[],
    attempts: (attemptsRes.data ?? []) as ActivityAttempt[],
    handins: (handinsRes.data ?? []) as ActivityHandin[],
    now: new Date(),
  });

  return NextResponse.json(summary);
}
