// POST /api/portal/marking/label {runId, label} → { ok, name, label }
//
// ✏️ The student renames one of their own papers (17 Sep 2026). Writes
// paper_marking_runs.student_label on a RELEASED run that is theirs — the
// ownership filter is the access control (no per-student RLS on that table).
// An empty label clears it (back to the app's display name). Adrian's
// paper_name is never touched. Rule: lib/paper-label (pure, tested).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeStudentLabel, studentPaperName } from '@/lib/paper-label';
import { displayPaperName } from '@/lib/paper-display-name';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({} as { runId?: unknown; label?: unknown }));
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const norm = normalizeStudentLabel(body.label);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('paper_marking_runs')
    .update({ student_label: norm.label })
    .eq('id', runId).eq('student_id', sid).not('released_at', 'is', null)
    .select('id, paper_name').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  const name = studentPaperName(norm.label, displayPaperName(data.paper_name, account.display_name ?? null));
  return NextResponse.json({ ok: true, name, label: norm.label });
}
