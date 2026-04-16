import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { sendTelegram } from '@/lib/telegram';
import { buildRegisterUrl } from '@/lib/invoice-register-url';
import { getInvoiceMonth } from '@/lib/invoice-month';

const DAY_ABBREV: Record<string, string> = {
  Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

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

// getInvoiceMonth imported from @/lib/invoice-month

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

  let reqBody: any = {};
  try { reqBody = await req.json(); } catch { /* cron has no body */ }
  const requestedMonth = (reqBody.month as string) || '';

  try {
    // Determine invoice month — use requested month if provided, else default to next month
    let invoiceMonth: InvoiceMonth;
    if (requestedMonth) {
      const FULL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const parts = requestedMonth.trim().split(' ');
      const mIdx = FULL_MONTH_NAMES.indexOf(parts[0]);
      const yr = parseInt(parts[1] || '', 10);
      if (mIdx >= 0 && !isNaN(yr)) {
        const firstDay = new Date(yr, mIdx, 1);
        const lastDay = new Date(yr, mIdx + 1, 0);
        invoiceMonth = { label: requestedMonth.trim(), year: yr, month: mIdx + 1, firstDay, lastDay };
      } else {
        invoiceMonth = getInvoiceMonth();
      }
    } else {
      invoiceMonth = getInvoiceMonth();
    }

    // IMPORTANT: paginate! A plain airtableRequest() silently caps at 100
    // rows, which previously hid enrollments (and therefore students) past
    // the first page. See src/lib/airtable.ts > airtableRequestAll.
    const enrollmentsData = await airtableRequestAll(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}`
    );
    console.log(`[generate-invoices] Active enrollments fetched: ${enrollmentsData.records.length}`);
    if (!enrollmentsData.records?.length) {
      return NextResponse.json({ generated: 0, skipped: 0, errors: [] });
    }

    const studentIds = [...new Set(
      enrollmentsData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    )] as string[];
    const slotIds = [...new Set(
      enrollmentsData.records.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean)
    )] as string[];

    // Previous month label (used to fetch carry-over invoices)
    const prevMonthDate = new Date(invoiceMonth.firstDay);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthNamesArr = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const prevMonthLabel = `${prevMonthNamesArr[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()}`;

    const [studentsData, slotsData, existingInvoicesData, prevMonthInvoicesData] = await Promise.all([
      studentIds.length
        ? airtableRequestAll('Students', `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Level&fields[]=Status&fields[]=Parent Email&fields[]=Parent Name&fields[]=Subject Level&fields[]=Subjects`)
        : Promise.resolve({ records: [] }),
      slotIds.length
        ? airtableRequestAll('Slots', `?filterByFormula=OR(${slotIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`)
        : Promise.resolve({ records: [] }),
      airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${invoiceMonth.label}'`)}`),
      airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${prevMonthLabel}'`)}&fields[]=Student&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid`),
    ]);
    console.log(`[generate-invoices] Students: ${studentsData.records.length}, Slots: ${slotsData.records.length}, Existing ${invoiceMonth.label}: ${existingInvoicesData.records.length}, Previous ${prevMonthLabel}: ${prevMonthInvoicesData.records.length}`);

    const studentsById: Record<string, any> = Object.fromEntries(studentsData.records.map((r: any) => [r.id, r]));
    const slotsById: Record<string, any> = Object.fromEntries(slotsData.records.map((r: any) => [r.id, r]));
    const existingStudentIds = new Set(
      existingInvoicesData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    );
    // Index previous-month invoices by student record ID (filter in JS — Airtable can't filter linked records by ID in formulas)
    const prevInvoiceByStudent: Record<string, any> = {};
    for (const r of prevMonthInvoicesData.records || []) {
      const sid = r.fields['Student']?.[0];
      if (sid) prevInvoiceByStudent[sid] = r;
    }

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
    const generatedInvoices: { id: string; studentId: string; lineItemsExtra: any[]; finalAmount: number }[] = [];
    // Structured skip log: shows up in Fly/Vercel logs AND in the Telegram
    // summary so missing students can be triaged without opening the DB.
    const skipReasons: { name: string; reason: string }[] = [];
    const recordSkip = (id: string, reason: string) => {
      const name = studentsById[id]?.fields?.['Student Name'] || id;
      skipReasons.push({ name, reason });
      console.warn(`[generate-invoices] SKIP ${name}: ${reason}`);
    };

    for (const studentId in enrollmentsByStudent) {
      const studentEnrollments = enrollmentsByStudent[studentId];
      const student = studentsById[studentId];
      if (!student) {
        skipped += studentEnrollments.length;
        recordSkip(studentId, 'student record not found (broken linked record)');
        continue;
      }

      try {
        if (existingStudentIds.has(studentId)) {
          skipped += studentEnrollments.length;
          // Not surfaced in skipReasons — this is the normal "already has
          // an invoice for this month" case and is expected.
          continue;
        }

        const ratePerLesson = studentEnrollments[0].fields['Rate Per Lesson'] || 0;
        if (!ratePerLesson) {
          skipped++;
          recordSkip(studentId, 'Rate Per Lesson is 0 or blank on enrollment');
          continue;
        }

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
            const dayAbbrev = DAY_ABBREV[dayName] || dayName;
            const slotTime = (slot.fields['Time'] || '').trim();
            const dayLabel = slotTime ? `${dayAbbrev} ${slotTime}` : dayAbbrev;
            const endDateStr = enrollment.fields['End Date'];
            const endDate = endDateStr ? new Date(endDateStr + 'T00:00:00') : null;
            const lineItems = countOccurrencesInMonth(dayName, invoiceMonth, endDate)
              .map((li) => ({ ...li, day: dayLabel }));
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

        if (!isProrated && !hasLessons) {
          skipped += studentEnrollments.length;
          // Enumerate why: usually a stale Slot link or blank Slot.Day.
          const slotDiagnostics = studentEnrollments.map((enr) => {
            const slotId = enr.fields['Slot']?.[0];
            const slot = slotId ? slotsById[slotId] : null;
            if (!slotId) return 'no Slot link on enrollment';
            if (!slot) return `Slot ${slotId} not in fetched Slots set (deleted or past pagination)`;
            const day = (slot.fields['Day'] || '').toString().replace(/^\d+\s+/, '').trim();
            if (!day) return `Slot ${slotId} has blank Day`;
            const endDate = enr.fields['End Date'];
            if (endDate && new Date(endDate) < invoiceMonth.firstDay) {
              return `enrollment End Date ${endDate} is before ${invoiceMonth.label}`;
            }
            return `Slot ${slotId} Day='${day}' yielded 0 occurrences`;
          });
          recordSkip(studentId, `no lessons in ${invoiceMonth.label} — ${slotDiagnostics.join('; ')}`);
          continue;
        }
        if (isProrated && lessonCount === 0 && additionalCount === 0) {
          skipped += studentEnrollments.length;
          recordSkip(studentId, `prorated month ${invoiceMonth.label} has 0 Completed lessons and 0 Additional lessons`);
          continue;
        }

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

        // Carry-over balance from previous month — batch-fetched above, looked up by student ID in JS
        // (Airtable can't filter linked record fields by ID in formulas; see CLAUDE.md)
        const prevInvoice = prevInvoiceByStudent[studentId] || null;

        const carryOverLineItems: any[] = [];
        let carryOverNotes = '';
        if (prevInvoice) {
          const finalAmt = prevInvoice.fields['Final Amount'] || 0;
          const amountPaid = prevInvoice.fields['Amount Paid'] || 0;
          // Always compute from (final - paid). Handles: unpaid (0 paid), partial, full.
          const outstanding = Math.max(0, finalAmt - amountPaid);
          if (outstanding > 0) {
            carryOverLineItems.push({
              description: `Outstanding balance \u2014 ${prevMonthLabel}`,
              amount: parseFloat(outstanding.toFixed(2)),
            });
            carryOverNotes =
              `${prevMonthLabel} invoice breakdown:\n` +
              `  Invoice amount: ${finalAmt.toFixed(2)}\n` +
              `  Amount paid: ${amountPaid.toFixed(2)}\n` +
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
              // Carry-over breakdown is stored in Airtable Auto Notes for admin reference,
              // but suppressed from the parent-facing PDF — they can view the prior invoice if needed.
              notes: '',
              lineItems: lineItemsForInvoice,
              lineItemsExtra: carryOverLineItems,
              registerUrl: buildRegisterUrl(studentId),
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
        generatedInvoices.push({ id: createdRecord.id, studentId, lineItemsExtra: carryOverLineItems, finalAmount: totalFinalAmount });
        generated++;
      } catch (err: any) {
        const studentName = student?.fields?.['Student Name'] || 'Unknown';
        errors.push({ student: studentName, error: err.message });
      }
    }

    await closeBrowser();

    // ── Referral reward check ──────────────────────────────────────────────
    const referralRewards: any[] = [];
    try {
      const referralFormula = encodeURIComponent(
        `AND({How Heard}='Referral', NOT({Referral Reward Applied}), {Status}='Active')`
      );
      const referralStudents = await airtableRequestAll('Students',
        `?filterByFormula=${referralFormula}&fields[]=Student Name&fields[]=Referral Type&fields[]=Referred By Name&fields[]=Referral Reward Applied`
      );

      if (referralStudents.records.length > 0) {
        // Fetch all active students once for fuzzy matching
        const allActiveStudents = await airtableRequestAll('Students',
          `?filterByFormula=${encodeURIComponent("{Status}='Active'")}&fields[]=Student Name`
        );

        for (const student of referralStudents.records) {
          const newStudentName = student.fields['Student Name'] || '';
          const referrerName = (student.fields['Referred By Name'] || '') as string;
          const referralType = (student.fields['Referral Type'] || '') as string;

          // Count completed lessons for this referred student
          const lessonFormula = encodeURIComponent(
            `AND({Student}='${student.id}',{Status}='Completed')`
          );
          const lessonsData = await airtableRequestAll('Lessons', `?filterByFormula=${lessonFormula}&fields[]=Status`);
          const completedCount = lessonsData.records.length;

          if (completedCount < 12) continue; // Not yet eligible

          if (referralType === 'Current Student') {
            // Fuzzy match referrer name against active students
            const referrerNameLower = referrerName.toLowerCase().trim();
            let matchedReferrer: any = null;
            let matchConfidence = 'none';

            for (const s of allActiveStudents.records) {
              const name = ((s.fields['Student Name'] || '') as string).toLowerCase();
              if (name === referrerNameLower) {
                matchedReferrer = s;
                matchConfidence = 'exact';
                break;
              }
              if (!matchedReferrer) {
                const referrerWords = referrerNameLower.split(/\s+/);
                const nameWords = name.split(/\s+/);
                const sharedWords = referrerWords.filter((w: string) => w.length > 1 && nameWords.includes(w));
                if (sharedWords.length >= 1) {
                  matchedReferrer = s;
                  matchConfidence = 'fuzzy';
                }
              }
            }

            if (matchedReferrer) {
              // Find referrer's enrollment to get rate
              const enrollFormula = encodeURIComponent(
                `AND({Student}='${matchedReferrer.id}',{Status}='Active')`
              );
              const enrollData = await airtableRequestAll('Enrollments',
                `?filterByFormula=${enrollFormula}&fields[]=Rate Per Lesson`
              );
              const ratePerLesson = (enrollData.records[0]?.fields['Rate Per Lesson'] as number) || 0;
              const rewardAmount = ratePerLesson * 4;

              // Find the referrer's invoice (from this batch or existing for the month)
              const referrerInvoice = generatedInvoices.find((inv) => inv.studentId === matchedReferrer.id);
              if (referrerInvoice) {
                const existingExtra = Array.isArray(referrerInvoice.lineItemsExtra)
                  ? [...referrerInvoice.lineItemsExtra]
                  : [];
                existingExtra.push({
                  description: `Referral reward \u2014 referred ${newStudentName}`,
                  amount: -rewardAmount,
                });
                const newFinalAmount = Math.max(0, referrerInvoice.finalAmount - rewardAmount);

                await airtableRequest('Invoices', `/${referrerInvoice.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ fields: {
                    'Line Items Extra': JSON.stringify(existingExtra),
                    'Final Amount': newFinalAmount,
                  }}),
                });

                // Update local tracking to prevent double-applying if another referred student points to same referrer
                referrerInvoice.lineItemsExtra = existingExtra;
                referrerInvoice.finalAmount = newFinalAmount;
              }

              // Mark referral as applied (even if invoice not in this batch — avoids re-triggering next month)
              await airtableRequest('Students', `/${student.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ fields: { 'Referral Reward Applied': true } }),
              });

              referralRewards.push({
                newStudent: newStudentName,
                referrer: matchedReferrer.fields['Student Name'],
                reward: rewardAmount,
                type: 'invoice_credit',
                confidence: matchConfidence,
                invoiceFound: !!referrerInvoice,
              });
            } else {
              // Could not match referrer — flag for admin (do NOT mark as applied)
              referralRewards.push({
                newStudent: newStudentName,
                referrerName,
                type: 'unmatched',
                confidence: 'none',
              });
            }
          } else {
            // Past student / parent / other — cash reminder
            referralRewards.push({
              newStudent: newStudentName,
              referrerName,
              referralType,
              reward: 150,
              type: 'cash_reminder',
            });

            await airtableRequest('Students', `/${student.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ fields: { 'Referral Reward Applied': true } }),
            });
          }
        }
      }
    } catch (referralErr: any) {
      console.error('[generate-invoices] Referral reward check error:', referralErr.message);
    }

    const summaryLines = generatedList
      .map((g) => `${g.name} \u2014 ${g.amount.toFixed(2)} (${g.count} lesson${g.count !== 1 ? 's' : ''})`)
      .join('\n');
    const totalAmount = generatedList.reduce((sum, g) => sum + g.amount, 0);

    // Surface skip reasons so Zane/Xavier-style "missing invoice" issues are
    // visible in the Telegram summary, not just the server logs.
    const skipSection = skipReasons.length
      ? `\n\n\u26A0\uFE0F <b>Skipped with a flag (${skipReasons.length}):</b>\n` +
          skipReasons.map((s) => `\u2022 ${s.name} \u2014 ${s.reason}`).join('\n')
      : '';

    let referralSection = '';
    if (referralRewards.length > 0) {
      referralSection = '\n\n\uD83C\uDF81 <b>Referral Rewards</b>\n';
      for (const r of referralRewards) {
        if (r.type === 'invoice_credit') {
          const badge = r.confidence === 'exact' ? '\u2705' : '\u26A0\uFE0F fuzzy match';
          const invoiceNote = r.invoiceFound ? '' : ' (invoice not in this batch \u2014 check manually)';
          referralSection += `${badge} ${r.referrer} gets -$${(r.reward as number).toFixed(2)} (referred ${r.newStudent})${invoiceNote}\n`;
        } else if (r.type === 'cash_reminder') {
          referralSection += `\uD83D\uDCB5 Transfer $${r.reward} to ${r.referrerName} (${r.referralType}) \u2014 referred ${r.newStudent}\n`;
        } else if (r.type === 'unmatched') {
          referralSection += `\u274C Could not match referrer "${r.referrerName}" for ${r.newStudent} \u2014 please check manually\n`;
        }
      }
    }

    await sendTelegram(
      `\ud83d\udccb <b>Draft invoices ready \u2014 ${invoiceMonth.label}</b>\n\n` +
        `${summaryLines}\n\n` +
        `Total: ${generated} invoices \u00b7 ${totalAmount.toFixed(2)}` +
        skipSection +
        referralSection +
        `\n\nReview and hold any before 15th via /amend [name].\n` +
        `Invoices send automatically at 10am tomorrow.`
    );

    return NextResponse.json({ generated, skipped, errors, skipReasons });
  } catch (err: any) {
    console.error('[generate-invoices] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
