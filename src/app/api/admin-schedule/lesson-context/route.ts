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
    nextLessonPlan: lesson.fields['Next Lesson Plan'] ?? '',
    progressLogged: lesson.fields['Progress Logged'] ?? false,
  };

  // Fetch previous lesson for this student (most recent before this date).
  // `nextLessonPlan` here is the one that matters in the room: what Adrian
  // decided LAST time this student should start on today.
  let prev: {
    id: string;
    date: string;
    topicsCovered: string;
    homeworkAssigned: string;
    homeworkReturned: string;
    nextLessonPlan: string;
  } | null = null;

  let studentLevel = '';
  let studentSubjects: string[] = [];

  if (studentId) {
    // NOTE: ARRAYJOIN({Student}) returns display names not record IDs, so we
    // filter by date/status in Airtable and match student in JS.
    const prevQuery = (extraFields: string) =>
      airtableRequestAll(
        'Lessons',
        `?filterByFormula=${encodeURIComponent(
          `AND({Date}<'${lessonDate}',{Status}!='Absent',{Status}!='Cancelled',{Status}!='Rescheduled')`
        )}&sort[0][field]=Date&sort[0][direction]=desc` +
        `&fields[]=Date&fields[]=Student&fields[]=Topics Covered&fields[]=Homework Assigned&fields[]=Homework Returned` +
        extraFields
      );

    const [prevLessons, studentData] = await Promise.all([
      // fields[] 422s on a field the base doesn't have — retry without the
      // optional one rather than take the whole modal down with it.
      prevQuery('&fields[]=Next Lesson Plan').catch(err => {
        if (!String(err?.message ?? '').includes('UNKNOWN_FIELD_NAME')) throw err;
        return prevQuery('');
      }),
      airtableRequest('Students', `/${studentId}`).catch(() => ({ fields: {} })),
    ]);

    // Find the most recent lesson for this specific student
    const prevRecord = prevLessons.records.find(
      (r: any) => r.fields['Student']?.[0] === studentId
    );
    if (prevRecord) {
      const r = prevRecord;
      prev = {
        id: r.id,
        date: r.fields['Date'] ?? '',
        topicsCovered: r.fields['Topics Covered'] ?? '',
        homeworkAssigned: r.fields['Homework Assigned'] ?? '',
        homeworkReturned: r.fields['Homework Returned'] ?? '',
        nextLessonPlan: r.fields['Next Lesson Plan'] ?? '',
      };
    }

    studentLevel = (studentData as any).fields?.['Level'] ?? '';
    // Subjects is a multi-select array, e.g. ['E Math', 'A Math']
    studentSubjects = (studentData as any).fields?.['Subjects'] ?? [];
  }

  // Fetch active exam type + all exam records for this student (grouped by subject)
  let examType: string | null = null;
  const examsBySubject: Record<string, { examDate: string | null; examTopics: string | null; noExam: boolean; notes: string | null; score: number | null; total: number | null } | null> = {};

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
      // Filter by Exam Type only; match student in JS (ARRAYJOIN returns names, not IDs)
      const examsData = await airtableRequestAll(
        'Exams',
        `?filterByFormula=${encodeURIComponent(
          `{Exam Type}='${examType}'`
        )}&fields[]=Student&fields[]=Exam Date&fields[]=Tested Topics&fields[]=No Exam&fields[]=Subject&fields[]=Exam Notes&fields[]=Result Score&fields[]=Result Total`
      );
      // Group by subject — filter to this student in JS, then key by subject
      for (const r of examsData.records) {
        if (r.fields['Student']?.[0] !== studentId) continue;
        const subject: string = r.fields['Subject'] ?? '';
        examsBySubject[subject] = {
          examDate: r.fields['Exam Date'] ?? null,
          examTopics: r.fields['Tested Topics'] ?? null,
          noExam: r.fields['No Exam'] === true,
          notes: r.fields['Exam Notes'] ?? null,
          score: r.fields['Result Score'] ?? null,
          total: r.fields['Result Total'] ?? null,
        };
      }
    }
  } catch (err) {
    console.error('[lesson-context] exam fetch failed:', err);
  }

  return NextResponse.json({
    current,
    prev,
    studentLevel,
    studentSubjects,
    examType,
    examsBySubject,
    isEditable,
    isFuture,
  });
}
