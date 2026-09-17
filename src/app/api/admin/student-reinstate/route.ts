// POST /api/admin/student-reinstate { studentId }
//
// ↩ Undo a Discontinue (17 Sep 2026, SPEC-STUDENT-FIRST §4, Option A): put
// the enrolments back, re-create the deleted future lessons in their own
// slots, set the student Active again. Reads the snapshot the discontinue
// route wrote (student_discontinue_log). Stops before writing anything when a
// slot-day has since been given to another student (409 with the list).
// Invoices it voided are reported, never un-voided. Silent to parents.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram';
import { invalidateScheduleStatics } from '@/lib/schedule-static-cache';
import { clashes, lessonRestoreFields, lessonsToRecreate, type DiscontinueSnapshot, type ExistingLesson } from '@/lib/reinstate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId } = await req.json().catch(() => ({}));
  if (!studentId || typeof studentId !== 'string') return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: log } = await sb.from('student_discontinue_log').select('*')
    .eq('student_id', studentId).is('reinstated_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!log) return NextResponse.json({ error: 'Nothing recorded to put back — this student was discontinued before Reinstate existed, or has already been reinstated.' }, { status: 404 });
  const snap = log.snapshot as DiscontinueSnapshot;

  // The clash check, before any write.
  const dates = snap.lessons.map(l => String(l.fields.Date ?? '')).filter(Boolean).sort();
  let existing: ExistingLesson[] = [];
  if (dates.length) {
    const f = encodeURIComponent(`AND({Date}>='${dates[0]}',{Date}<'${nextDay(dates[dates.length - 1])}',{Status}='Scheduled')`);
    const les = await airtableRequestAll('Lessons', `?filterByFormula=${f}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Status`);
    existing = (les.records || []).map((r: { id: string; fields: Record<string, unknown> }) => ({
      id: r.id, student: (r.fields.Student as string[] | undefined)?.[0] ?? null, slot: (r.fields.Slot as string[] | undefined)?.[0] ?? null,
      date: String(r.fields.Date ?? ''), status: String(r.fields.Status ?? ''),
    }));
  }
  const clash = clashes(snap.lessons, existing, studentId);
  if (clash.length) {
    return NextResponse.json({ error: 'clash', clashes: clash, message: `${clash.length} of the lessons cannot come back: the slot on ${clash.map(c => c.date).join(', ')} now belongs to another student. Nothing was changed — free the slot or move those lessons first.` }, { status: 409 });
  }

  const result = { enrollmentsRestored: 0, lessonsRecreated: 0, studentActive: false, invoicesVoidedEarlier: snap.invoicesVoided ?? [] };
  for (const e of snap.enrollments) {
    await airtableRequest('Enrollments', `/${e.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Status: 'Active', 'End Date': e.endDate } }) });
    result.enrollmentsRestored++;
  }
  const todo = lessonsToRecreate(snap.lessons, existing, studentId);
  for (let i = 0; i < todo.length; i += 10) {
    const chunk = todo.slice(i, i + 10).map(l => ({ fields: lessonRestoreFields(l.fields) }));
    await airtableRequest('Lessons', '', { method: 'POST', body: JSON.stringify({ records: chunk }) });
    result.lessonsRecreated += chunk.length;
  }
  let notes = '';
  try { const s = await airtableRequest('Students', `/${studentId}`); notes = s.fields['Notes'] || ''; } catch { /* non-fatal */ }
  const stamp = `[Reinstated ${new Date().toISOString().slice(0, 10)}]`;
  await airtableRequest('Students', `/${studentId}`, { method: 'PATCH', body: JSON.stringify({ fields: { Status: 'Active', Notes: notes ? `${notes}\n${stamp}` : stamp } }) });
  result.studentActive = true;
  invalidateScheduleStatics();
  await sb.from('student_discontinue_log').update({ reinstated_at: new Date().toISOString(), reinstate_result: result }).eq('id', log.id);
  try {
    await sendTelegram(`↩ Reinstated ${log.student_name || studentId}: ${result.enrollmentsRestored} enrolment(s) back, ${result.lessonsRecreated} lesson(s) re-created${result.invoicesVoidedEarlier.length ? `; ${result.invoicesVoidedEarlier.length} invoice(s) voided at discontinue stay voided — check them` : ''}.`, 'students');
  } catch { /* silent */ }
  return NextResponse.json({ ok: true, ...result });
}

function nextDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}
