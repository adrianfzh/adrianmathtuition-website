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
  const filter = encodeURIComponent(`FIND('${id}', ARRAYJOIN({Student}))>0`);
  const data = await airtableRequestAll(
    'Exams',
    `?filterByFormula=${filter}&sort[0][field]=Exam Date&sort[0][direction]=desc`
  );

  return NextResponse.json({ exams: data.records.map(shapeExam) });
}

// POST /api/admin/progress/students/[id]/exams
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const fields: Record<string, any> = {
    Student: [id],
    'Exam Type': body.examType,
    Subject: body.subject,
    'Exam Date': body.examDate,
    'Tested Topics': body.testedTopics ?? '',
  };
  if (body.customName) fields['Custom Name'] = body.customName;
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
