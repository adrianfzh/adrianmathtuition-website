import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

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

  // Fetch slots, enrollments, and lessons in parallel
  const [slotsData, enrollmentsData, lessonsData] = await Promise.all([
    fetchAll('Slots', `?filterByFormula=${encodeURIComponent(`{Is Active}=1`)}`),
    fetchAll('Enrollments', `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot`),
    fetchAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(`AND({Date}>='${weekStart}',{Date}<='${weekEnd}')`)}&sort[0][field]=Date&sort[0][direction]=asc`
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
      `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student Name&fields[]=Parent Name&fields[]=Parent Email`
    );
    studentsById = Object.fromEntries(
      studentsData.map((r: any) => [
        r.id,
        {
          name: r.fields['Student Name'] || '',
          parentName: r.fields['Parent Name'] || '',
          parentEmail: r.fields['Parent Email'] || '',
        },
      ])
    );
  }

  // Parse slots
  const slots = slotsData.map((r: any) => {
    const dayRaw: string = r.fields['Day'] || '';
    const match = dayRaw.match(/^(\d+)\s+(.+)/);
    const dayNum = match ? parseInt(match[1]) : 9;
    const dayName = match ? match[2].trim() : dayRaw.trim();
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

  const lessons = lessonsData.map((r: any) => ({
    id: r.id,
    date: r.fields['Date'] || '',
    slotId: r.fields['Slot']?.[0] || null,
    studentId: r.fields['Student']?.[0] || null,
    type: r.fields['Type'] || 'Regular',
    status: r.fields['Status'] || '',
    notes: r.fields['Notes'] || '',
  }));

  return NextResponse.json({
    weekStart,
    weekEnd,
    slots,
    enrollmentsBySlot,
    lessons,
    students: studentsById,
  });
}
