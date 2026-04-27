import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { resolveActiveExamType, ExamType } from '@/lib/exam-season';

export const runtime = 'nodejs';

function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const fetchAll = (table: string, query: string) =>
  airtableRequestAll(table, query).then(r => r.records);

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week') || isoDate(new Date());
  const monday = getMondayOfWeek(weekParam);
  const sunday = addDays(monday, 6);
  const weekStart = isoDate(monday);
  const weekEnd = isoDate(sunday);

  // Use exclusive upper bound (+1 day) because Airtable coerces Date to
  // datetime midnight, so <= '2026-04-26' stops before the day's lessons.
  const weekEndExclusive = isoDate(addDays(sunday, 1));
  // Lessons tab shows all lessons for the week except voided ones:
  // - Includes Status='Rescheduled' (shown as faded chip on past days with a "→ date" indicator)
  // - Excludes Status='Cancelled' (lesson cancelled, no longer happening)
  // - Includes Status='Absent' — shown as dimmed chips so past slots stay visible
  const lessonsFilter = `AND({Date}>='${weekStart}',{Date}<'${weekEndExclusive}',{Status}!='Cancelled')`;

  // Fetch slots, enrollments, and lessons in parallel
  const [slotsData, enrollmentsData, lessonsData] = await Promise.all([
    fetchAll('Slots', `?filterByFormula=${encodeURIComponent(`{Is Active}=1`)}`),
    fetchAll('Enrollments', `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot`),
    fetchAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(lessonsFilter)}&sort[0][field]=Date&sort[0][direction]=asc&fields[]=Date&fields[]=Slot&fields[]=Student&fields[]=Type&fields[]=Status&fields[]=Notes&fields[]=Rescheduled Lesson ID&fields[]=Progress Logged`
    ),
  ]);

  // Collect rescheduled-lesson IDs so we can look up the new lesson's date
  const rescheduledNewIds = lessonsData
    .filter((r: any) => r.fields['Status'] === 'Rescheduled')
    .map((r: any) => r.fields['Rescheduled Lesson ID']?.[0])
    .filter(Boolean) as string[];

  // Fetch dates for the new (rescheduled-to) lessons, if any
  let rescheduledDatesById: Record<string, string> = {};
  if (rescheduledNewIds.length) {
    const formula = `OR(${rescheduledNewIds.map(id => `RECORD_ID()='${id}'`).join(',')})`;
    const newLessons = await fetchAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Date`
    );
    rescheduledDatesById = Object.fromEntries(
      newLessons.map((r: any) => [r.id, r.fields['Date'] ?? ''])
    );
  }

  // Collect all unique student IDs (from both enrollments and lessons)
  const studentIds = [
    ...new Set([
      ...enrollmentsData.map((r: any) => r.fields['Student']?.[0]),
      ...lessonsData.map((r: any) => r.fields['Student']?.[0]),
    ].filter(Boolean)),
  ] as string[];

  let studentsById: Record<string, any> = {};
  if (studentIds.length) {
    const formula = `OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
    const studentsData = await fetchAll(
      'Students',
      `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student Name`
    );
    studentsById = Object.fromEntries(
      studentsData.map((r: any) => [
        r.id,
        { name: r.fields['Student Name'] || '' },
      ])
    );
  }

  // Normalize day name to full English name regardless of Airtable storage format
  // (handles abbreviated "Sun", numeric-prefix "7 Sunday", plain "Sunday", etc.)
  const DAY_NORMALIZE: Record<string, string> = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
    friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  };

  // Parse slots
  const slots = slotsData.map((r: any) => {
    const dayRaw: string = r.fields['Day'] || '';
    const match = dayRaw.match(/^(\d+)\s+(.+)/);
    const dayNum = match ? parseInt(match[1]) : 9;
    const rawName = (match ? match[2].trim() : dayRaw.trim()).toLowerCase();
    const dayName = DAY_NORMALIZE[rawName] || (match ? match[2].trim() : dayRaw.trim());
    return {
      id: r.id,
      dayRaw,
      dayNum,
      dayName,
      time: r.fields['Time'] || '',
      level: r.fields['Level'] || '',
      capacity: r.fields['Normal Capacity'] || 0,
      enrolledCount: r.fields['Enrolled Count'] || 0,
    };
  });

  // enrollmentsBySlot: slotId → studentId[]
  const enrollmentsBySlot: Record<string, string[]> = {};
  for (const r of enrollmentsData) {
    const slotId = r.fields['Slot']?.[0];
    const studentId = r.fields['Student']?.[0];
    if (!slotId || !studentId) continue;
    if (!enrollmentsBySlot[slotId]) enrollmentsBySlot[slotId] = [];
    enrollmentsBySlot[slotId].push(studentId);
  }

  function isTimeRelatedNote(note: string): boolean {
    return /\d{1,2}[:.]\d{2}|(?:early|late|delay|arriv|leav|start|end|finish|cancel|\d+\s*(?:min|hr|hour)|half[\s-]?hour)/i.test(note);
  }

  const lessons = lessonsData.map((r: any) => {
    const rawNote: string = r.fields['Notes'] || '';
    const type: string = r.fields['Type'] || 'Regular';
    // Trial lessons store the student name in Notes — preserve the full value.
    // For other types, only surface timing-related notes (truncated to 80 chars).
    const filteredNote = type === 'Trial' || isTimeRelatedNote(rawNote) ? rawNote.slice(0, 80) : '';
    const rescheduledNewId = r.fields['Rescheduled Lesson ID']?.[0] ?? null;
    return {
      id: r.id,
      date: r.fields['Date'] || '',
      slotId: r.fields['Slot']?.[0] || null,
      studentId: r.fields['Student']?.[0] || null,
      type,
      status: r.fields['Status'] || '',
      notes: filteredNote,
      rescheduledToDate: rescheduledNewId ? (rescheduledDatesById[rescheduledNewId] ?? '') : '',
      progressLogged: r.fields['Progress Logged'] === true,
    };
  });

  // ── Exam season + exam dates ──────────────────────────────────────────────
  let activeExamType: ExamType | null = null;
  const examsByStudent: Record<string, string | null> = {};

  try {
    // Resolve active exam type (override from Settings, fallback to date windows)
    const settingsData = await airtableRequest(
      'Settings',
      `?filterByFormula=${encodeURIComponent(`{Setting Name}='exam_season_override'`)}&maxRecords=1`
    ).catch(() => ({ records: [] }));
    let forceOn: ExamType | null = null;
    try {
      const v = JSON.parse(settingsData.records?.[0]?.fields?.['Value'] || '{}');
      if (['WA1', 'WA2', 'WA3', 'EOY'].includes(v.forceOn)) forceOn = v.forceOn as ExamType;
    } catch {}
    activeExamType = resolveActiveExamType(forceOn);

    // Fetch all exam dates for the active season — no studentIds filter needed;
    // the page only looks up students that actually appear in lessons.
    if (activeExamType) {
      const examsData = await fetchAll(
        'Exams',
        `?filterByFormula=${encodeURIComponent(`{Exam Type}='${activeExamType}'`)}&fields[]=Student&fields[]=Exam Date&fields[]=No Exam`
      );
      // Build studentId → earliest exam date, or 'NO_EXAM' sentinel
      for (const r of examsData) {
        const sid: string | undefined = r.fields['Student']?.[0];
        if (!sid) continue;
        const noExam: boolean = r.fields['No Exam'] === true;
        if (noExam) {
          examsByStudent[sid] = 'NO_EXAM'; // takes precedence over any date
          continue;
        }
        if (examsByStudent[sid] === 'NO_EXAM') continue; // already flagged
        const examDate: string | undefined = r.fields['Exam Date'];
        if (!examDate) continue;
        if (!examsByStudent[sid] || examDate < examsByStudent[sid]!) {
          examsByStudent[sid] = examDate;
        }
      }
    }
  } catch (err) {
    console.error('[admin-schedule] exam fetch failed:', err);
  }

  return NextResponse.json({
    weekStart,
    weekEnd,
    slots,
    enrollmentsBySlot,
    lessons,
    students: studentsById,
    activeExamType,
    examsByStudent,
  });
}
