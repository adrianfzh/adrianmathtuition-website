import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { buildRegisterUrl } from '@/lib/invoice-register-url';
import { NO_LESSON_DATES } from '@/lib/holidays';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { resolveInvoiceIssueDate, sgtTodayISO } from '@/lib/invoice-month';
import { monthWindowClause } from '@/lib/billing-math';
import { applyPriorBalance, stripPersistedCarryOver } from '@/lib/invoice-consolidate';

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
    const subjects = Array.isArray(student.fields['Subjects'])
      ? (student.fields['Subjects'] as string[]).join(' & ')
      : '';

    // 4. Fetch active enrollments — can't filter by linked Student field by record ID in Airtable formulas;
    // fetch all active enrollments and filter by studentId in JS (same pattern as generate-invoices).
    const enrollData = await airtableRequestAll(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent("{Status}='Active'")}&fields[]=Student&fields[]=Rate Per Lesson&fields[]=Slot&fields[]=Start Date`
    );
    const enrollment = enrollData.records.find((r: any) => r.fields['Student']?.[0] === studentId);
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

    // 6. Fetch lessons for this month — can't filter by linked Student field by record ID in Airtable formulas;
    // fetch all lessons for the date range and filter by studentId in JS (same pattern as generate-invoices).
    // Exception: for "First invoice" combined invoices (autoNotes contains "first invoice" AND stored line items
    // have dates outside the invoice month), preserve stored line items instead of re-fetching.
    const autoNotesRaw = ((f['Auto Notes'] || '') as string).toLowerCase();
    const isFirstInvoice = autoNotesRaw.includes('first invoice');

    let lineItems: any[];
    let regularCount: number;
    let additionalCount: number;

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
    } else {
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
      const lessonsData = { records: allLessonsData.records.filter((r: any) => r.fields['Student']?.[0] === studentId) };

      const description = `${level} ${subjects} \u2014 ${month}`;
      lineItems = lessonsData.records.map((r: any) => ({
        date: r.fields['Date'],
        day: slotDayLabel,
        type: (r.fields['Type'] || 'Regular') as string,
        description: r.fields['Type'] === 'Additional' ? `Additional Lesson \u2014 ${month}` : description,
      }));

      regularCount = lessonsData.records.filter((r: any) => r.fields['Type'] !== 'Additional').length;
      additionalCount = lessonsData.records.filter((r: any) => r.fields['Type'] === 'Additional').length;
    }
    const baseAmount = regularCount * ratePerLesson;
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
    const dueDateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-15`;
    // Issue Date via the one shared rule (lib/invoice-month.ts): a Sent invoice
    // being rebuilt is reissued today; a Draft keeps its send-date/default.
    const issueDateStr = resolveInvoiceIssueDate(f['Status'] || 'Draft', f['Issue Date'], sgtTodayISO());
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
        month,
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
