// POST /api/portal/science-truth — the student enters the mark their teacher
// gave a science paper we marked (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026,
// rule 7). One whole-paper number → one calibration_results row (truth_source
// 'teacher', label 'student-reported teacher total'), which the calibration
// dashboard reads like any other. A second entry for the same run updates the
// same row. Adrian's marking topic gets one line: teacher vs ours.
//
// Ownership: the run must be the session's own, released, and a science lane.
// The rules (parsing, the row) are pure in lib/science-truth.ts.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { portalIdentity } from '@/lib/portal-auth';
import { parseTeacherTotal, teacherTotalRow, teacherTotalSummary, TEACHER_TOTAL_LABEL } from '@/lib/science-truth';
import { sendTelegram } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts').select('id, airtable_student_id, display_name').eq('id', user.id).single();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sid = portalIdentity(account);

  let body: { runId?: unknown; awarded?: unknown; max?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'Which paper?' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: run } = await admin.from('paper_marking_runs')
    .select('id, paper_name, subject, total_awarded, total_max, model, rules_version, released_at')
    .eq('id', runId).eq('student_id', sid).maybeSingle();
  if (!run || !run.released_at) return NextResponse.json({ error: 'That paper is not yours, or not out yet.' }, { status: 404 });
  const subject = String(run.subject ?? 'math');
  if (subject === 'math') return NextResponse.json({ error: 'This is for science papers.' }, { status: 400 });
  const aiAwarded = Number(run.total_awarded), aiMax = Number(run.total_max);
  if (!Number.isFinite(aiAwarded) || !Number.isFinite(aiMax) || aiMax <= 0) {
    return NextResponse.json({ error: 'This paper has no total to compare with.' }, { status: 409 });
  }

  const parsed = parseTeacherTotal({ awarded: body.awarded, max: body.max }, aiMax);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const truth = parsed.value;

  const row = teacherTotalRow({
    runId, subject, paperName: run.paper_name ?? null, model: run.model ?? null, rulesVersion: run.rules_version ?? null,
    aiAwarded, aiMax, truth,
  });
  // One row per run for this label — a corrected entry replaces the first.
  const { data: existing } = await admin.from('calibration_results').select('id')
    .eq('run_id', runId).eq('truth_source', 'teacher').eq('truth_label', TEACHER_TOTAL_LABEL).limit(1).maybeSingle();
  const write = existing?.id
    ? admin.from('calibration_results').update(row).eq('id', existing.id)
    : admin.from('calibration_results').insert(row);
  const { error } = await write;
  if (error) {
    console.error('[science-truth] write failed:', error.message);
    return NextResponse.json({ error: 'Could not save that — try again in a minute.' }, { status: 500 });
  }

  const summary = teacherTotalSummary(truth, { awarded: aiAwarded, max: aiMax });
  sendTelegram(
    `📏 <b>${escapeTelegramHtml(account.display_name || 'A student')}</b> entered the teacher’s mark for “${escapeTelegramHtml(run.paper_name || 'a science paper')}” (${subject}): ${escapeTelegramHtml(summary.line)}${existing?.id ? ' (updated)' : ''}`,
    'marking',
  ).catch(() => {});

  return NextResponse.json({ ok: true, teacher: truth, ours: { awarded: aiAwarded, max: aiMax }, delta: summary.delta, withinGate: summary.withinGate });
}
