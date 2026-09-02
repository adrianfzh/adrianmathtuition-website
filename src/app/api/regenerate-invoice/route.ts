import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { buildRegisterUrl } from '@/lib/invoice-register-url';
import { NO_LESSON_DATES } from '@/lib/holidays';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { displaySpanMonth, resolveInvoiceIssueDate, sgtTodayISO } from '@/lib/invoice-month';
import { monthWindowClause } from '@/lib/billing-math';
import { applyPriorBalance, stripPersistedCarryOver } from '@/lib/invoice-consolidate';
import {
  arrearsMachineryCovers, billingModeFor, examCutoffFor, invoiceDueDateISO, isCombinedJanuary, monthLabel,
  type StudentBillingProfile,
} from '@/lib/year-end-billing';
import { attendedLessonLines, descriptionBase, projectedLessonLines, sumLineRates, type SlotLine } from '@/lib/arrears-lines';
import { fetchArrearsPool, fetchInvoicedMonthsByStudent } from '@/lib/arrears-fetch';
import { rebuildLineItems, type MonthLesson } from '@/lib/regenerate-line-items';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_ABBREV: Record<string, string> = {
  Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const { recordId } = body;
  if (!recordId) {
    return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
  }

  try {
    // 1. Fetch existing invoice
    const invoice = await at('Invoices', `/${recordId}`);
    const f = invoice.fields;
    const studentId = f['Student']?.[0] as string;
    const month = f['Month'] as string;

    if (!studentId || !month) {
      return NextResponse.json({ error: 'Invoice missing Student or Month' }, { status: 400 });
    }

    // 2. Parse month label to date range
    const [monthName, yearStr] = month.split(' ');
    const monthIdx = MONTH_NAMES.indexOf(monthName);
    const year = parseInt(yearStr, 10);
    if (monthIdx < 0 || isNaN(year)) {
      return NextResponse.json({ error: `Cannot parse month: ${month}` }, { status: 400 });
    }
    const firstDayStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthIdx + 1, 0);
    const lastDayStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    // 3. Fetch student
    const student = await at('Students', `/${studentId}`);
    const studentName = (student.fields['Student Name'] || '') as string;
    const level = (student.fields['Level'] || '') as string;
    const subjectsArr: string[] = Array.isArray(student.fields['Subjects']) ? (student.fields['Subjects'] as string[]) : [];
    const subjects = subjectsArr.join(' & ');
    const profile: StudentBillingProfile = { level, subjects: subjectsArr, subjectLevel: (student.fields['Subject Level'] || '') as string };

    // Year-end rules (lib/year-end-billing.ts) — only for months the machinery
    // covers (Oct 2026 →); older invoices rebuild exactly as they were billed.
    //   combinedJan   : the 1 Jan invoice = December attended + January projected
    //   arrearsRebuild: rebuild from ATTENDED lessons (Completed Regular/Rescheduled)
    //   cutoff        : an exam-year student's lessons stop at the last paper
    const monthNum = monthIdx + 1;
    const combinedJan = monthNum === 1 && isCombinedJanuary(profile, 1) && arrearsMachineryCovers(year - 1, 12);
    const arrearsRebuild = combinedJan || (billingModeFor(profile, monthNum) === 'arrears' && arrearsMachineryCovers(year, monthNum));
    const cutoff = examCutoffFor(profile, year);
    const billYear = combinedJan ? year - 1 : year;
    const billMonth = combinedJan ? 12 : monthNum;
    const billFirstISO = `${billYear}-${String(billMonth).padStart(2, '0')}-01`;

    // 4. Fetch enrollments — can't filter by linked Student field by record ID in Airtable formulas;
    // fetch all and filter by studentId in JS (same pattern as generate-invoices). Enrollments that
    // ENDED during the bill month come too: an arrears rebuild still bills what that slot attended.
    const enrollData = await airtableRequestAll(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent(`OR({Status}='Active',AND({Status}='Ended',{End Date}>='${billFirstISO}'))`)}&fields[]=Student&fields[]=Rate Per Lesson&fields[]=Slot&fields[]=Start Date&fields[]=End Date&fields[]=Status`
    );
    const studentEnrollments = enrollData.records.filter((r: any) => r.fields['Student']?.[0] === studentId);
    const enrollment = studentEnrollments.find((r: any) => r.fields['Status'] === 'Active') ?? studentEnrollments[0];
    const ratePerLesson = (enrollment?.fields['Rate Per Lesson'] as number) || 0;
    const slotId = enrollment?.fields['Slot']?.[0] as string | undefined;
    const enrollStartDate = (enrollment?.fields['Start Date'] as string) || firstDayStr;

    // 5. Resolve slot day label + day index (needed for date-math in first invoice)
    let slotDayLabel = '';
    let slotDayIndex = -1; // 0=Sun … 6=Sat
    const DAY_INDEX: Record<string, number> = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6,
    };
    if (slotId) {
      const slot = await at('Slots', `/${slotId}`);
      const rawDay = (slot.fields['Day'] || '') as string;
      const dayName = rawDay.replace(/^\d+\s+/, '').trim();
      const slotTime = ((slot.fields['Time'] || '') as string).trim();
      const dayAbbrev = DAY_ABBREV[dayName] || dayName;
      slotDayLabel = slotTime ? `${dayAbbrev} ${slotTime}` : dayAbbrev;
      slotDayIndex = DAY_INDEX[dayName] ?? -1;
    }

    // 5b. Every enrollment's slot, for the arrears rebuild (a moved lesson keeps
    // its slot link, so a two-slot student sees the right label and rate).
    const slots: SlotLine[] = [];
    if (arrearsRebuild) {
      for (const enr of studentEnrollments) {
        const sid = (enr.fields['Slot']?.[0] as string | undefined) ?? null;
        const slot = sid ? await at('Slots', `/${sid}`).catch(() => null) : null;
        const dayName = ((slot?.fields['Day'] || '') as string).replace(/^\d+\s+/, '').trim();
        const slotTime = ((slot?.fields['Time'] || '') as string).trim();
        const dayAbbrev = DAY_ABBREV[dayName] || dayName;
        const enrollEnd = (enr.fields['End Date'] as string | undefined)
          || (enr.fields['Status'] === 'Ended' ? lastDayStr : null);
        slots.push({
          slotId: sid,
          dayLabel: slotTime ? `${dayAbbrev} ${slotTime}` : dayAbbrev,
          weekday: slot ? DAY_INDEX[dayName] : undefined,
          rate: (enr.fields['Rate Per Lesson'] as number) || ratePerLesson,
          endISO: enrollEnd,
        });
      }
    }

    // 6. Fetch lessons for this month — can't filter by linked Student field by record ID in Airtable formulas;
    // fetch all lessons for the date range and filter by studentId in JS (same pattern as generate-invoices).
    // Exception: for "First invoice" combined invoices (autoNotes contains "first invoice" AND stored line items
    // have dates outside the invoice month), preserve stored line items instead of re-fetching.
    const autoNotesRaw = ((f['Auto Notes'] || '') as string).toLowerCase();
    const isFirstInvoice = autoNotesRaw.includes('first invoice');

    let lineItems: any[];
    let regularCount: number;
    let additionalCount: number;
    let baseAmount: number;

    if (isFirstInvoice && slotDayIndex >= 0 && enrollStartDate) {
      // First invoice: use the same date math as signup so the regenerated line
      // items always match the auto notes. No Airtable query needed — just iterate
      // dates from enrollment start to end of invoice month.
      const start = new Date(enrollStartDate + 'T00:00:00Z');
      const end   = new Date(lastDayStr + 'T00:00:00Z');
      lineItems = [];
      const cur = new Date(start);
      // Advance to first occurrence of slot day on or after start date
      while (cur.getUTCDay() !== slotDayIndex) cur.setUTCDate(cur.getUTCDate() + 1);
      while (cur <= end) {
        const iso = cur.toISOString().split('T')[0];
        if (!NO_LESSON_DATES.includes(iso)) {
          const lm = cur.getUTCMonth();
          const ly = cur.getUTCFullYear();
          const lessonMonthLabel = `${MONTH_NAMES[lm]} ${ly}`;
          lineItems.push({
            date: iso,
            day: slotDayLabel,
            type: 'Regular',
            description: `${level} ${subjects} — ${lessonMonthLabel}`,
          });
        }
        cur.setUTCDate(cur.getUTCDate() + 7);
      }
      regularCount = lineItems.length;
      additionalCount = 0;
      baseAmount = regularCount * ratePerLesson;
    } else if (arrearsRebuild) {
      // Arrears (Oct–Dec for non-exam-year students; the combined January):
      // the same libs the 1st-of-month run uses, so a rebuild can never
      // disagree with what the cron drafted. Regular lines = ATTENDED lessons
      // of the bill month (+ January projected on the combined invoice).
      // Additional lines stay as stored — the run's sweep already marked them
      // Billed; an extra added since is picked up by the NEXT run's sweep.
      const [pool, invoicedMonths] = await Promise.all([fetchArrearsPool(billYear, billMonth), fetchInvoicedMonthsByStudent()]);
      const ctx = { ...profile, invoicedMonths: invoicedMonths.get(studentId) ?? new Set<string>() };
      const descBase = descriptionBase(level, subjectsArr);
      const attended = attendedLessonLines(pool, studentId, ctx, {
        descriptionBase: descBase, billLabel: monthLabel(billYear, billMonth), slots, defaultRate: ratePerLesson,
      });
      const projected = combinedJan
        ? projectedLessonLines(firstDayStr, { descriptionBase: descBase, label: month, slots, defaultRate: ratePerLesson, excluded: NO_LESSON_DATES })
        : [];
      let stored: any[] = [];
      try { stored = JSON.parse((f['Line Items'] || '[]') as string); } catch { /* ignore */ }
      const storedExtras = Array.isArray(stored) ? stored.filter((l: any) => l?.type === 'Additional') : [];
      const regularLines = [...attended, ...projected];
      lineItems = [...regularLines, ...storedExtras];
      regularCount = regularLines.length;
      additionalCount = storedExtras.length;
      baseAmount = sumLineRates(regularLines, ratePerLesson);
    } else {
      // Advance months. Regular lines are re-projected from the month's lesson
      // records; Additional lines are KEPT as stored (lib/regenerate-line-items.ts):
      // the generator bills additionals from a rolling window that mostly falls
      // OUTSIDE the invoice month and ticks their Billed box, so re-deriving them
      // from the month window dropped every billed line and re-billed in-window
      // ones (found 2026-09-02).
      // Half-open month window (lib/billing-math.ts monthWindowClause):
      // {Date}<='lastDayStr' on Airtable's date-typed field silently drops a
      // lesson ON the month's last day, so regenerating undercounted those
      // months (found 2026-09-02).
      const lessonFormula = encodeURIComponent(
        `AND(${monthWindowClause(year, monthIdx + 1)},{Status}!='Cancelled',{Status}!='Cancelled - Prorated')`
      );
      const allLessonsData = await airtableRequestAll(
        'Lessons',
        `?filterByFormula=${lessonFormula}&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Student&sort[0][field]=Date&sort[0][direction]=asc`
      );
      // Exam-year students: nothing regular after the last paper (the recurring
      // generator doesn't know about exams; the advance run stops there too).
      const monthLessons: MonthLesson[] = allLessonsData.records
        .filter((r: any) => r.fields['Student']?.[0] === studentId)
        .filter((r: any) => !cutoff || (r.fields['Date'] as string) <= cutoff.iso)
        .map((r: any) => ({
          date: r.fields['Date'] as string,
          type: (r.fields['Type'] || 'Regular') as string,
          status: r.fields['Status'] as string | undefined,
        }));
      let stored: any[] = [];
      try { stored = JSON.parse((f['Line Items'] || '[]') as string); } catch { /* ignore */ }
      const rebuilt = rebuildLineItems({
        stored: Array.isArray(stored) ? stored : [],
        monthLessons,
        prorated: false,
        slotDayLabel,
        regularDescription: `${level} ${subjects} \u2014 ${month}`,
      });
      lineItems = rebuilt.lineItems;
      regularCount = rebuilt.regularCount;
      additionalCount = rebuilt.additionalCount;
      baseAmount = regularCount * ratePerLesson;
    }
    const additionalAmount = additionalCount * ratePerLesson;

    // 7. Per-month model (lib/invoice-consolidate.ts): the STORED invoice carries
    // only its own month's charge \u2014 prior open months are appended at render time
    // by applyPriorBalance, never persisted. The carry-forward recalculation that
    // used to live here predated the 2026-06-28 per-month cutover (this route was
    // missed by it); with consolidated rendering its "Outstanding balance" lump
    // made every PDF path count the previous month twice. Strip any such
    // machine-written rows still stored; manual admin extras pass through.
    let existingExtra: any[] = [];
    try { existingExtra = JSON.parse((f['Line Items Extra'] || '[]') as string); } catch { /* ignore */ }
    const newExtra = stripPersistedCarryOver(existingExtra);

    const adjustmentAmount = (f['Adjustment Amount'] as number) || 0;
    const extraTotal = newExtra.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);
    const finalAmount = Math.max(0, baseAmount + additionalAmount + adjustmentAmount + extraTotal);

    // 8. Update invoice in Airtable. Auto Notes stay untouched — whatever the
    // admin or generator wrote there is preserved.
    // Issue Date via the one shared rule (lib/invoice-month.ts): a Sent invoice
    // being rebuilt is reissued today; a Draft keeps its send-date/default.
    const issueDateStr = resolveInvoiceIssueDate(f['Status'] || 'Draft', f['Issue Date'], sgtTodayISO());
    // Due: the 15th of the invoice month in advance; issue + 7 days in arrears.
    const dueDateStr = invoiceDueDateISO(arrearsRebuild ? 'arrears' : 'advance', year, monthNum, issueDateStr);
    const patchFields: Record<string, any> = {
      'Lessons Count': regularCount + additionalCount,
      'Rate Per Lesson': ratePerLesson,
      'Final Amount': finalAmount,
      'Line Items': JSON.stringify(lineItems),
      'Line Items Extra': JSON.stringify(newExtra),
      'Due Date': dueDateStr,
      'Issue Date': issueDateStr,
      'PDF URL': '',
    };

    await at('Invoices', `/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: patchFields }),
    });

    const pdfNotes = (f['Auto Notes'] || '') as string;

    // 9. Generate fresh PDF and upload to Vercel Blob
    try {
      const invoiceData = {
        studentName,
        // "December–January 2027" when the first line is a December lesson.
        month: displaySpanMonth(month, JSON.stringify(lineItems)),
        invoiceId: recordId,
        issueDate: issueDateStr,
        dueDate: dueDateStr,
        lessonsCount: regularCount + additionalCount,
        ratePerLesson,
        baseAmount: baseAmount + additionalAmount,
        finalAmount,
        status: (f['Status'] || 'Draft') as string,
        makeupCredits: 0,
        notes: pdfNotes,
        lineItems,
        lineItemsExtra: newExtra,
        registerUrl: buildRegisterUrl(studentId),
      };
      // Consolidated view, render-time ONLY — the PATCH above already persisted
      // the per-month rows, and applyPriorBalance replaces lineItemsExtra with a
      // fresh array rather than mutating newExtra. `month` is the stored
      // canonical Airtable Month (the fail-closed contract: a display span
      // would consolidate nothing).
      await applyPriorBalance(invoiceData, studentId, month);
      const pdfBuffer = await generateInvoicePDF(invoiceData);
      const blob = await put(
        `invoices/AdrianMathTuition-Invoice-${studentName.replace(/\s+/g, '-')}-${month.replace(/\s+/g, '-')}.pdf`,
        pdfBuffer,
        { access: 'public', contentType: 'application/pdf', allowOverwrite: true }
      );
      await at('Invoices', `/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'PDF URL': blob.url } }),
      });
    } catch (pdfErr: any) {
      console.error('[regenerate-invoice] PDF error:', pdfErr.message);
    } finally {
      await closeBrowser();
    }

    return NextResponse.json({
      success: true,
      lessonsCount: regularCount + additionalCount,
      baseAmount: baseAmount + additionalAmount,
      finalAmount,
    });
  } catch (err: any) {
    console.error('[regenerate-invoice] Error:', err);
    await closeBrowser().catch(() => {});
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
