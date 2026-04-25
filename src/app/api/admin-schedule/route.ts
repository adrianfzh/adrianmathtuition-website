import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { resolveActiveExamType, ExamType } from '@/lib/exam-season';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  return req.headers.get('authorization') === `Bearer ${adminPassword}`;
}

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

async function fetchAll(table: string, query: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const sep = query.includes('?') ? '&' : '?';
    const url = `${query}${offset ? `${sep}offset=${offset}` : ''}`;
    const data = await airtableRequest(table, url);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
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
  // Lessons tab shows only lessons that will actually take place:
  // - Excludes Status='Rescheduled' (original lesson moved away; the new date has its own Scheduled record)
  // - Excludes Status='Cancelled' (lesson cancelled, no longer happening)
  // - Excludes Status='Absent' (student missed it; makeup tracking via bot /allreschedules)
  const lessonsFilter = `AND({Date}>='${weekStart}',{Date}<'${weekEndExclusive}',{Status}!='Rescheduled',{Status}!='Cancelled',{Status}!='Absent')`;

  // Fetch slots, enrollments, and lessons in parallel
  const [slotsData, enrollmentsData, lessonsData] = await Promise.all([
    fetchAll('Slots', `?filterByFormula=${encodeURIComponent(`{Is Active}=1`)}`),
    fetchAll('Enrollments', `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot`),
    fetchAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(lessonsFilter)}&sort[0][field]=Date&sort[0][direction]=asc&fields[]=Date&fields[]=Slot&fields[]=Student&fields[]=Type&fields[]=Status&fields[]=Notes`
    ),
  ]);

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
    return {
      id: r.id,
      date: r.fields['Date'] || '',
      slotId: r.fields['Slot']?.[0] || null,
      studentId: r.fields['Student']?.[0] || null,
      type,
      status: r.fields['Status'] || '',
      notes: filteredNote,
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
