// GET /api/admin/student-profile?id=recXXX
// Aggregates everything the /admin/students/[id] profile page needs in one call:
//   - student header (name, level, subjects, status)
//   - active enrollments (slot label + rate)
//   - upcoming lessons (from today, next ~12)
//   - exams (active-season relevant)
//   - recent invoices (last ~6)
// Contact info is NOT returned here (privacy) — lazy-loaded via student-contact.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

function slotLabel(f: any): string {
  const day = (f?.['Day'] || '').toString().replace(/^\d+\s+/, '').trim();
  return `${day} ${f?.['Time'] || ''}`.trim();
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Student record
  const stu = await airtableRequest('Students', `/${id}`).catch(() => null);
  if (!stu) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const f = stu.fields;

  // Active slots (for labels) — and the student's active enrollments
  const [slotsData, enrollData] = await Promise.all([
    airtableRequestAll('Slots', `?fields[]=Day&fields[]=Time&fields[]=Level&fields[]=Is Active`),
    airtableRequestAll('Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot&fields[]=Rate Per Lesson&fields[]=Rate Type`),
  ]);
  const slotById: Record<string, any> = Object.fromEntries(slotsData.records.map((r: any) => [r.id, r.fields]));

  const enrollments = enrollData.records
    .filter((r: any) => r.fields['Student']?.[0] === id)
    .map((r: any) => {
      const slotId = r.fields['Slot']?.[0] || null;
      const sf = slotId ? slotById[slotId] : null;
      return {
        enrollmentId: r.id,
        slotId,
        slotLabel: sf ? slotLabel(sf) : '(unknown slot)',
        slotLevel: sf?.['Level'] || '',
        ratePerLesson: r.fields['Rate Per Lesson'] ?? null,
        rateType: r.fields['Rate Type'] || '',
      };
    });

  // Upcoming lessons (from today) — filter by date in Airtable, match student in JS
  const today = localToday();
  const lessonsData = await airtableRequestAll('Lessons',
    `?filterByFormula=${encodeURIComponent(`{Date}>='${today}'`)}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Notes&sort[0][field]=Date&sort[0][direction]=asc`);
  const upcoming = lessonsData.records
    .filter((r: any) => r.fields['Student']?.[0] === id && r.fields['Status'] !== 'Cancelled')
    .slice(0, 12)
    .map((r: any) => {
      const slotId = r.fields['Slot']?.[0] || null;
      const sf = slotId ? slotById[slotId] : null;
      return {
        id: r.id,
        date: r.fields['Date'] || '',
        slotId,
        slotLabel: sf ? slotLabel(sf) : (r.fields['Type'] === 'Revision Sprint' ? 'Revision Sprint' : ''),
        type: r.fields['Type'] || 'Regular',
        status: r.fields['Status'] || 'Scheduled',
      };
    });

  // Exams for this student
  const examsData = await airtableRequestAll('Exams',
    `?fields[]=Student&fields[]=Exam Type&fields[]=Exam Date&fields[]=Tested Topics&fields[]=No Exam`);
  const exams = examsData.records
    .filter((r: any) => r.fields['Student']?.[0] === id)
    .map((r: any) => ({
      id: r.id,
      examType: r.fields['Exam Type'] || '',
      examDate: r.fields['Exam Date'] || '',
      testedTopics: r.fields['Tested Topics'] || '',
      noExam: r.fields['No Exam'] === true,
    }));

  // Recent invoices (last ~6 by created/month) — match student in JS
  const invData = await airtableRequestAll('Invoices',
    `?fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Status&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Invoice Type&fields[]=PDF URL&sort[0][field]=Month&sort[0][direction]=desc`);
  const invoices = invData.records
    .filter((r: any) => r.fields['Student']?.[0] === id)
    .slice(0, 6)
    .map((r: any) => ({
      id: r.id,
      month: r.fields['Month'] || '',
      finalAmount: r.fields['Final Amount'] ?? null,
      amountPaid: r.fields['Amount Paid'] ?? null,
      isPaid: r.fields['Is Paid'] === true,
      status: r.fields['Status'] || '',
      invoiceType: r.fields['Invoice Type'] || 'Regular',
      pdfUrl: r.fields['PDF URL'] || '',
    }));

  // Active slot list for the switch/add pickers
  const slots = slotsData.records
    .filter((r: any) => r.fields['Is Active'])
    .map((r: any) => ({ id: r.id, label: slotLabel(r.fields), level: r.fields['Level'] || '' }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label));

  return NextResponse.json({
    student: {
      id,
      name: f['Student Name'] || '',
      level: f['Level'] || '',
      subjects: f['Subjects'] || [],
      subjectLevel: f['Subject Level'] || '',
      status: f['Status'] || '',
      juneRevision: f['June Revision 2026'] || '',
    },
    enrollments,
    upcoming,
    exams,
    invoices,
    slots,
  });
}
