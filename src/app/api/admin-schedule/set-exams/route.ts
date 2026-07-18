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
//   noExam?: boolean,                              // whole season = no WA exam
//   pwaa?: 'Project Work' | 'Alternative Assessment' | '',  // has this INSTEAD of a WA
//   entries: [{ subject, paper?, examDate?, testedTopics?, notes? }]
// }
// paper: 'Paper 1' | 'Paper 2' | '' (blank = single paper)
//
// PW/AA: some students sit Project Work / an Alternative Assessment instead of a
// WA. That means no WA exam (noExam), but the schedule chip should say so rather
// than "no upcoming exam". No new Airtable field — the assessment label is stored
// as a "PWAA:<type>" marker in Exam Notes on the No-Exam marker record (same
// marker-in-a-field pattern as the "~|" approx flag and the paper-in-Subject).
//
// Reconciliation: an entry with a date/topics/notes is upserted (matched on
// subject+paper); a record whose (subject,paper) is not in the active entries is
// deleted UNLESS it already carries a result (post-exam data we must not lose).

interface Entry { subject?: string; paper?: string; examDate?: string; testedTopics?: string; notes?: string; approx?: boolean }

// An approximate ("week only") date is flagged with a leading marker in Exam
// Notes (no extra Airtable field). encodeNotes/… the schedule route strips it.
const APPROX = '~|';
const encodeNotes = (notes?: string, approx?: boolean) => (approx ? APPROX : '') + (notes ?? '');

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

  let body: { studentId?: string; examType?: string; noExam?: boolean; pwaa?: string; entries?: Entry[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { studentId, examType, pwaa, entries = [] } = body;
  // PW/AA implies no WA exam, so it drives the no-exam branch too.
  const noExam = body.noExam || !!(pwaa || '').trim();
  // The PW/AA label to stamp on the marker record's Exam Notes (empty = plain no-exam).
  const pwaaNote = (pwaa || '').trim() ? `PWAA:${(pwaa || '').trim()}` : '';
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

  // ── No WA exam this season: drop everything, keep a single No-Exam marker.
  // If PW/AA, tag the marker's Exam Notes so the chip shows the assessment. ──
  if (noExam) {
    let markerKept = false;
    for (const r of mine) {
      if (!markerKept) {
        await airtableRequest('Exams', `/${r.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { 'No Exam': true, 'Exam Date': null, 'Tested Topics': '', 'Subject': null, 'Exam Notes': pwaaNote } }) });
        markerKept = true; result.updated++;
      } else {
        await airtableRequest('Exams', `/${r.id}`, { method: 'DELETE' }); result.deleted++;
      }
    }
    if (!markerKept) {
      await airtableRequest('Exams', '', { method: 'POST', body: JSON.stringify({ fields: { Student: [studentId], 'Exam Type': examType, 'No Exam': true, 'Exam Notes': pwaaNote } }) });
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
      'Exam Notes': encodeNotes(e.notes, e.approx),
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
