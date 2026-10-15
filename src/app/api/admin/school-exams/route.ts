// 📝 School exam tracker (SPEC-EXAM-TRACKER.md) — admin only.
// GET  ?studentId=rec…  → { scans }
// POST { studentId, level, examType, subject, examDate, airtableExamId, files[] }
//      → the new scan (status 'reading'); the read runs after the reply, the page polls.
import { NextRequest, NextResponse, after } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { insertScan, listScans, runRead } from '@/lib/school-exam-store';
import { SCHOOL_EXAM_MAX_PAGES } from '@/lib/school-exam';
import { keyFromUrl } from '@/lib/student-files';

export const runtime = 'nodejs';
export const maxDuration = 300;

const REC = /^rec[A-Za-z0-9]{14}$/;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = (req.nextUrl.searchParams.get('studentId') || '').trim();
  if (!REC.test(studentId)) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  return NextResponse.json({ scans: await listScans(studentId) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const studentId = String(b.studentId || '');
  const examType = String(b.examType || '').trim().slice(0, 40);
  const files = (Array.isArray(b.files) ? b.files : []).map(String)
    .filter(u => (keyFromUrl(u) || '').startsWith('uploads/'));
  if (!REC.test(studentId) || !examType) return NextResponse.json({ error: 'student and exam are required' }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: 'add the pages first' }, { status: 400 });
  if (files.length > SCHOOL_EXAM_MAX_PAGES) return NextResponse.json({ error: `at most ${SCHOOL_EXAM_MAX_PAGES} pages` }, { status: 400 });
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.examDate || '')) ? String(b.examDate) : null;
  const airtableExamId = REC.test(String(b.airtableExamId || '')) ? String(b.airtableExamId) : null;
  const row = await insertScan({
    student_id: studentId, exam_type: examType, airtable_exam_id: airtableExamId,
    subject: String(b.subject || '').trim().slice(0, 40) || null, exam_date: examDate, files,
  });
  const level = String(b.level || '');
  after(() => runRead(row.id, level));
  return NextResponse.json({ scan: row });
}
