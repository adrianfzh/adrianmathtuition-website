// POST /api/portal/practice-again/request { runId } → { ok, state:'queued', jobId }
//
// The student's door to a Practice Again sheet (Adrian, 8 Sep 2026: "allow
// them to request for Practice Again worksheets, so only generate when they
// request"). Their own RELEASED paper only; the queue guard in lib/sheet-queue
// is the same one Adrian's desk uses, so the two doors can never disagree
// about which papers may have a sheet. The sheet goes out on its own once the
// Mac has written it and it clears the accuracy gate (sheet-jobs `done`).
// Anonymous → 401 (the health-check probes this).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { queueSheetJob } from '@/lib/sheet-queue';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);

  const body = await req.json().catch(() => ({} as { runId?: unknown }));
  const runId = String((body as { runId?: unknown }).runId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: run } = await sb.from('paper_marking_runs')
    .select('id, paper_name, student_name, released_at')
    .eq('id', runId).eq('student_id', sid).not('released_at', 'is', null)
    .maybeSingle<{ id: string; paper_name: string | null; student_name: string | null; released_at: string }>();
  if (!run) return NextResponse.json({ error: 'That paper is not one of yours, or is not out yet.' }, { status: 404 });

  const out = await queueSheetJob(runId, { requestedBy: 'student' });
  if (!out.ok) {
    // Already being written: that IS what they asked for — say so, no error.
    if (out.status === 'duplicate') return NextResponse.json({ ok: true, state: 'queued', already: true, jobId: out.jobId ?? null });
    const copy = out.status === 'exists'
      ? 'A Practice Again sheet for this paper already exists — Adrian is checking it before it comes to you.'
      : out.status === 'not-released'
        ? 'This paper is not out yet — ask once it is.'
        : 'This paper can’t have a sheet yet — ask Adrian.';
    return NextResponse.json({ error: copy }, { status: out.http });
  }
  const jobId = (out.job as { id?: string } | null)?.id ?? null;

  const { error: logErr } = await sb.from('portal_event_log').insert({ identity: sid, kind: 'practice-again:request', detail: { runId, jobId } });
  if (logErr) console.warn('[practice-again/request] event log failed:', logErr.message);

  const who = account.display_name || run.student_name || 'A student';
  sendTelegram(
    `📘 <b>${who}</b> asked for Practice Again on ${run.paper_name || 'a marked paper'} from the app — queued for the Mac. It goes out on its own once written and checked; a gate failure holds it on the desk for you.`,
    'marking',
  ).catch(() => {});

  return NextResponse.json({ ok: true, state: 'queued', jobId });
}
