import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo, EDIT_WINDOW_DAYS } from '@/lib/schedule-helpers';
import { resolveActiveExamType } from '@/lib/exam-season';

export const runtime = 'nodejs';

// GET /api/admin-schedule/lesson-context?id=recXXX
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get('id');
  if (!lessonId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Fetch the lesson with all progress fields
  // NOTE: Single-record GET endpoint does NOT support fields[] filtering — fetch all fields
  const lesson = await airtableRequest('Lessons', `/${lessonId}`);

  const lessonDate: string = lesson.fields['Date'] ?? '';
  const studentId: string | undefined = lesson.fields['Student']?.[0];
  const today = localToday();
  const cutoff = daysAgo(EDIT_WINDOW_DAYS);

  const isFuture = lessonDate > today;
  const isEditable = !isFuture && lessonDate >= cutoff;

  const current = {
    topicsCovered: lesson.fields['Topics Covered'] ?? '',
    homeworkAssigned: lesson.fields['Homework Assigned'] ?? '',
    mastery: lesson.fields['Mastery'] ?? '',
    mood: lesson.fields['Mood'] ?? '',
    lessonNotes: lesson.fields['Lesson Notes'] ?? '',
    progressLogged: lesson.fields['Progress Logged'] ?? false,
  };

  // Fetch previous lesson for this student (most recent before this date)
  let prev: {
    id: string;
    date: string;
    topicsCovered: string;
    homeworkAssigned: string;
    homeworkReturned: string;
  } | null = null;

  let studentLevel = '';

  if (studentId) {
    const [prevLessons, studentData] = await Promise.all([
      airtableRequestAll(
        'Lessons',
        `?filterByFormula=${encodeURIComponent(
          `AND(FIND('${studentId}',ARRAYJOIN({Student}))>0,{Date}<'${lessonDate}',{Status}!='Absent',{Status}!='Cancelled',{Status}!='Rescheduled')`
        )}&sort[0][field]=Date&sort[0][direction]=desc&maxRecords=1` +
        `&fields[]=Date&fields[]=Topics Covered&fields[]=Homework Assigned&fields[]=Homework Returned`
      ),
      airtableRequest('Students', `/${studentId}`).catch(() => ({ fields: {} })),
    ]);

    if (prevLessons.records.length > 0) {
      const r = prevLessons.records[0];
      prev = {
        id: r.id,
        date: r.fields['Date'] ?? '',
        topicsCovered: r.fields['Topics Covered'] ?? '',
        homeworkAssigned: r.fields['Homework Assigned'] ?? '',
        homeworkReturned: r.fields['Homework Returned'] ?? '',
      };
    }

    studentLevel = (studentData as any).fields?.['Level'] ?? '';
  }

  // Fetch active exam type + exam record for this student
  let examType: string | null = null;
  let examDate: string | null = null;
  let examTopics: string | null = null;
  let noExam = false;

  try {
    const settingsData = await airtableRequest(
      'Settings',
      `?filterByFormula=${encodeURIComponent(`{Setting Name}='exam_season_override'`)}&maxRecords=1`
    ).catch(() => ({ records: [] }));
    let forceOn: import('@/lib/exam-season').ExamType | null = null;
    try {
      const v = JSON.parse(settingsData.records?.[0]?.fields?.['Value'] || '{}');
      if (['WA1', 'WA2', 'WA3', 'EOY'].includes(v.forceOn)) forceOn = v.forceOn;
    } catch {}
    examType = resolveActiveExamType(forceOn);

    if (examType && studentId) {
      const examsData = await airtableRequestAll(
        'Exams',
        `?filterByFormula=${encodeURIComponent(
          `AND({Exam Type}='${examType}',FIND('${studentId}',ARRAYJOIN({Student}))>0)`
        )}&fields[]=Exam Date&fields[]=Tested Topics&fields[]=No Exam&maxRecords=5`
      );
      if (examsData.records.length > 0) {
        const r = examsData.records[0];
        noExam = r.fields['No Exam'] === true;
        examDate = r.fields['Exam Date'] ?? null;
        examTopics = r.fields['Tested Topics'] ?? null;
      }
    }
  } catch (err) {
    console.error('[lesson-context] exam fetch failed:', err);
  }

  return NextResponse.json({
    current,
    prev,
    studentLevel,
    examType,
    examDate,
    examTopics,
    noExam,
    isEditable,
    isFuture,
  });
}
