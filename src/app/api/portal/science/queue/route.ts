// POST /api/portal/science/queue — the student's own science waiting list
// (SPEC-PRACTICE-PHOTO §14, 24 Sep 2026). One action, `remove`: a paper still
// waiting for its day (result_json.queued_for set, not yet handed to the 🌙
// queue by the midnight cron, not released) is deleted with its photos. Once
// marking has started it stays — 409. Only the owning student may call it;
// anon → 401 (the health-check probes that).
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';
import { removeStudentFiles } from '@/lib/student-files';
import { collectFileKeys } from '@/lib/student-files-url';

export const dynamic = 'force-dynamic';

type Account = { id: string; airtable_student_id: string | null };

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { data: account } = await supabase.from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id).maybeSingle<Account>();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const identity = portalIdentity(account);

  let body: { action?: string; runId?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (body.action !== 'remove' || typeof body.runId !== 'string' || !body.runId) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const admin = createServiceClient();
  const { data: run } = await admin.from('paper_marking_runs')
    .select('id, result_json, released_at')
    .eq('id', body.runId).eq('student_id', identity).maybeSingle();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const rj = (run.result_json && typeof run.result_json === 'object') ? run.result_json as Record<string, unknown> : {};
  const waiting = typeof rj.queued_for === 'string' && !rj.queue_released_at && !rj.queue_removed_at && !run.released_at;
  if (!waiting) return NextResponse.json({ error: 'That paper is already being marked — it cannot be removed now.' }, { status: 409 });

  // Hard delete first; if something still points at the run, fall back to a
  // soft removal the list, the placement rule and the cron all honour.
  const { error: delErr } = await admin.from('paper_marking_runs')
    .delete().eq('id', run.id).eq('student_id', identity).is('released_at', null);
  if (delErr) {
    const { error: softErr } = await admin.from('paper_marking_runs')
      .update({ result_json: { ...rj, queue_removed_at: new Date().toISOString() } })
      .eq('id', run.id).eq('student_id', identity);
    if (softErr) return NextResponse.json({ error: 'Could not remove it — try again.' }, { status: 500 });
  }
  const keys = collectFileKeys(rj.source);
  if (keys.length) removeStudentFiles(keys).catch(() => {});
  return NextResponse.json({ ok: true, removed: run.id });
}
