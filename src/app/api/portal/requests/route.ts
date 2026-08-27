// /api/portal/requests — the "Request" tab's student API (v1, human-in-the-loop).
//
// GET  — the signed-in student's own requests (newest first) + today's usage,
//        so the form can grey itself out before a wasted submit. 401 anon —
//        /api/health-check probes exactly that.
// POST — file a request: {kind, detail}. Validates (10–1000 chars), enforces
//        the 2-per-SGT-day cap server-side, inserts the queued row, then rings
//        Adrian's Telegram (same chat as health-check alerts). The Telegram
//        send is wrapped so its failure can NEVER fail the creation — the row
//        is already saved and /admin/requests still lists it; the ping is a
//        doorbell, not the record.
//
// A student filing a request is a STUDENT action, so it notifies — the
// "admin web UI actions are silent" rule covers Adrian's own clicks, not
// students asking for things (same policy as /api/portal/submit hand-ins).
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import {
  DAILY_REQUEST_CAP,
  countRequestsToday,
  normalizeKind,
  requestTelegramText,
  validateDetail,
  type PortalRequestRow,
  type RequestCountingClient,
} from '@/lib/requests';
import { listStudentRequests } from '@/lib/portal-requests';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';

export const runtime = 'nodejs';

// The client never learns another student's rows: everything is scoped by the
// session's own airtable_student_id, resolved server-side.
async function sessionStudent(): Promise<Pick<PortalAccount, 'id' | 'airtable_student_id' | 'display_name'> | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, display_name')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'id' | 'airtable_student_id' | 'display_name'>>();
  // Strangers file requests too — rows key on portalIdentity() (acct:<uuid>),
  // so no account is ever dropped here for having no Airtable record.
  return account ?? null;
}

function shape(r: PortalRequestRow) {
  // airtable_student_id stays server-side — the student doesn't need their own
  // record id, and it shouldn't ride every list response.
  return {
    id: r.id,
    kind: r.kind,
    detail: r.detail,
    status: r.status,
    adminNote: r.admin_note,
    resultUrl: r.result_url,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

export async function GET() {
  const account = await sessionStudent();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sid = portalIdentity(account);
  try {
    const [requests, usedToday] = await Promise.all([
      listStudentRequests(sid),
      countRequestsToday(getSupabaseAdmin() as unknown as RequestCountingClient, sid),
    ]);
    return NextResponse.json({ requests: requests.map(shape), usedToday, cap: DAILY_REQUEST_CAP });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const account = await sessionStudent();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = portalIdentity(account);

  let body: { kind?: unknown; detail?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const kind = normalizeKind(body.kind);
  const detail = validateDetail(body.detail);
  if (!detail.ok) return NextResponse.json({ error: detail.error }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Two per SGT day — counts rows actually saved, so a failed insert doesn't
  // burn a slot. (Two near-simultaneous submits could both pass this check;
  // for a brake on Adrian's attention that race is harmless.)
  const used = await countRequestsToday(admin as unknown as RequestCountingClient, studentId);
  if (used >= DAILY_REQUEST_CAP) {
    return NextResponse.json(
      { error: `That's your ${DAILY_REQUEST_CAP} requests for today — fresh ones open at midnight. Adrian reads every single one.` },
      { status: 429 },
    );
  }

  const { data, error } = await admin
    .from('portal_requests')
    .insert({ airtable_student_id: studentId, kind, detail: detail.detail })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[portal-requests] insert failed:', error?.message);
    return NextResponse.json({ error: 'Could not save your request — try again in a minute.' }, { status: 500 });
  }

  // Doorbell to Adrian. Awaited so the serverless function can't freeze before
  // the send leaves, but wrapped so no Telegram hiccup ever fails the creation
  // (sendTelegram already swallows non-OK responses; this catches network throws).
  try {
    await sendTelegram(requestTelegramText(account.display_name || 'A student', kind, detail.detail));
  } catch (e) {
    console.warn('[portal-requests] telegram notify failed:', (e as Error).message);
  }

  return NextResponse.json({ ok: true, request: shape(data as PortalRequestRow) });
}
