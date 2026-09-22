// POST /api/portal/practice/photo/done — the bot's worker has finished a
// practice-photo request (SPEC-PRACTICE-PHOTO §3). Bearer BOT_INTERNAL_SECRET.
//
//   { requestId, questionIds: [...], error?: string }
//
// The first written question flips the student's Writing… row to a live "To
// do" (question_id set); nothing written withdraws the row and tells the
// student. Idempotent: a row already past 'writing' is left alone.
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { parseDoneBody, doneOutcome, PHOTO_FAILED_MESSAGE, PRACTICE_PHOTO_PREFIX } from '@/lib/practice-photo';
import { sendPushToStudent } from '@/lib/portal-push';
import { resolveRecipient } from '@/lib/student-recipient';
import { sendTelegram, sendTelegramTo } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id: string; airtable_student_id: string; status: string; title: string; generation_request_id: string | null };

export async function POST(req: Request) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseDoneBody(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const d = parsed.value;

  const admin = createServiceClient();
  const { data: gr } = await admin.from('generation_requests').select('id, requested_by').eq('id', d.requestId).maybeSingle<{ id: string; requested_by: string | null }>();
  if (!gr) return NextResponse.json({ error: 'unknown request' }, { status: 404 });
  if (!String(gr.requested_by ?? '').startsWith(PRACTICE_PHOTO_PREFIX)) return NextResponse.json({ error: 'not a practice-photo request' }, { status: 409 });

  const { data: row } = await admin
    .from('portal_assignments')
    .select('id, airtable_student_id, status, title, generation_request_id')
    .eq('generation_request_id', d.requestId)
    .maybeSingle<Row>();
  if (!row) return NextResponse.json({ ok: true, noRow: true });
  if (row.status !== 'writing') return NextResponse.json({ ok: true, already: row.status });

  const outcome = doneOutcome(d);
  if (outcome.status === 'assigned') {
    const { error } = await admin.from('portal_assignments').update({ status: 'assigned', question_id: outcome.questionId }).eq('id', row.id).eq('status', 'writing');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const text = `📷 Your ${row.title} question is ready — it's on your Practice list.`;
    sendPushToStudent(row.airtable_student_id, { title: 'Your question is ready', body: `${row.title} — on your Practice list.`, url: '/app/practice' });
    try {
      const to = await resolveRecipient(row.airtable_student_id);
      if (to) await sendTelegramTo(to.chatId, text);
    } catch (e) { console.error('[practice-photo/done] telegram:', (e as Error).message); }
    return NextResponse.json({ ok: true, status: 'assigned', questionId: outcome.questionId });
  }

  const { error } = await admin.from('portal_assignments').update({ status: 'revoked', note: outcome.reason.slice(0, 300) }).eq('id', row.id).eq('status', 'writing');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  sendPushToStudent(row.airtable_student_id, { title: 'That one didn’t work out', body: PHOTO_FAILED_MESSAGE, url: '/app/practice' });
  try {
    const to = await resolveRecipient(row.airtable_student_id);
    if (to) await sendTelegramTo(to.chatId, `📷 ${PHOTO_FAILED_MESSAGE}`);
    await sendTelegram(`📷 Practice photo failed for ${row.airtable_student_id} (${row.title}): ${outcome.reason}`, 'ops');
  } catch (e) { console.error('[practice-photo/done] telegram:', (e as Error).message); }
  return NextResponse.json({ ok: true, status: 'revoked', reason: outcome.reason });
}
