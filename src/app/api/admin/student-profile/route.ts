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
  // Fetch a window (past 6 months → all future) so attendance history + upcoming
  // both come from one query, and reschedule destinations are included.
  const windowStart = (() => { const d = new Date(today + 'T00:00:00'); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })();
  const lessonsData = await airtableRequestAll('Lessons',
    `?filterByFormula=${encodeURIComponent(`{Date}>='${windowStart}'`)}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Notes&fields[]=Rescheduled Lesson ID&fields[]=Is Revision Makeup&sort[0][field]=Date&sort[0][direction]=asc`);
  const mine = lessonsData.records.filter((r: any) => r.fields['Student']?.[0] === id);

  const upcoming = mine
    .filter((r: any) => (r.fields['Date'] || '') >= today && r.fields['Status'] !== 'Cancelled' && r.fields['Status'] !== 'Rescheduled')
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

  // ── Attendance (merged reschedules) ──────────────────────────────────────────
  // Each row = one logical lesson, attributed to its ORIGINAL date/month. A
  // rescheduled lesson is shown once (under its original date) with the final
  // destination date + the final outcome status — so a May lesson moved to June
  // stays under May, not June.
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthLabel = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${MONTHS[+p[1] - 1]} ${p[0]}` : 'Unknown'; };
  const byId: Record<string, any> = Object.fromEntries(mine.map((r: any) => [r.id, r]));
  // Makeup lessons = reschedule destinations OR revision makeups. They live in the
  // faded second row; the lesson they cover (origByDest) is shown in the main row.
  const destinationIds = new Set<string>();
  const origByDest: Record<string, any> = {};
  for (const r of mine) for (const did of (r.fields['Rescheduled Lesson ID'] || [])) { destinationIds.add(did); origByDest[did] = r; }
  const isMakeup = (r: any) => destinationIds.has(r.id) || r.fields['Is Revision Makeup'] === true;
  // Strip covers history through the END of the current month, so the current
  // month always shows its full set (incl. not-yet-happened lessons as grey boxes).
  const endOfMonth = (() => { const d = new Date(today + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); })();

  // Main lessons (regular / additional / revision sprint), attributed to ORIGINAL
  // date/month, carrying the reschedule chain's final outcome. Pending makeups keep
  // the original (past) date so they show as a blue box now, not vanish into the future.
  const attendance = mine
    .filter((r: any) => !isMakeup(r) && r.fields['Type'] !== 'Trial' && (r.fields['Date'] || '') <= endOfMonth)
    .map((r: any) => {
      let cur = r, guard = 0;
      while (cur.fields['Status'] === 'Rescheduled' && cur.fields['Rescheduled Lesson ID']?.[0] && byId[cur.fields['Rescheduled Lesson ID'][0]] && guard < 12) {
        cur = byId[cur.fields['Rescheduled Lesson ID'][0]]; guard++;
      }
      const moved = cur.id !== r.id;
      const slotId = r.fields['Slot']?.[0] || null;
      const sf = slotId ? slotById[slotId] : null;
      return {
        id: r.id,
        outcomeLessonId: cur.id,                                // the lesson whose Status to PATCH when marking
        date: r.fields['Date'] || '',
        monthLabel: monthLabel(r.fields['Date'] || ''),
        type: r.fields['Type'] || 'Regular',
        status: cur.fields['Status'] || 'Scheduled',            // final outcome
        rescheduledToDate: moved ? (cur.fields['Date'] || '') : '',
        slotLabel: sf ? slotLabel(sf) : (r.fields['Type'] === 'Revision Sprint' ? 'Revision' : ''),
      };
    })
    .sort((a: any, b: any) => b.date.localeCompare(a.date));     // newest first

  // Makeup lessons (faded second row), placed in the month they're scheduled for.
  const makeups = mine
    .filter((r: any) => isMakeup(r) && (r.fields['Date'] || '') <= endOfMonth)
    .map((r: any) => {
      const slotId = r.fields['Slot']?.[0] || null;
      const sf = slotId ? slotById[slotId] : null;
      const orig = origByDest[r.id];
      return {
        id: r.id,
        date: r.fields['Date'] || '',
        monthLabel: monthLabel(r.fields['Date'] || ''),
        status: r.fields['Status'] || 'Scheduled',
        slotLabel: sf ? slotLabel(sf) : 'Makeup',
        makeupForDate: orig ? (orig.fields['Date'] || '') : '',
        isRevision: r.fields['Is Revision Makeup'] === true,
      };
    })
    .sort((a: any, b: any) => b.date.localeCompare(a.date));

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

  // Invoices for this student — match in JS
  const invData = await airtableRequestAll('Invoices',
    `?fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Status&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Invoice Type&fields[]=PDF URL&sort[0][field]=Month&sort[0][direction]=desc`);
  const studentInvoices = invData.records.filter((r: any) => r.fields['Student']?.[0] === id);
  const studentInvoiceIds = new Set(studentInvoices.map((r: any) => r.id));
  const invoices = studentInvoices
    .slice(0, 24)
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

  // Every invoice PDF actually emailed to this student (from EmailLog archive).
  // Match EmailLog rows whose Related Invoice belongs to this student and which
  // carry a PDF URL — that's the exact PDF that was sent.
  let sentInvoices: any[] = [];
  try {
    const logs = await airtableRequestAll('EmailLog',
      `?filterByFormula=${encodeURIComponent(`NOT({PDF URL}='')`)}&fields[]=Related Invoice&fields[]=Subject&fields[]=Sent At&fields[]=To Email&fields[]=Status&fields[]=PDF URL&sort[0][field]=Sent At&sort[0][direction]=desc`);
    sentInvoices = (logs.records || [])
      .filter((r: any) => studentInvoiceIds.has(r.fields['Related Invoice']?.[0]))
      .map((r: any) => ({
        id: r.id,
        subject: r.fields['Subject'] || '',
        sentAt: r.fields['Sent At'] || '',
        toEmail: r.fields['To Email'] || '',
        status: r.fields['Status'] || '',
        pdfUrl: r.fields['PDF URL'] || '',
      }));
  } catch { /* EmailLog optional */ }

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
    attendance,
    makeups,
    exams,
    invoices,
    sentInvoices,
    slots,
  });
}
