import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { resolveActiveExamType, checkExamInfoStatus, ExamType, ExamRecord } from '@/lib/exam-season';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// GET /api/admin/progress/lessons?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const today = localToday();
  const date = searchParams.get('date') || today;

  // Today + future: only Scheduled. Past: Completed/Absent/Rescheduled/Cancelled.
  const isPast = date < today;
  const statusFilter = isPast
    ? `OR({Status}='Completed',{Status}='Absent',{Status}='Rescheduled',{Status}='Cancelled')`
    : `{Status}='Scheduled'`;
  const formula = `AND(IS_SAME({Date},'${date}','day'),${statusFilter})`;

  const lessons = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(formula)}&sort[0][field]=Date&sort[0][direction]=asc`
  );

  // Collect unique student + slot IDs
  const studentIds = [...new Set(
    lessons.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
  )] as string[];
  const slotIds = [...new Set(
    lessons.records.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean)
  )] as string[];

  // For rescheduled lessons, fetch the new lesson's date
  const rescheduledNewIds = lessons.records
    .filter((r: any) => r.fields['Status'] === 'Rescheduled')
    .map((r: any) => r.fields['Rescheduled Lesson ID']?.[0])
    .filter(Boolean) as string[];

  const [studentsById, slotsById, rescheduledDatesById, settingsData] = await Promise.all([
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
    rescheduledNewIds.length
      ? airtableRequestAll(
          'Lessons',
          `?filterByFormula=${encodeURIComponent(`OR(${rescheduledNewIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)}&fields[]=Date`
        ).then(d => Object.fromEntries(d.records.map((r: any) => [r.id, r.fields['Date'] ?? ''])))
      : Promise.resolve({}),
    airtableRequest(
      'Settings',
      `?filterByFormula=${encodeURIComponent(`{Setting Name}='exam_season_override'`)}&maxRecords=1`
    ).catch(() => ({ records: [] })),
  ]);

  // Resolve active exam type from override + date-based windows
  let forceOn: ExamType | null = null;
  try {
    const v = JSON.parse(settingsData.records?.[0]?.fields?.['Value'] || '{}');
    if (['WA1', 'WA2', 'WA3', 'EOY'].includes(v.forceOn)) forceOn = v.forceOn as ExamType;
  } catch {}
  const activeType = resolveActiveExamType(forceOn);

  // Fetch exams for today's students, filtered to the active exam type
  const examsByStudent: Record<string, ExamRecord[]> = {};
  if (activeType && studentIds.length) {
    try {
      const studentFilter = studentIds.map(id => `FIND('${id}',ARRAYJOIN({Student}))>0`).join(',');
      const examsData = await airtableRequest(
        'Exams',
        `?filterByFormula=${encodeURIComponent(`AND({Exam Type}='${activeType}',OR(${studentFilter}))`)}&fields[]=Student&fields[]=Exam Type&fields[]=Exam Date&fields[]=Tested Topics`
      );
      for (const r of (examsData.records ?? [])) {
        const sid = r.fields['Student']?.[0];
        if (!sid) continue;
        if (!examsByStudent[sid]) examsByStudent[sid] = [];
        examsByStudent[sid].push({
          id: r.id,
          examType: r.fields['Exam Type'] ?? '',
          examDate: r.fields['Exam Date'] ?? null,
          testedTopics: r.fields['Tested Topics'] ?? null,
        });
      }
    } catch (err) {
      console.error('[lessons] exam fetch failed:', err);
    }
  }

  const result = lessons.records.map((r: any) => {
    const studentId = r.fields['Student']?.[0] ?? null;
    const slotId = r.fields['Slot']?.[0] ?? null;
    const student = studentId ? studentsById[studentId] : null;
    const slot = slotId ? slotsById[slotId] : null;
    const rescheduledNewId = r.fields['Rescheduled Lesson ID']?.[0] ?? null;
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
      rescheduledToDate: rescheduledNewId ? (rescheduledDatesById[rescheduledNewId] ?? '') : '',
      examStatus: checkExamInfoStatus(examsByStudent[studentId ?? ''] ?? [], activeType),
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
