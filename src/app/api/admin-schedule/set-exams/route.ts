import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// POST /api/admin-schedule/set-exams
// Reconciles a student's exam records for one exam type against a full desired
// set of (subject × paper) entries. Used by the schedule exam quick-add, which
// can hold Paper 1 / Paper 2 for prelims (S4 EM/AM, JC2) plus single-paper
// subjects for other levels.
//
// Body: {
//   studentId, examType,
//   noExam?: boolean,                              // whole season = no exam
//   entries: [{ subject, paper?, examDate?, testedTopics?, notes? }]
// }
// paper: 'Paper 1' | 'Paper 2' | '' (blank = single paper)
//
// Reconciliation: an entry with a date/topics/notes is upserted (matched on
// subject+paper); a record whose (subject,paper) is not in the active entries is
// deleted UNLESS it already carries a result (post-exam data we must not lose).

interface Entry { subject?: string; paper?: string; examDate?: string; testedTopics?: string; notes?: string }

// Paper is encoded INTO the Subject field ("E Math (P1)") so no new Airtable
// field is needed. subjectField() builds the stored value; the schedule route
// parses it back into { subject, paper }.
function subjectField(subject?: string, paper?: string): string {
  const s = (subject || '').trim();
  const p = (paper || '').trim();
  if (!p) return s;
  const short = p === 'Paper 1' ? 'P1' : p === 'Paper 2' ? 'P2' : p;
  return s ? `${s} (${short})` : short;
}
const isActive = (e: Entry) => !!((e.examDate || '').trim() || (e.testedTopics || '').trim() || (e.notes || '').trim());

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { studentId?: string; examType?: string; noExam?: boolean; entries?: Entry[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { studentId, examType, noExam, entries = [] } = body;
  if (!studentId || !examType) return NextResponse.json({ error: 'Missing studentId or examType' }, { status: 400 });

  // Existing records for this (student, examType) — linked-record filter is
  // unreliable, so filter by Exam Type in Airtable and match student in JS.
  const all = await airtableRequestAll(
    'Exams',
    `?filterByFormula=${encodeURIComponent(`{Exam Type}='${examType}'`)}&fields[]=Student&fields[]=Subject&fields[]=Exam Date&fields[]=Tested Topics&fields[]=Exam Notes&fields[]=No Exam&fields[]=Result Score&fields[]=Result Total`
  );
  const mine = (all.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
  const byKey = new Map<string, any>();
  for (const r of mine) byKey.set((r.fields['Subject'] || '').trim(), r); // Subject encodes the paper
  const hasResult = (r: any) => r.fields['Result Score'] != null || r.fields['Result Total'] != null;

  const result = { created: 0, updated: 0, deleted: 0 };

  // ── No exam this season: drop everything, keep a single No-Exam marker ──
  if (noExam) {
    let markerKept = false;
    for (const r of mine) {
      if (!markerKept) {
        await airtableRequest('Exams', `/${r.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'No Exam': true, 'Exam Date': null, 'Tested Topics': '', 'Subject': null } }) });
        markerKept = true; result.updated++;
      } else {
        await airtableRequest('Exams', `/${r.id}`, { method: 'DELETE' }); result.deleted++;
      }
    }
    if (!markerKept) {
      await airtableRequest('Exams', '', { method: 'POST', body: JSON.stringify({ fields: { Student: [studentId], 'Exam Type': examType, 'No Exam': true } }) });
      result.created++;
    }
    return NextResponse.json({ ok: true, ...result });
  }

  const activeKeys = new Set<string>();
  for (const e of entries) {
    if (!isActive(e)) continue;
    const subj = subjectField(e.subject, e.paper); // paper encoded into Subject
    activeKeys.add(subj);
    const fields: Record<string, any> = {
      Subject: subj || null,
      'Exam Date': (e.examDate || '').trim() || null,
      'Tested Topics': e.testedTopics ?? '',
      'Exam Notes': e.notes ?? '',
      'No Exam': false,
    };
    const existing = byKey.get(subj);
    if (existing) {
      await airtableRequest('Exams', `/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ typecast: true, fields }) });
      result.updated++;
    } else {
      await airtableRequest('Exams', '', { method: 'POST', body: JSON.stringify({ typecast: true, fields: { Student: [studentId], 'Exam Type': examType, ...fields } }) });
      result.created++;
    }
  }

  // Delete records no longer wanted (skip any that carry a result).
  for (const r of mine) {
    const subj = (r.fields['Subject'] || '').trim();
    if (activeKeys.has(subj) || hasResult(r)) continue;
    await airtableRequest('Exams', `/${r.id}`, { method: 'DELETE' });
    result.deleted++;
  }

  return NextResponse.json({ ok: true, ...result });
}
