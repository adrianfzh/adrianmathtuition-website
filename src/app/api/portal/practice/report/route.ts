// POST /api/portal/practice/report — 🚩 a student reports a question written
// from their photo (SPEC-PRACTICE-PHOTO §7). Session-scoped, their own row only.
//
//   { assignmentId, reason: 'wrong-answer'|'not-like-mine'|'unclear'|'other', note? }
//
// One report is enough: the question is stamped reported_at/by/reason (never
// served or used as a seed again), the row leaves the student's list, and
// Adrian gets one Telegram line pointing at /admin/generated.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';
import { parseReportBody, reportReasonText } from '@/lib/practice-photo';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Account = { id: string; airtable_student_id: string };
type Row = { id: string; status: string; source: string | null; question_id: string | null; title: string };

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase.from('portal_accounts').select('id, airtable_student_id').eq('id', user.id).maybeSingle<Account>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const identity = portalIdentity(account);

  const parsed = parseReportBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { assignmentId, reason, note } = parsed.value;

  const admin = createServiceClient();
  const { data: row } = await admin
    .from('portal_assignments')
    .select('id, status, source, question_id, title')
    .eq('id', assignmentId)
    .eq('airtable_student_id', identity)
    .maybeSingle<Row>();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.source !== 'practice-photo' || !row.question_id) return NextResponse.json({ error: 'Only questions written from your photos can be reported here.' }, { status: 409 });

  const reasonText = reportReasonText(reason, note);
  const { error: qErr } = await admin
    .from('questions')
    .update({ reported_at: new Date().toISOString(), reported_by: identity, report_reason: reasonText })
    .eq('id', row.question_id)
    .is('reported_at', null);
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (row.status === 'assigned' || row.status === 'submitted') {
    await admin.from('portal_assignments').update({ status: 'revoked', note: `Reported: ${reasonText}`.slice(0, 300) }).eq('id', row.id);
  }
  try {
    await sendTelegram(`🚩 Practice photo reported by ${identity} — ${row.title}: ${reasonText}\nhttps://www.adrianmathtuition.com/admin/generated`, 'students');
  } catch (e) { console.error('[practice-photo/report] telegram:', (e as Error).message); }
  return NextResponse.json({ ok: true });
}
