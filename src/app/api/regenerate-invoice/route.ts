import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { buildRegisterUrl } from '@/lib/invoice-register-url';

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

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  return req.headers.get('authorization') === `Bearer ${adminPassword}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
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
      `?filterByFormula=${encodeURIComponent("{Status}='Active'")}&fields[]=Student&fields[]=Rate Per Lesson&fields[]=Slot`
    );
    const enrollment = enrollData.records.find((r: any) => r.fields['Student']?.[0] === studentId);
    const ratePerLesson = (enrollment?.fields['Rate Per Lesson'] as number) || 0;
    const slotId = enrollment?.fields['Slot']?.[0] as string | undefined;

    // 5. Resolve slot day label
    let slotDayLabel = '';
    if (slotId) {
      const slot = await at('Slots', `/${slotId}`);
      const rawDay = (slot.fields['Day'] || '') as string;
      const dayName = rawDay.replace(/^\d+\s+/, '').trim();
      const slotTime = ((slot.fields['Time'] || '') as string).trim();
      const dayAbbrev = DAY_ABBREV[dayName] || dayName;
      slotDayLabel = slotTime ? `${dayAbbrev} ${slotTime}` : dayAbbrev;
    }

    // 6. Fetch lessons for this month — can't filter by linked Student field by record ID in Airtable formulas;
    // fetch all lessons for the date range and filter by studentId in JS (same pattern as generate-invoices).
    const lessonFormula = encodeURIComponent(
      `AND({Date}>='${firstDayStr}',{Date}<='${lastDayStr}',OR({Status}='Scheduled',{Status}='Completed',{Status}='Present',{Status}='Attended'))`
    );
    const allLessonsData = await airtableRequestAll(
      'Lessons',
      `?filterByFormula=${lessonFormula}&fields[]=Date&fields[]=Type&fields[]=Status&fields[]=Student&sort[0][field]=Date&sort[0][direction]=asc`
    );
    const lessonsData = { records: allLessonsData.records.filter((r: any) => r.fields['Student']?.[0] === studentId) };

    const description = `${level} ${subjects} \u2014 ${month}`;
    const lineItems = lessonsData.records.map((r: any) => ({
      date: r.fields['Date'],
      day: slotDayLabel,
      type: (r.fields['Type'] || 'Regular') as string,
      description: r.fields['Type'] === 'Additional' ? `Additional Lesson \u2014 ${month}` : description,
    }));

    const regularCount = lessonsData.records.filter((r: any) => r.fields['Type'] !== 'Additional').length;
    const additionalCount = lessonsData.records.filter((r: any) => r.fields['Type'] === 'Additional').length;
    const baseAmount = regularCount * ratePerLesson;
    const additionalAmount = additionalCount * ratePerLesson;

    // 7. Recalculate carry-over from previous month
    const prevMonthDate = new Date(year, monthIdx - 1, 1);
    const prevMonthLabel = `${MONTH_NAMES[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()}`;
    // Fetch all invoices for the previous month then filter by student ID in JS
    // (Airtable cannot filter linked-record fields by ID in formulas)
    const prevInvData = await airtableRequestAll(
      'Invoices',
      `?filterByFormula=${encodeURIComponent(`{Month}='${prevMonthLabel}'`)}&fields[]=Student&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid`
    );
    const prevInvoice = prevInvData.records.find((r: any) => r.fields['Student']?.[0] === studentId);

    const carryOverItems: any[] = [];
    let carryOverNotes = '';
    if (prevInvoice) {
      const prevFinal = (prevInvoice.fields['Final Amount'] as number) || 0;
      const prevPaid = (prevInvoice.fields['Amount Paid'] as number) || 0;
      const outstanding = Math.max(0, prevFinal - prevPaid);
      if (outstanding > 0) {
        carryOverItems.push({
          description: `Outstanding balance \u2014 ${prevMonthLabel}`,
          amount: parseFloat(outstanding.toFixed(2)),
        });
        carryOverNotes =
          `${prevMonthLabel} invoice breakdown:\n` +
          `  Invoice amount: ${prevFinal.toFixed(2)}\n` +
          `  Amount paid: ${prevPaid.toFixed(2)}\n` +
          `  Outstanding: ${outstanding.toFixed(2)}`;
      }
    }

    // 8. Preserve manual Line Items Extra; replace only carry-over items
    let existingExtra: any[] = [];
    try { existingExtra = JSON.parse((f['Line Items Extra'] || '[]') as string); } catch { /* ignore */ }
    const manualExtra = existingExtra.filter(
      (item: any) => !((item.description as string || '').startsWith('Outstanding balance'))
    );
    const newExtra = [...carryOverItems, ...manualExtra];

    const adjustmentAmount = (f['Adjustment Amount'] as number) || 0;
    const extraTotal = newExtra.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);
    const finalAmount = Math.max(0, baseAmount + additionalAmount + adjustmentAmount + extraTotal);

    // 9. Update invoice in Airtable
    await at('Invoices', `/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          'Lessons Count': regularCount + additionalCount,
          'Rate Per Lesson': ratePerLesson,
          'Final Amount': finalAmount,
          'Line Items': JSON.stringify(lineItems),
          'Line Items Extra': JSON.stringify(newExtra),
          'Auto Notes': carryOverNotes.trim(),
          'PDF URL': '',
        },
      }),
    });

    // 10. Generate fresh PDF and upload to Vercel Blob
    try {
      const invoiceData = {
        studentName,
        month,
        invoiceId: recordId,
        issueDate: (f['Issue Date'] || '') as string,
        dueDate: (f['Due Date'] || '') as string,
        lessonsCount: regularCount + additionalCount,
        ratePerLesson,
        baseAmount: baseAmount + additionalAmount,
        finalAmount,
        status: (f['Status'] || 'Draft') as string,
        makeupCredits: 0,
        notes: carryOverNotes.trim(),
        lineItems,
        lineItemsExtra: newExtra,
        registerUrl: buildRegisterUrl(studentId),
      };
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
