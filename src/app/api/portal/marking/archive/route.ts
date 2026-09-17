// POST /api/portal/marking/archive {runId, on} → { ok, archived }
//
// 🗂 The student archives (or restores) one of their own released papers
// (17 Sep 2026, Adrian: "let's do archive too"). Writes
// paper_marking_runs.student_archived_at; the paper leaves their list for a
// folded "Archived" row at the foot of its tab. Nothing is deleted; the desk
// and the profile never look at this column.
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
    .update({ student_archived_at: on ? new Date().toISOString() : null })
    .eq('id', runId).eq('student_id', sid).not('released_at', 'is', null)
    .select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  return NextResponse.json({ ok: true, archived: on });
}
