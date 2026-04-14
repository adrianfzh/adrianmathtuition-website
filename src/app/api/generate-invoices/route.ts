import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CNY_DATES = [
  '2026-02-17', '2026-02-18',
  '2027-02-06', '2027-02-07',
];
const NO_LESSON_DATES = [...CNY_DATES, '2026-12-25', '2027-12-25'];
const PRORATION_MONTHS = [10, 11, 12];

function isProratedMonth(monthNum: number) {
  return PRORATION_MONTHS.includes(monthNum);
}

function getInvoiceMonth(today = new Date()) {
  const invoiceMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return {
    label: `${monthNames[invoiceMonth.getMonth()]} ${invoiceMonth.getFullYear()}`,
    year: invoiceMonth.getFullYear(),
    month: invoiceMonth.getMonth() + 1,
    firstDay: new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth(), 1),
    lastDay: new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 0),
  };
}

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

interface InvoiceMonth {
  label: string;
  year: number;
  month: number;
  firstDay: Date;
  lastDay: Date;
}

function countOccurrencesInMonth(
  dayName: string,
  invoiceMonth: InvoiceMonth,
  endDate: Date | null = null
) {
  const dayIndices: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const targetDay = dayIndices[dayName];
  if (targetDay === undefined) return [];

  const dates: { date: string; day: string; type: string }[] = [];
  let current = new Date(invoiceMonth.firstDay);
  while (current.getDay() !== targetDay) current.setDate(current.getDate() + 1);
  while (current <= invoiceMonth.lastDay && (!endDate || current <= endDate)) {
    const iso = current.toISOString().split('T')[0];
    if (!NO_LESSON_DATES.includes(iso)) {
      dates.push({ date: iso, day: dayName, type: 'Regular' });
    }
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const validAdmin = !!(adminPassword && authHeader === `Bearer ${adminPassword}`);
  const validCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  return isVercelCron || validAdmin || validCron;
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

  try {
    const invoiceMonth = getInvoiceMonth();

    const enrollmentsData = await at(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}`
    );
    if (!enrollmentsData.records?.length) {
      return NextResponse.json({ generated: 0, skipped: 0, errors: [] });
    }

    const studentIds = [...new Set(
      enrollmentsData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    )] as string[];
    const slotIds = [...new Set(
      enrollmentsData.records.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean)
    )] as string[];

    const [studentsData, slotsData, existingInvoicesData] = await Promise.all([
      studentIds.length
        ? at('Students', `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Level&fields[]=Status&fields[]=Parent Email&fields[]=Parent Name&fields[]=Subject Level&fields[]=Subjects`)
        : { records: [] },
      slotIds.length
        ? at('Slots', `?filterByFormula=OR(${slotIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`)
        : { records: [] },
      at('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${invoiceMonth.label}'`)}`),
    ]);

    const studentsById: Record<string, any> = Object.fromEntries(studentsData.records.map((r: any) => [r.id, r]));
    const slotsById: Record<string, any> = Object.fromEntries(slotsData.records.map((r: any) => [r.id, r]));
    const existingStudentIds = new Set(
      existingInvoicesData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    );

    // Group enrollments by student
    const enrollmentsByStudent: Record<string, any[]> = {};
    for (const enrollment of enrollmentsData.records) {
      const sid = enrollment.fields['Student']?.[0];
      if (!sid) continue;
      if (!enrollmentsByStudent[sid]) enrollmentsByStudent[sid] = [];
      enrollmentsByStudent[sid].push(enrollment);
    }

    let generated = 0;
    let skipped = 0;
    const errors: any[] = [];
    const generatedList: { name: string; amount: number; count: number }[] = [];

    for (const studentId in enrollmentsByStudent) {
      const studentEnrollments = enrollmentsByStudent[studentId];
      const student = studentsById[studentId];
      if (!student) { skipped += studentEnrollments.length; continue; }

      try {
        if (existingStudentIds.has(studentId)) { skipped += studentEnrollments.length; continue; }

        const ratePerLesson = studentEnrollments[0].fields['Rate Per Lesson'] || 0;
        if (!ratePerLesson) { skipped++; continue; }

        const isProrated = isProratedMonth(invoiceMonth.month);
        let allLineItems: { date: string; day: string; type: string }[] = [];
        let proratedLessonRecords: any[] = [];
        let hasLessons = false;

        if (isProrated) {
          const monthStart = formatDate(invoiceMonth.firstDay);
          const monthEnd = formatDate(invoiceMonth.lastDay);
          const lessonFormula = encodeURIComponent(
            `AND({Student}='${studentId}',{Type}='Regular',{Status}='Completed',{Date}>='${monthStart}',{Date}<='${monthEnd}')`
          );
          const lessonData = await at('Lessons', `?filterByFormula=${lessonFormula}&sort[0][field]=Date&sort[0][direction]=asc`);
          proratedLessonRecords = lessonData.records || [];
          if (proratedLessonRecords.length > 0) hasLessons = true;
        } else {
          for (const enrollment of studentEnrollments) {
            const slotId = enrollment.fields['Slot']?.[0];
            const slot = slotsById[slotId];
            if (!slot) continue;
            const dayRaw = slot.fields['Day'] || '';
            const dayName = dayRaw.replace(/^\d+\s+/, '').trim();
            const endDateStr = enrollment.fields['End Date'];
            const endDate = endDateStr ? new Date(endDateStr + 'T00:00:00') : null;
            const lineItems = countOccurrencesInMonth(dayName, invoiceMonth, endDate);
            if (lineItems.length > 0) hasLessons = true;
            allLineItems.push(...lineItems);
          }
        }

        const today = new Date();
        const addWindowEnd = formatDate(today);
        const prevInvoiceDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
        const addWindowStart = formatDate(prevInvoiceDate);
        const additionalFormula = encodeURIComponent(
          `AND({Student}='${studentId}',{Type}='Additional',{Status}='Completed',{Date}>='${addWindowStart}',{Date}<='${addWindowEnd}')`
        );
        const additionalData = await at('Lessons', `?filterByFormula=${additionalFormula}&sort[0][field]=Date&sort[0][direction]=asc`);
        const additionalLessons = additionalData.records || [];

        const lessonCount = isProrated ? proratedLessonRecords.length : allLineItems.length;
        const additionalCount = additionalLessons.length;

        if (!isProrated && !hasLessons) { skipped += studentEnrollments.length; continue; }
        if (isProrated && lessonCount === 0 && additionalCount === 0) { skipped += studentEnrollments.length; continue; }

        if (!isProrated) allLineItems.sort((a, b) => a.date.localeCompare(b.date));

        const baseAmount = lessonCount * ratePerLesson;
        const additionalAmount = additionalCount * ratePerLesson;
        const finalAmount = baseAmount + additionalAmount;

        const subjects = Array.isArray(student.fields['Subjects'])
          ? student.fields['Subjects'].join(' & ')
          : '';
        const description = `${student.fields['Level'] || ''} ${subjects} \u2014 ${invoiceMonth.label}`;

        const lineItemsForInvoice: any[] = [];
        if (isProrated) {
          proratedLessonRecords.forEach((r: any) => {
            lineItemsForInvoice.push({ date: r.fields['Date'], day: '', type: 'Regular', description });
          });
        } else {
          allLineItems.forEach((item) => lineItemsForInvoice.push({ ...item, description }));
        }
        additionalLessons.forEach((r: any) => {
          lineItemsForInvoice.push({
            date: r.fields['Date'], day: '', type: 'Additional',
            description: `Additional Lesson \u2014 ${invoiceMonth.label}`,
          });
        });

        // Carry-over balance from previous month
        const prevMonth = new Date(invoiceMonth.firstDay);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        const prevMonthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const prevMonthLabel = `${prevMonthNames[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`;
        const prevInvoiceFormula = encodeURIComponent(`AND({Student}='${studentId}',{Month}='${prevMonthLabel}')`);
        const prevInvoiceData = await at(
          'Invoices',
          `?filterByFormula=${prevInvoiceFormula}&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid`
        );
        const prevInvoice = (prevInvoiceData.records || [])[0] || null;

        const carryOverLineItems: any[] = [];
        let carryOverNotes = '';
        if (prevInvoice) {
          const isPaid = prevInvoice.fields['Is Paid'] || false;
          const finalAmt = prevInvoice.fields['Final Amount'] || 0;
          const amountPaid = prevInvoice.fields['Amount Paid'] || 0;
          let outstanding = 0;
          if (!isPaid) {
            outstanding = finalAmt;
          } else if (isPaid && amountPaid > 0) {
            outstanding = finalAmt - amountPaid;
          }
          if (outstanding > 0) {
            carryOverLineItems.push({
              description: `Outstanding balance \u2014 ${prevMonthLabel}`,
              amount: parseFloat(outstanding.toFixed(2)),
            });
            carryOverNotes =
              `${prevMonthLabel} invoice breakdown:\n` +
              `  Invoice amount: ${finalAmt.toFixed(2)}\n` +
              `  Amount paid: ${amountPaid > 0 ? amountPaid.toFixed(2) : finalAmt.toFixed(2)}\n` +
              `  Outstanding: ${outstanding.toFixed(2)}`;
          }
        }

        const carryOverTotal = carryOverLineItems.reduce((sum: number, item: any) => sum + item.amount, 0);
        const totalFinalAmount = finalAmount + carryOverTotal;
        const autoNotes = carryOverNotes.trim();

        const invoiceFields: Record<string, any> = {
          'Student': [studentId],
          'Month': invoiceMonth.label,
          'Lessons Count': lessonCount,
          'Rate Per Lesson': ratePerLesson,
          'Adjustment Amount': additionalAmount,
          ...(additionalAmount > 0 ? { 'Adjustment Notes': `Additional lessons: ${additionalCount} \u00d7 ${ratePerLesson}` } : {}),
          'Final Amount': totalFinalAmount,
          'Line Items': JSON.stringify(lineItemsForInvoice),
          'Line Items Extra': carryOverLineItems.length > 0 ? JSON.stringify(carryOverLineItems) : '',
          'Invoice Type': 'Regular',
          'Status': 'Draft',
          'Issue Date': (() => { const d = new Date(); d.setDate(15); return formatDate(d); })(),
          'Due Date': formatDate(new Date(invoiceMonth.year, invoiceMonth.month - 1, 15)),
          'Auto Notes': autoNotes,
        };

        const createdRecord = await at('Invoices', '', {
          method: 'POST',
          body: JSON.stringify({ fields: invoiceFields }),
        });

        // Generate and upload PDF in production only
        if (process.env.VERCEL === '1') {
          try {
            const invoiceData = {
              studentName: student.fields['Student Name'],
              month: invoiceMonth.label,
              invoiceId: createdRecord.id,
              issueDate: (() => { const d = new Date(); d.setDate(15); return formatDate(d); })(),
              dueDate: formatDate(new Date(invoiceMonth.year, invoiceMonth.month - 1, 15)),
              lessonsCount: lessonCount,
              ratePerLesson,
              baseAmount,
              finalAmount: totalFinalAmount,
              status: 'Pending',
              makeupCredits: 0,
              notes: autoNotes,
              lineItems: lineItemsForInvoice,
              lineItemsExtra: carryOverLineItems,
            };
            const pdfBuffer = await generateInvoicePDF(invoiceData);
            const uploadRes = await fetch(
              `https://content.airtableapi.com/v0/${AIRTABLE_BASE_ID}/Invoices/${createdRecord.id}/uploadAttachment`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
                  'Content-Type': 'application/octet-stream',
                  'X-Airtable-Attachment-Filename': `Invoice-${student.fields['Student Name']}-${invoiceMonth.label}.pdf`,
                  'X-Airtable-Field-Name': 'Invoice PDF',
                },
                body: pdfBuffer as unknown as BodyInit,
              }
            );
            if (!uploadRes.ok) throw new Error('Airtable upload failed: ' + await uploadRes.text());
          } catch (pdfError: any) {
            console.error('[generate-invoices] PDF error:', pdfError.message);
          }
        }

        generatedList.push({ name: student.fields['Student Name'], amount: finalAmount, count: lessonCount });
        generated++;
      } catch (err: any) {
        const studentName = student?.fields?.['Student Name'] || 'Unknown';
        errors.push({ student: studentName, error: err.message });
      }
    }

    await closeBrowser();

    const summaryLines = generatedList
      .map((g) => `${g.name} \u2014 ${g.amount.toFixed(2)} (${g.count} lesson${g.count !== 1 ? 's' : ''})`)
      .join('\n');
    const totalAmount = generatedList.reduce((sum, g) => sum + g.amount, 0);
    await sendTelegram(
      `\ud83d\udccb <b>Draft invoices ready \u2014 ${invoiceMonth.label}</b>\n\n` +
        `${summaryLines}\n\n` +
        `Total: ${generated} invoices \u00b7 ${totalAmount.toFixed(2)}\n\n` +
        `Review and hold any before 15th via /amend [name].\n` +
        `Invoices send automatically at 10am tomorrow.`
    );

    return NextResponse.json({ generated, skipped, errors });
  } catch (err: any) {
    console.error('[generate-invoices] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
