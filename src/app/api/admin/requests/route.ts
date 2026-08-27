import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { validResultUrl, type PortalRequestRow } from '@/lib/requests';

export const runtime = 'nodejs';

// Adrian's side of the "Request" tab (v1 human-in-the-loop; managed from
// /admin/requests). Students file via /api/portal/requests; here he clears the
// queue: ✅ done (with the result link the student's "Get it" button opens) or
// ❌ reject (note required — the student sees exactly why).
// Backing store: Supabase (math project) portal_requests — RLS on, no
// policies, service-role only (same pattern as admin_todos).

const LIST_LIMIT = 200;

type Shaped = ReturnType<typeof shape>;

function shape(r: PortalRequestRow, names: Map<string, string>) {
  return {
    id: r.id,
    studentId: r.airtable_student_id,
    studentName: names.get(r.airtable_student_id) || r.airtable_student_id,
    kind: r.kind,
    detail: r.detail,
    status: r.status,
    adminNote: r.admin_note,
    resultUrl: r.result_url,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const supa = createServiceClient();
    const { data, error } = await supa
      .from('portal_requests').select('*')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw error;
    const rows = (data || []) as PortalRequestRow[];

    // Every requester filed through a portal session, so portal_accounts
    // resolves every name (fall back to the raw record id, never a blank).
    const ids = [...new Set(rows.map(r => r.airtable_student_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: accounts } = await supa
        .from('portal_accounts')
        .select('airtable_student_id, display_name, email')
        .in('airtable_student_id', ids);
      for (const a of (accounts || []) as { airtable_student_id: string; display_name: string | null; email: string }[]) {
        names.set(a.airtable_student_id, a.display_name || a.email);
      }
    }

    // Queue discipline: open asks oldest-first (first in, first served);
    // decided history newest-first.
    const queued: Shaped[] = [];
    const decided: Shaped[] = [];
    for (const r of rows) (r.status === 'queued' || r.status === 'approved' ? queued : decided).push(shape(r, names));
    queued.reverse();
    return NextResponse.json({ queued, decided });
  } catch (err: unknown) {
    return NextResponse.json({ queued: [], decided: [], error: (err as Error)?.message || 'Supabase error' }, { status: 200 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, action, resultUrl, note } = await req.json().catch(() => ({}));
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 });

  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  const fields: Record<string, unknown> = { decided_at: new Date().toISOString() };

  if (action === 'done') {
    const url = validResultUrl(resultUrl);
    if (!url) return NextResponse.json({ error: 'A valid http(s) result URL is required to mark done' }, { status: 400 });
    fields.status = 'done';
    fields.result_url = url;
    fields.admin_note = trimmedNote || null;
  } else if (action === 'reject') {
    if (!trimmedNote) return NextResponse.json({ error: 'A note is required to reject — the student sees it' }, { status: 400 });
    fields.status = 'rejected';
    fields.admin_note = trimmedNote;
  } else {
    return NextResponse.json({ error: 'action must be done or reject' }, { status: 400 });
  }

  try {
    const supa = createServiceClient();
    // Only an undecided row can be decided — a stale second tab gets a 409,
    // not a silent overwrite of what the student may already have opened.
    const { data, error } = await supa
      .from('portal_requests').update(fields)
      .eq('id', id).in('status', ['queued', 'approved'])
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Request not found or already decided' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error)?.message || 'update failed' }, { status: 500 });
  }
}
