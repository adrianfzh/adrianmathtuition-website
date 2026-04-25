import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

function shapeExam(r: any) {
  return {
    id: r.id,
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
    createdAt: r.fields['Created At'] ?? '',
  };
}

// GET /api/admin/progress/students/[id]/exams
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  // ARRAYJOIN filter on linked record fields is unreliable — fetch all and filter in JS
  const data = await airtableRequestAll('Exams', '');
  const studentExams = data.records.filter((r: any) => r.fields['Student']?.[0] === id);

  return NextResponse.json({ exams: studentExams.map(shapeExam) });
}

// POST /api/admin/progress/students/[id]/exams
// Upserts: if an exam for (student × examType × subject) already exists, return it
// instead of creating a duplicate.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Check for existing exam with same student + type + subject
  const all = await airtableRequestAll('Exams', '');
  const existing = all.records.find((r: any) =>
    r.fields['Student']?.[0] === id &&
    r.fields['Exam Type'] === body.examType &&
    (body.subject ? r.fields['Subject'] === body.subject : true)
  );
  if (existing) {
    // Patch all provided fields onto the existing record
    const patchFields: Record<string, any> = {};
    if (body.examDate !== undefined) patchFields['Exam Date'] = body.examDate;
    if (body.testedTopics !== undefined) patchFields['Tested Topics'] = body.testedTopics ?? '';
    if (body.examNotes !== undefined) patchFields['Exam Notes'] = body.examNotes ?? '';
    if (body.noExam != null) patchFields['No Exam'] = body.noExam;
    if (body.subject) patchFields['Subject'] = body.subject;
    if (body.customName !== undefined) patchFields['Custom Name'] = body.customName ?? '';
    if (body.resultScore != null) patchFields['Result Score'] = body.resultScore;
    if (body.resultTotal != null) patchFields['Result Total'] = body.resultTotal;
    if (body.resultGrade !== undefined) patchFields['Result Grade'] = body.resultGrade ?? '';
    if (body.resultNotes !== undefined) patchFields['Result Notes'] = body.resultNotes ?? '';
    if (Object.keys(patchFields).length > 0) {
      const patched = await airtableRequest('Exams', `/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: patchFields }),
      });
      return NextResponse.json(shapeExam(patched));
    }
    return NextResponse.json(shapeExam(existing));
  }

  const fields: Record<string, any> = {
    Student: [id],
    'Exam Type': body.examType,
    Subject: body.subject,
    'Exam Date': body.examDate,
    'Tested Topics': body.testedTopics ?? '',
    'Exam Notes': body.examNotes ?? '',
  };
  if (body.customName) fields['Custom Name'] = body.customName;
  if (body.noExam != null) fields['No Exam'] = body.noExam;
  if (body.resultScore != null) fields['Result Score'] = body.resultScore;
  if (body.resultTotal != null) fields['Result Total'] = body.resultTotal;
  if (body.resultGrade) fields['Result Grade'] = body.resultGrade;
  if (body.resultNotes) fields['Result Notes'] = body.resultNotes;

  const data = await airtableRequest('Exams', '', {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
  return NextResponse.json(shapeExam(data));
}
