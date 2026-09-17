// POST /api/portal/marking/star {runId, on} → { ok, starred }
//
// ⭐ The student stars (or unstars) one of their own released papers (17 Sep
// 2026). Writes paper_marking_runs.student_starred_at; the ownership filter
// is the access control. Never touches anything Adrian sees on the desk.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({} as { runId?: unknown; on?: unknown }));
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const on = body.on === true;
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('paper_marking_runs')
    .update({ student_starred_at: on ? new Date().toISOString() : null })
    .eq('id', runId).eq('student_id', sid).not('released_at', 'is', null)
    .select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  return NextResponse.json({ ok: true, starred: on });
}
