// POST /api/portal/event — fire-and-forget portal-activity telemetry.
// Body: { kind: 'marking:view' | 'marking:open' }. Any other kind → 400 (an
// allow-list, not a free-form event bus — lib/portal-activity.ts's summariser
// only ever looks for these two kinds, so nothing else is worth writing yet).
//
// Fired by MarkingBeacon.tsx (src/app/app/marking/MarkingBeacon.tsx): once on
// mount of /app/marking ('marking:view'), and once per click on an anchor
// carrying data-track="marking:open" (opening a marked-script PDF).
//
// Auth + identity + the portal_event_log insert mirror
// src/app/api/portal/ask-log/route.ts exactly: same session lookup, same 401
// for anonymous, same identity + service-client write, same daily spam cap
// shape (this route's own kinds only, so a hammered beacon can't crowd out
// other telemetry's budget).
//
// Also probed by /api/health-check: anonymous POST must 401.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { sgtDayStart } from '@/lib/sgt';

export const runtime = 'nodejs';

const ALLOWED_KINDS = new Set(['marking:view', 'marking:open']);
// Generous but bounded — a student opening every paper they own repeatedly in
// one day still lands nowhere near this; it only stops a runaway client loop.
const DAILY_EVENT_CAP = 500;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('airtable_student_id, display_name')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'airtable_student_id' | 'display_name'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { kind?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!ALLOWED_KINDS.has(kind)) return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });

  const identity = portalIdentity({ id: user.id, airtable_student_id: account.airtable_student_id });
  try {
    const svc = createServiceClient();
    const sgtMidnight = sgtDayStart();
    const { count } = await svc
      .from('portal_event_log')
      .select('id', { count: 'exact', head: true })
      .eq('identity', identity)
      .in('kind', ['marking:view', 'marking:open'])
      .gte('created_at', sgtMidnight.toISOString());
    if ((count ?? 0) >= DAILY_EVENT_CAP) return NextResponse.json({ ok: true, capped: true });
    await svc.from('portal_event_log').insert({ identity, kind });
  } catch (e) {
    // Telemetry is best-effort by contract — report ok so the client never retries.
    console.error('[portal/event] write failed:', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
