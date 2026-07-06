import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

const PER_PAGE = 25;

// GET /api/admin/attendance?search=name        → student search results
// GET /api/admin/attendance?studentId=recXXX&page=1 → attendance records
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const studentId = searchParams.get('studentId');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));

  // ── Student search ──────────────────────────────────────────────────────────
  if (search) {
    const formula = encodeURIComponent(`SEARCH(LOWER('${search.replace(/'/g, "\\'")}'),LOWER({Student Name}))`);
    const data = await airtableRequest('Students',
      `?filterByFormula=${formula}&fields[]=Student Name&fields[]=Level&maxRecords=10`
    );
    return NextResponse.json({
      students: (data.records || []).map((r: any) => ({
        id: r.id,
        name: r.fields['Student Name'] || '',
        level: r.fields['Level'] || '',
      })),
    });
  }

  // ── Attendance records ──────────────────────────────────────────────────────
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  // Fetch student info
  const student = await airtableRequest('Students', `/${studentId}`).catch(() => null);
  const studentName: string = student?.fields?.['Student Name'] || '';
  const studentLevel: string = student?.fields?.['Level'] || '';

  // Fetch ALL lessons for this student (sorted desc) — filter by student in JS
  // (ARRAYJOIN on linked records returns names not IDs per the Airtable gotcha)
  const allData = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(`{Status}!='Cancelled'`)}&sort[0][field]=Date&sort[0][direction]=desc` +
    `&fields[]=Date&fields[]=Status&fields[]=Type&fields[]=Slot&fields[]=Student&fields[]=Notes&fields[]=Lesson Notes&fields[]=Topics Covered&fields[]=Mastery&fields[]=Mood&fields[]=Progress Logged`
  );

  const studentLessons = allData.records.filter(
    (r: any) => r.fields['Student']?.[0] === studentId
  );

  const total = studentLessons.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const pageRecords = studentLessons.slice(start, start + PER_PAGE);

  // Resolve slot times for this page
  const slotIds = [...new Set(pageRecords.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean))] as string[];
  const slotsById: Record<string, string> = {};
  if (slotIds.length) {
    const formula = encodeURIComponent(`OR(${slotIds.map(id => `RECORD_ID()='${id}'`).join(',')})`);
    const sData = await airtableRequest('Slots', `?filterByFormula=${formula}&fields[]=Time&fields[]=Day`);
    for (const s of (sData.records || [])) {
      const dayRaw = (s.fields['Day'] || '').replace(/^\d+\s+/, '').trim();
      slotsById[s.id] = `${dayRaw} ${s.fields['Time'] || ''}`.trim();
    }
  }

  // Attendance stats (all lessons, not just this page)
  const completed = studentLessons.filter((r: any) => r.fields['Status'] === 'Completed').length;
  const absent    = studentLessons.filter((r: any) => r.fields['Status'] === 'Absent').length;
  const attended  = completed; // only Completed counts as attended

  const lessons = pageRecords.map((r: any) => ({
    id: r.id,
    date: r.fields['Date'] || '',
    status: r.fields['Status'] || '',
    type: r.fields['Type'] || '',
    slotLabel: slotsById[r.fields['Slot']?.[0]] || '',
    notes: r.fields['Notes'] || '',
    lessonNotes: r.fields['Lesson Notes'] || '',
    topicsCovered: r.fields['Topics Covered'] || '',
    mastery: r.fields['Mastery'] || '',
    mood: r.fields['Mood'] || '',
    progressLogged: r.fields['Progress Logged'] === true,
  }));

  return NextResponse.json({
    studentName,
    studentLevel,
    total,
    totalPages,
    page: safePage,
    perPage: PER_PAGE,
    stats: { total, completed, absent, attended },
    lessons,
  });
}
