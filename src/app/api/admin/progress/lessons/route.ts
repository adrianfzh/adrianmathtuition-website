import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// GET /api/admin/progress/lessons?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const formula = `AND(IS_SAME({Date},'${date}','day'),OR({Status}='Completed',{Status}='Scheduled',{Status}='Rescheduled'))`;
  console.log('[progress/lessons] date param:', date, '| formula:', formula);

  const filter = encodeURIComponent(formula);
  const lessons = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${filter}&sort[0][field]=Date&sort[0][direction]=asc`
  );

  console.log('[progress/lessons] raw record count:', lessons.records.length);

  // Collect unique student + slot IDs
  const studentIds = [...new Set(
    lessons.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
  )] as string[];
  const slotIds = [...new Set(
    lessons.records.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean)
  )] as string[];

  const [studentsById, slotsById] = await Promise.all([
    studentIds.length
      ? airtableRequestAll(
          'Students',
          `?filterByFormula=${encodeURIComponent(`OR(${studentIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Student Name&fields[]=Level&fields[]=Subjects&fields[]=Subject Level&fields[]=Parent Email&fields[]=Parent Name`
        ).then(d => Object.fromEntries(d.records.map((r: any) => [r.id, r.fields])))
      : Promise.resolve({}),
    slotIds.length
      ? airtableRequestAll(
          'Slots',
          `?filterByFormula=${encodeURIComponent(`OR(${slotIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Time`
        ).then(d => Object.fromEntries(d.records.map((r: any) => [r.id, r.fields])))
      : Promise.resolve({}),
  ]);

  const result = lessons.records.map((r: any) => {
    const studentId = r.fields['Student']?.[0] ?? null;
    const slotId = r.fields['Slot']?.[0] ?? null;
    const student = studentId ? studentsById[studentId] : null;
    const slot = slotId ? slotsById[slotId] : null;
    return {
      id: r.id,
      date: r.fields['Date'] ?? '',
      status: r.fields['Status'] ?? '',
      type: r.fields['Type'] ?? '',
      studentId,
      slotId,
      studentName: student?.['Student Name'] ?? '',
      level: student?.['Level'] ?? '',
      subjects: student?.['Subjects'] ?? [],
      subjectLevel: student?.['Subject Level'] ?? '',
      parentEmail: student?.['Parent Email'] ?? '',
      parentName: student?.['Parent Name'] ?? '',
      slotTime: slot?.['Time'] ?? '',
      // progress fields
      topicsCovered: r.fields['Topics Covered'] ?? '',
      homeworkAssigned: r.fields['Homework Assigned'] ?? '',
      homeworkCompletion: r.fields['Homework Completion'] ?? 'Not Set',
      masteryRatings: r.fields['Mastery Ratings'] ?? '',
      mood: r.fields['Mood'] ?? '',
      lessonNotes: r.fields['Lesson Notes'] ?? '',
      progressLogged: r.fields['Progress Logged'] ?? false,
    };
  });

  return NextResponse.json({ lessons: result });
}

// PATCH /api/admin/progress/lessons?id=recXXX
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const data = await airtableRequest('Lessons', `/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: body.fields }),
  });
  return NextResponse.json(data);
}
