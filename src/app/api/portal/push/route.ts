// /api/portal/push — the signed-in student's web-push subscriptions.
//
// POST   body = the browser's PushSubscription JSON → upsert by endpoint,
//        owned by the session's student. A device that re-subscribes (or a
//        shared device where a different student signs in) re-claims its
//        endpoint row — endpoint is the unique key.
// DELETE body = { endpoint } → removes it, but only when the row belongs to
//        the session's student.
//
// 401 anonymous (probed by /api/health-check). Table is service-role only —
// the client never touches it directly; sends happen in lib/portal-push.ts.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';

// The session's portal identity (rec… for tuition, acct:<uuid> for strangers)
// — the SAME string releases push against (mark-triage passes run.student_id
// to sendPushToStudent, and the submit route stamps runs with this identity),
// so a stranger's "marked paper ready ✅" finds their subscription rows.
// Previously this returned the raw airtable id, which is '' for strangers and
// silently broke their subscriptions.
async function sessionStudentId(): Promise<string | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'id' | 'airtable_student_id'>>();
  return account ? portalIdentity(account) : null;
}

export async function POST(req: NextRequest) {
  const studentId = await sessionStudentId();
  if (!studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  if (
    !endpoint.startsWith('https://') || endpoint.length > 2048 ||
    !p256dh || p256dh.length > 512 ||
    !auth || auth.length > 512
  ) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from('portal_push_subscriptions')
    .upsert(
      { airtable_student_id: studentId, endpoint, p256dh, auth },
      { onConflict: 'endpoint' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const studentId = await sessionStudentId();
  if (!studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

  // Scoped to the caller's own rows — one student can never unsubscribe another.
  const { error } = await getSupabaseAdmin()
    .from('portal_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('airtable_student_id', studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
