// POST /api/portal/marking/note {runId, note} → { ok, note }
//
// 📝 The student's own remark on a paper (17 Sep 2026, Adrian: "allow for
// students to add a remark to the card/paper"). Writes
// paper_marking_runs.student_note on their own released run; an empty note
// clears it. Adrian sees it on his Papers tab marked "their note" (option 2).
// Rule: lib/paper-label normalizeStudentNote (pure, tested).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeStudentNote } from '@/lib/paper-label';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({} as { runId?: unknown; note?: unknown }));
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const norm = normalizeStudentNote(body.note);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('paper_marking_runs')
    .update({ student_note: norm.note })
    .eq('id', runId).eq('student_id', sid).not('released_at', 'is', null)
    .select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  return NextResponse.json({ ok: true, note: norm.note });
}
