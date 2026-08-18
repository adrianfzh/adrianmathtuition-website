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
import { computePerMonthPayments } from '@/lib/invoice-payments';
import { resolveRescheduleChain, ChainLesson } from '@/lib/reschedule-chain';
import { SLOT_WINDOWS_SETTING, parseSlotWindows } from '@/lib/slot-windows';

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
  const [slotsData, enrollData, windowsData] = await Promise.all([
    airtableRequestAll('Slots', `?fields[]=Day&fields[]=Time&fields[]=Level&fields[]=Is Active`),
    airtableRequestAll('Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot&fields[]=Rate Per Lesson&fields[]=Rate Type`),
    airtableRequest('Settings',
      `?filterByFormula=${encodeURIComponent(`{Setting Name}='${SLOT_WINDOWS_SETTING}'`)}&maxRecords=1`).catch(() => null),
  ]);
  // Dated (ad-hoc) slots run on specific dates only. They belong in the one-off
  // reschedule picker — on their own dates — and never in the weekly-enrollment
  // pickers, which is what `dated` lets the page decide per surface.
  const slotWindows = parseSlotWindows(windowsData?.records?.[0]?.fields?.['Value'] ?? null);
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
    `?filterByFormula=${encodeURIComponent(`{Date}>='${windowStart}'`)}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Notes&fields[]=Rescheduled Lesson ID&fields[]=Is Revision Makeup&fields[]=Mastery&fields[]=Topics Covered&fields[]=Topics Free Text&fields[]=Homework Returned&fields[]=Progress Logged&fields[]=Mood&sort[0][field]=Date&sort[0][direction]=asc`);
  const mine = lessonsData.records.filter((r: any) => r.fields['Student']?.[0] === id);

  // A makeup lesson = a reschedule destination OR a revision makeup. Computed up
  // front so both the upcoming list and the attendance rows can flag/label them.
  const destinationIds = new Set<string>();
  const origByDest: Record<string, any> = {};
  for (const r of mine) for (const did of (r.fields['Rescheduled Lesson ID'] || [])) { destinationIds.add(did); origByDest[did] = r; }
  const isMakeup = (r: any) => destinationIds.has(r.id) || r.fields['Is Revision Makeup'] === true;

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
        isMakeup: isMakeup(r),
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
  // Same records, in the shape the shared chain-walker expects.
  const chainById: Record<string, ChainLesson> = Object.fromEntries(mine.map((r: any) => [r.id, {
    id: r.id,
    date: r.fields['Date'] || '',
    status: r.fields['Status'] || '',
    slotId: r.fields['Slot']?.[0] ?? null,
    rescheduledToId: r.fields['Rescheduled Lesson ID']?.[0] ?? null,
  }]));
  // (destinationIds / origByDest / isMakeup computed above, before `upcoming`.)
  // Strip covers history through the END of the current month, so the current
  // month always shows its full set (incl. not-yet-happened lessons as grey boxes).
  const endOfMonth = (() => { const d = new Date(today + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); })();

  // Main lessons (regular / additional / revision sprint), attributed to ORIGINAL
  // date/month, carrying the reschedule chain's final outcome. Pending makeups keep
  // the original (past) date so they show as a blue box now, not vanish into the future.
  const attendance = mine
    .filter((r: any) => !isMakeup(r) && r.fields['Type'] !== 'Trial' && (r.fields['Date'] || '') <= endOfMonth)
    .map((r: any) => {
      // Chain walk lives in lib/reschedule-chain.ts — this used to be a second
      // inline copy of it, and the schedule chip had a THIRD that only read one
      // hop (so a twice-moved lesson read as pending there while reading
      // correctly here). One implementation, one set of tests.
      const chain = resolveRescheduleChain(r.id, chainById, today);
      const cur = (chain.finalId && byId[chain.finalId]) || r;
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
        notes: (r.fields['Notes'] || '') as string,             // cancellation reason etc.
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

  // Most recent past Completed lesson + its Mastery — for the profile summary strip.
  // Exam data is served by /api/admin/exams (richer, editable) — not duplicated here.
  const lastLesson = (() => {
    const done = mine
      .filter((r: any) => r.fields['Status'] === 'Completed' && (r.fields['Date'] || '') <= today)
      .sort((a: any, b: any) => (b.fields['Date'] || '').localeCompare(a.fields['Date'] || ''));
    const r = done[0];
    return r ? { date: r.fields['Date'] || '', mastery: (r.fields['Mastery'] || '') as string } : null;
  })();

  // ── Progress (Phase 3) — 90-day aggregates + recent logged lessons ─────────
  // Computed from the same window fetch (no extra Airtable call). Attendance
  // counts each delivered/missed occurrence once: reschedule DESTINATION records
  // carry the Completed/Absent outcome, source records sit at 'Rescheduled' and
  // are excluded. Homework Returned is per lesson record (Yes/Partial/No).
  const progress = (() => {
    const d90 = (() => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
    const past90 = mine.filter((r: any) => { const dt = r.fields['Date'] || ''; return dt >= d90 && dt <= today; });
    let attended = 0, missed = 0;
    const homework = { yes: 0, partial: 0, no: 0 };
    const mastery = { strong: 0, ok: 0, slow: 0 };
    for (const r of past90) {
      const st = r.fields['Status'] || '';
      if (st === 'Completed') attended++; else if (st === 'Absent') missed++;
      const hw = (r.fields['Homework Returned'] || '').toString().toLowerCase();
      if (hw === 'yes') homework.yes++; else if (hw === 'partial') homework.partial++; else if (hw === 'no') homework.no++;
      const m = (r.fields['Mastery'] || '').toString();
      if (m === 'Strong') mastery.strong++; else if (m === 'OK') mastery.ok++; else if (m === 'Slow') mastery.slow++;
    }
    const hwTotal = homework.yes + homework.partial + homework.no;
    // Topics Covered is a JSON array of canonical names; Topics Free Text a plain string.
    const topicsOf = (r: any): string => {
      const raw = (r.fields['Topics Covered'] || '').toString();
      let t: string[] = [];
      if (raw) { try { const j = JSON.parse(raw); t = Array.isArray(j) ? j.map(String) : [raw]; } catch { t = [raw]; } }
      const free = (r.fields['Topics Free Text'] || '').toString().trim();
      if (free) t.push(free);
      return t.join(', ');
    };
    const recent = mine
      .filter((r: any) => (r.fields['Date'] || '') <= today && (r.fields['Status'] === 'Completed' || r.fields['Progress Logged'] === true))
      .sort((a: any, b: any) => (b.fields['Date'] || '').localeCompare(a.fields['Date'] || ''))
      .slice(0, 12)
      .map((r: any) => ({
        id: r.id,
        date: r.fields['Date'] || '',
        type: r.fields['Type'] || 'Regular',
        slotId: r.fields['Slot']?.[0] || null,
        mastery: (r.fields['Mastery'] || '') as string,
        mood: (r.fields['Mood'] || '') as string,
        topics: topicsOf(r),
        progressLogged: r.fields['Progress Logged'] === true,
      }));
    return {
      attendancePct: attended + missed ? Math.round((attended / (attended + missed)) * 100) : null,
      attended,
      due: attended + missed,
      homeworkPct: hwTotal ? Math.round((homework.yes / hwTotal) * 100) : null,
      homework,
      mastery,
      recent,
    };
  })();

  // Invoices for this student — match in JS. `Line Items Extra` is needed to
  // strip the carry-forward lump when computing the true per-month breakdown.
  const invData = await airtableRequestAll('Invoices',
    `?fields[]=Student&fields[]=Month&fields[]=Final Amount&fields[]=Status&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Invoice Type&fields[]=PDF URL&fields[]=Line Items Extra&sort[0][field]=Month&sort[0][direction]=desc`);
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

  // True per-month payment breakdown (own-month charge + oldest-first payment
  // allocation) — correct regardless of the carry-forward lump mess.
  const payments = computePerMonthPayments(
    studentInvoices.map((r: any) => ({
      id: r.id,
      month: r.fields['Month'] || '',
      finalAmount: r.fields['Final Amount'] ?? null,
      amountPaid: r.fields['Amount Paid'] ?? null,
      isPaid: r.fields['Is Paid'] === true,
      status: r.fields['Status'] || '',
      invoiceType: r.fields['Invoice Type'] || 'Regular',
      lineItemsExtra: r.fields['Line Items Extra'] || '',
      pdfUrl: r.fields['PDF URL'] || '',
    })),
  );

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
    .map((r: any) => ({
      id: r.id,
      label: slotLabel(r.fields),
      level: r.fields['Level'] || '',
      dated: Boolean(slotWindows[r.id]),
      window: slotWindows[r.id] ?? null,
    }))
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
    lastLesson,
    progress,
    invoices,
    payments,
    sentInvoices,
    slots,
  });
}
