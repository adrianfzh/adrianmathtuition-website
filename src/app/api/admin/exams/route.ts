// /api/admin/exams — day-to-day exam ops for admin (dates · topics · results).
// ADMIN-ONLY. Results (score/total/grade/notes) must never reach the portal.
//
// GET ?type=WA3[&year=2026]      → { students[], exams[] }  (cohort mode)
// GET ?studentId=recXXX          → { student, exams[] }     (single-student mode)
// POST { studentId, examType, ... }               → upsert one record, returns shaped exam
// POST { bulk:true, studentIds[], examType, ... } → set date/topics for many, returns { updated }
//
// Exam records are keyed per (student × examType). Airtable has no Year column and
// the API token cannot add one, so `year` is used only to default new exam dates and
// as a display label — one live record per assessment type per student.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { gradeFromScore } from '@/lib/exam-grade';

export const runtime = 'nodejs';

function shapeExam(r: any) {
  return {
    id: r.id,
    studentId: r.fields['Student']?.[0] ?? null,
    examType: r.fields['Exam Type'] ?? '',
    customName: r.fields['Custom Name'] ?? '',
    subject: r.fields['Subject'] ?? '',
    examDate: r.fields['Exam Date'] ?? '',
    testedTopics: r.fields['Tested Topics'] ?? '',
    resultScore: r.fields['Result Score'] ?? null,
    resultTotal: r.fields['Result Total'] ?? null,
    resultGrade: r.fields['Result Grade'] ?? '',
    resultNotes: r.fields['Result Notes'] ?? '',
    examNotes: r.fields['Exam Notes'] ?? '',
    noExam: r.fields['No Exam'] ?? false,
  };
}

function shapeStudent(r: any) {
  return {
    id: r.id,
    name: r.fields['Student Name'] ?? '',
    level: r.fields['Level'] ?? '',
    subjects: r.fields['Subjects'] ?? [],
    subjectLevel: r.fields['Subject Level'] ?? '',
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const studentId = sp.get('studentId');
  const type = sp.get('type');

  // Linked-record filters are unreliable — fetch all exams once, match in JS.
  const examsData = await airtableRequestAll('Exams', '');

  if (studentId) {
    const exams = examsData.records
      .filter((r: any) => r.fields['Student']?.[0] === studentId)
      .map(shapeExam);
    return NextResponse.json({ studentId, exams });
  }

  if (!type) return NextResponse.json({ error: 'type or studentId required' }, { status: 400 });

  const studentsData = await airtableRequestAll(
    'Students',
    `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student Name&fields[]=Level&fields[]=Subjects&fields[]=Subject Level`,
  );
  const students = studentsData.records
    .map(shapeStudent)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  const exams = examsData.records
    .filter((r: any) => r.fields['Exam Type'] === type)
    .map(shapeExam);

  return NextResponse.json({ type, students, exams });
}

// Build the field patch for an exam from a partial body. Recomputes Result Grade
// whenever score/total are known. Returns null if nothing to write.
function buildFields(body: any, existing: any | null): Record<string, any> {
  const f: Record<string, any> = {};
  if (body.subject !== undefined) f['Subject'] = body.subject || null;
  if (body.examDate !== undefined) f['Exam Date'] = body.examDate || null;
  if (body.testedTopics !== undefined) f['Tested Topics'] = body.testedTopics ?? '';
  if (body.examNotes !== undefined) f['Exam Notes'] = body.examNotes ?? '';
  if (body.resultNotes !== undefined) f['Result Notes'] = body.resultNotes ?? '';
  if (body.noExam !== undefined) f['No Exam'] = !!body.noExam;
  if (body.customName !== undefined) f['Custom Name'] = body.customName ?? '';

  const scoreProvided = body.resultScore !== undefined;
  const totalProvided = body.resultTotal !== undefined;
  if (scoreProvided) f['Result Score'] = body.resultScore ?? null;
  if (totalProvided) f['Result Total'] = body.resultTotal ?? null;
  if (scoreProvided || totalProvided) {
    const score = scoreProvided ? body.resultScore : existing?.fields?.['Result Score'] ?? null;
    const total = totalProvided ? body.resultTotal : existing?.fields?.['Result Total'] ?? null;
    f['Result Grade'] = gradeFromScore(score, total); // '' when not computable
  } else if (body.resultGrade !== undefined) {
    f['Result Grade'] = body.resultGrade ?? '';
  }
  return f;
}

async function upsertOne(studentId: string, examType: string, body: any, all: any[]): Promise<any> {
  const existing = all.find(
    (r: any) => r.fields['Student']?.[0] === studentId && r.fields['Exam Type'] === examType,
  );
  const fields = buildFields(body, existing || null);

  if (existing) {
    if (Object.keys(fields).length === 0) return existing;
    return airtableRequest('Exams', `/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
  }
  const createFields: Record<string, any> = { Student: [studentId], 'Exam Type': examType, ...fields };
  const created = await airtableRequest('Exams', '', {
    method: 'POST',
    body: JSON.stringify({ fields: createFields }),
  });
  all.push(created); // keep local cache coherent for bulk loops
  return created;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const examType = body.examType;
  if (!examType) return NextResponse.json({ error: 'examType required' }, { status: 400 });

  const all = (await airtableRequestAll('Exams', '')).records;

  // ── Bulk: set one date and/or one topic set for many students ──────────────
  if (body.bulk) {
    const ids: string[] = Array.isArray(body.studentIds) ? body.studentIds : [];
    if (ids.length === 0) return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
    // Only the fields explicitly provided propagate to everyone.
    const shared: any = { examType };
    if (body.examDate !== undefined) shared.examDate = body.examDate;
    if (body.testedTopics !== undefined) shared.testedTopics = body.testedTopics;
    if (body.noExam !== undefined) shared.noExam = body.noExam;
    let updated = 0;
    const results: any[] = [];
    for (const id of ids) {
      try { results.push(shapeExam(await upsertOne(id, examType, shared, all))); updated++; }
      catch (e: any) { console.error('[exams bulk] failed for', id, e?.message); }
    }
    return NextResponse.json({ updated, exams: results });
  }

  // ── Single upsert ──────────────────────────────────────────────────────────
  if (!body.studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const rec = await upsertOne(body.studentId, examType, body, all);
  return NextResponse.json(shapeExam(rec));
}
