import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

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
    studentId: r.fields['Student']?.[0] ?? '',
    createdAt: r.fields['Created At'] ?? '',
  };
}

// GET /api/admin/progress/exams/[examId]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { examId } = await params;
  const data = await airtableRequest('Exams', `/${examId}`);
  return NextResponse.json(shapeExam(data));
}

// PATCH /api/admin/progress/exams/[examId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { examId } = await params;
  const body = await req.json();
  const fields: Record<string, any> = {};
  if (body.examType !== undefined) fields['Exam Type'] = body.examType;
  if (body.customName !== undefined) fields['Custom Name'] = body.customName;
  if (body.subject !== undefined) fields['Subject'] = body.subject;
  if (body.examDate !== undefined) fields['Exam Date'] = body.examDate;
  if (body.testedTopics !== undefined) fields['Tested Topics'] = body.testedTopics;
  if (body.resultScore !== undefined) fields['Result Score'] = body.resultScore;
  if (body.resultTotal !== undefined) fields['Result Total'] = body.resultTotal;
  if (body.resultGrade !== undefined) fields['Result Grade'] = body.resultGrade;
  if (body.resultNotes !== undefined) fields['Result Notes'] = body.resultNotes;

  const data = await airtableRequest('Exams', `/${examId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  return NextResponse.json(shapeExam(data));
}

// DELETE /api/admin/progress/exams/[examId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { examId } = await params;
  await airtableRequest('Exams', `/${examId}`, { method: 'DELETE' });
  return NextResponse.json({ deleted: true });
}
