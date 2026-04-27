import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// POST /api/admin-schedule/quick-add-exam
// Creates or updates an exam record for (student × examType).
// Body: { studentId, examType, examDate?, testedTopics?, noExam? }
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    studentId: string;
    examType: string;
    subject?: string;
    examDate?: string;
    testedTopics?: string;
    noExam?: boolean;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { studentId, examType, subject, examDate, testedTopics, noExam, notes } = body;
  if (!studentId || !examType) {
    return NextResponse.json({ error: 'Missing studentId or examType' }, { status: 400 });
  }

  // Check for existing exam record (same student + examType + subject).
  // ARRAYJOIN filter on linked records is unreliable — filter in JS.
  const allExams = await airtableRequestAll(
    'Exams',
    `?filterByFormula=${encodeURIComponent(`{Exam Type}='${examType}'`)}&fields[]=Student&fields[]=Subject&fields[]=Exam Date&fields[]=Tested Topics&fields[]=No Exam`
  );
  const existing = allExams.records.find(
    (r: any) =>
      r.fields['Student']?.[0] === studentId &&
      (r.fields['Subject'] ?? '') === (subject ?? '')
  );

  const patchFields: Record<string, any> = {};
  if (subject !== undefined) patchFields['Subject'] = subject || null;
  if (examDate !== undefined) patchFields['Exam Date'] = examDate || null;
  if (testedTopics !== undefined) patchFields['Tested Topics'] = testedTopics ?? '';
  if (noExam !== undefined) patchFields['No Exam'] = noExam;
  if (notes !== undefined) patchFields['Exam Notes'] = notes ?? '';

  if (existing) {
    // Patch existing record
    const updated = await airtableRequest('Exams', `/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: patchFields }),
    });
    return NextResponse.json({
      id: updated.id,
      examType,
      subject: updated.fields['Subject'] ?? '',
      examDate: updated.fields['Exam Date'] ?? null,
      testedTopics: updated.fields['Tested Topics'] ?? '',
      noExam: updated.fields['No Exam'] ?? false,
    });
  }

  // Create new exam record
  const newFields: Record<string, any> = {
    Student: [studentId],
    'Exam Type': examType,
  };
  if (subject) newFields['Subject'] = subject;
  if (examDate) newFields['Exam Date'] = examDate;
  if (testedTopics) newFields['Tested Topics'] = testedTopics;
  if (noExam !== undefined) newFields['No Exam'] = noExam;
  if (notes) newFields['Exam Notes'] = notes;

  const created = await airtableRequest('Exams', '', {
    method: 'POST',
    body: JSON.stringify({ fields: newFields }),
  });
  return NextResponse.json({
    id: created.id,
    examType,
    subject: created.fields['Subject'] ?? '',
    examDate: created.fields['Exam Date'] ?? null,
    testedTopics: created.fields['Tested Topics'] ?? '',
    noExam: created.fields['No Exam'] ?? false,
  });
}
