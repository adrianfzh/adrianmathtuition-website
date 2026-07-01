import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { sendTelegram } from '@/lib/telegram';
import { buildRegisterUrl } from '@/lib/invoice-register-url';
import { getInvoiceMonth } from '@/lib/invoice-month';
import { applyPriorBalance } from '@/lib/invoice-consolidate';
import { NO_LESSON_DATES } from '@/lib/holidays';

const DAY_ABBREV: Record<string, string> = {
  Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

export const runtime = 'nodejs';
export const maxDuration = 300;

// Prorated months bill by actual attendance (Completed lessons), generated in arrears.
// June (6) = holiday month (flexible attendance / revision sprint); Oct–Dec = year-end taper.
const PRORATION_MONTHS = [6, 10, 11, 12];

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
        ? airtableRequestAll('Students', `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Level&fields[]=Status&fields[]=Parent Email&fields[]=Parent Name&fields[]=Subject Level&fields[]=Subjects&fields[]=June Revision ${invoiceMonth.year}`)
        : Promise.resolve({ records: [] }),
      slotIds.length
        ? airtableRequestAll('Slots', `?filterByFormula=OR(${slotIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`)
        : Promise.resolve({ records: [] }),
      airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${invoiceMonth.label}'`)}`),
      airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${prevMonthLabel}'`)}&fields[]=Student&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Status&fields[]=Invoice Type&fields[]=Lessons Count&fields[]=Rate Per Lesson&fields[]=Adjustment Amount&fields[]=Adjustment Notes&fields[]=Line Items Extra`),
    ]);
    console.log(`[generate-invoices] Students: ${studentsData.records.length}, Slots: ${slotsData.records.length}, Existing ${invoiceMonth.label}: ${existingInvoicesData.records.length}, Previous ${prevMonthLabel}: ${prevMonthInvoicesData.records.length}`);

    const studentsById: Record<string, any> = Object.fromEntries(studentsData.records.map((r: any) => [r.id, r]));
    const slotsById: Record<string, any> = Object.fromEntries(slotsData.records.map((r: any) => [r.id, r]));
    const existingStudentIds = new Set(
      existingInvoicesData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    );
    // Index previous-month invoices by student record ID (filter in JS — Airtable can't filter linked records by ID in formulas).
    // Collect ALL non-Voided prior invoices per student (a revision student can have a voided regular + a sent revision invoice;
    // skipping Voided stops us carrying a cancelled amount, and summing handles multiple live invoices).
    const prevInvoicesByStudent: Record<string, any[]> = {};
    for (const r of prevMonthInvoicesData.records || []) {
      const sid = r.fields['Student']?.[0];
      if (!sid || r.fields['Status'] === 'Voided') continue;
      (prevInvoicesByStudent[sid] = prevInvoicesByStudent[sid] || []).push(r);
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

    // June Revision Mode (toggle in Settings): when ON, students who signed up for the
    // June revision sprint are billed via their revision invoice (created by the sign-up
    // flow), so we SKIP their regular June invoice here. Per-year field: "June Revision <year>".
    const isJune = invoiceMonth.month === 6;
    let juneRevisionMode = false;
    if (isJune) {
      const rs = await airtableRequestAll('Settings',
        `?filterByFormula=${encodeURIComponent(`{Setting Name}='june_revision_mode'`)}`
      ).catch(() => ({ records: [] }));
      juneRevisionMode = rs.records?.[0]?.fields?.['Value'] === 'true';
      console.log(`[generate-invoices] June Revision Mode: ${juneRevisionMode ? 'ON' : 'off'}`);
    }

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

        // June Revision Mode: signed-up students get a revision invoice instead of a regular one.
        if (isJune && juneRevisionMode && student.fields[`June Revision ${invoiceMonth.year}`] === 'Signed Up') {
          skipped += studentEnrollments.length;
          recordSkip(studentId, 'June revision sprint — billed via revision invoice (regular skipped)');
          continue;
        }

        // Use each enrollment's own rate; fall back across enrollments for skip check
        const anyRate = studentEnrollments.some((e: any) => e.fields['Rate Per Lesson'] > 0);
        if (!anyRate) {
          skipped++;
          recordSkip(studentId, 'Rate Per Lesson is 0 or blank on all enrollments');
          continue;
        }
        // Primary rate (first enrollment with a non-zero rate) — used for Additional lessons & invoice header
        const ratePerLesson = studentEnrollments.find((e: any) => e.fields['Rate Per Lesson'] > 0)?.fields['Rate Per Lesson'] || 0;

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
            const enrollRate: number = enrollment.fields['Rate Per Lesson'] || ratePerLesson;
            const lineItems = countOccurrencesInMonth(dayName, invoiceMonth, endDate)
              .map((li) => ({ ...li, day: dayLabel, enrollRate }));
            if (lineItems.length > 0) hasLessons = true;
            allLineItems.push(...lineItems);
          }
        }

        const today = new Date();
        const addWindowEnd = formatDate(today);
        const prevInvoiceDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
        const addWindowStart = formatDate(prevInvoiceDate);
        // NB: exclude "Revision makeup" lessons — they are makeups for an already-paid
        // Revision Sprint session, so they must NOT be billed again (even though they're
        // Type='Additional' so they show on the schedule). Keyed off the structured
        // {Is Revision Makeup} flag, with the legacy note-text kept as a safety net.
        const additionalFormula = encodeURIComponent(
          `AND({Student}='${studentId}',{Type}='Additional',{Status}='Completed',{Date}>='${addWindowStart}',{Date}<='${addWindowEnd}',NOT(OR({Is Revision Makeup},FIND('Revision makeup',{Notes}))))`
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

        // Calculate base amount using per-enrollment rates (handles multi-rate students)
        const baseAmount = isProrated
          ? lessonCount * ratePerLesson
          : allLineItems.reduce((sum, item) => sum + ((item as any).enrollRate || ratePerLesson), 0);
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
          allLineItems.forEach((item) => {
            const itemRate = (item as any).enrollRate || ratePerLesson;
            lineItemsForInvoice.push({ ...item, description, rate: itemRate });
          });
        }
        additionalLessons.forEach((r: any) => {
          lineItemsForInvoice.push({
            date: r.fields['Date'], day: '', type: 'Additional',
            description: `Additional Lesson \u2014 ${invoiceMonth.label}`,
          });
        });

        // ── Per-month model (was: carry-forward) ────────────────────────
        // Each invoice carries ONLY its own month. Prior unpaid months stay open as
        // their own invoices and are shown together at render time (consolidated PDF
        // + admin view) — NOT rolled into this invoice. No lump line, no settling
        // of prior invoices, no carry note. carryOverLineItems stays [] so the
        // downstream PDF/tracking code needs no change.
        const carryOverLineItems: any[] = [];
        const totalFinalAmount = finalAmount;
        const autoNotes = '';

        const invoiceFields: Record<string, any> = {
          'Student': [studentId],
          'Month': invoiceMonth.label,
          'Lessons Count': lessonCount,
          'Rate Per Lesson': ratePerLesson,
          'Adjustment Amount': additionalAmount,
          ...(additionalAmount > 0 ? { 'Adjustment Notes': `Additional lessons: ${additionalCount} \u00d7 ${ratePerLesson}` } : {}),
          'Final Amount': totalFinalAmount,
          // Nothing owed (e.g. fully offset by a credit) → mark paid, not "Unpaid".
          'Is Paid': totalFinalAmount <= 0.005,
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
            await applyPriorBalance(invoiceData, studentId);
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

          // Count completed lessons for this referred student.
          // NOTE: Cannot use {Student}='recXXX' on linked record fields — filter in JS instead.
          const lessonsData = await airtableRequestAll('Lessons',
            `?filterByFormula=${encodeURIComponent(`AND({Status}='Completed',{Type}!='Trial')`)}&fields[]=Student&fields[]=Type`
          );
          const completedCount = lessonsData.records.filter(
            (r: any) => r.fields['Student']?.[0] === student.id
          ).length;

          if (completedCount < 12) continue; // Not yet eligible

          if (referralType === 'Current Student') {
            // Fuzzy match referrer name against active students
            const referrerNameLower = referrerName.toLowerCase().trim();
            let matchedReferrer: any = null;
            let matchConfidence = 'none';

            // Score every candidate by shared name-words and pick the UNIQUE best match.
            // (The old first-shared-word-wins logic mis-resolved partial names on common
            // surnames — e.g. "Abel Tan" → "Kiara Tan" instead of "Abel Tan Zhi Yi".)
            const referrerWords = referrerNameLower.split(/\s+/).filter((w: string) => w.length > 1);
            let bestScore = 0, runnerUp = 0;
            for (const s of allActiveStudents.records) {
              const name = ((s.fields['Student Name'] || '') as string).toLowerCase();
              if (name === referrerNameLower) {
                matchedReferrer = s; matchConfidence = 'exact'; bestScore = 99; break;
              }
              const nameWords = name.split(/\s+/);
              const shared = referrerWords.filter((w: string) => nameWords.includes(w)).length;
              if (shared > bestScore) { runnerUp = bestScore; bestScore = shared; matchedReferrer = s; }
              else if (shared > runnerUp) { runnerUp = shared; }
            }
            // Confidence gate: accept only a clear winner — exact, or every given-name word matched,
            // or >=2 shared words — that strictly beats the runner-up. Otherwise leave unmatched so it
            // surfaces for manual review rather than crediting the wrong person on a shared surname.
            if (matchConfidence !== 'exact') {
              const allWordsMatched = bestScore >= 1 && bestScore === referrerWords.length;
              if (matchedReferrer && bestScore > runnerUp && (allWordsMatched || bestScore >= 2)) {
                matchConfidence = 'fuzzy';
              } else {
                matchedReferrer = null; matchConfidence = 'none';
              }
            }

            if (matchedReferrer) {
              // Find referrer's enrollment to get rate
              // Fetch active enrollments and match by student in JS (linked record filter workaround)
              const enrollData = await airtableRequestAll('Enrollments',
                `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Rate Per Lesson`
              );
              const referrerEnrollment = enrollData.records.find(
                (r: any) => r.fields['Student']?.[0] === matchedReferrer.id
              );
              const ratePerLesson = (referrerEnrollment?.fields['Rate Per Lesson'] as number) || 0;
              const rewardAmount = ratePerLesson * 4;

              // Find the referrer's invoice (from this batch or existing for the month)
              const referrerInvoice = generatedInvoices.find((inv) => inv.studentId === matchedReferrer.id);
              if (referrerInvoice) {
                const existingExtra = Array.isArray(referrerInvoice.lineItemsExtra)
                  ? [...referrerInvoice.lineItemsExtra]
                  : [];
                existingExtra.push({
                  description: `Referral reward${matchConfidence === 'fuzzy' ? ' \u26a0 fuzzy match' : ''} \u2014 referred ${newStudentName}`,
                  amount: -rewardAmount,
                  matchConfidence,
                  referrerNameGiven: referrerName,
                });
                const newFinalAmount = Math.max(0, referrerInvoice.finalAmount - rewardAmount);
                const referralNote = `Thank you so much for referring ${newStudentName} to us! 🎉 As a token of our appreciation, we've applied a complimentary month of lessons to this invoice.`;

                await airtableRequest('Invoices', `/${referrerInvoice.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ fields: {
                    'Line Items Extra': JSON.stringify(existingExtra),
                    'Final Amount': newFinalAmount,
                    // Credit fully offsets the invoice → nothing owed → mark paid.
                    ...(newFinalAmount <= 0.005 ? { 'Is Paid': true } : {}),
                    'Auto Notes': referralNote,
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

    // ── Deferred adjustments ───────────────────────────────────────────────
    // Admin (or the invoice AI assistant) can park a credit/charge on a
    // student's current invoice with a target month. When that month is
    // generated, apply it to the new invoice and tick Deferred Applied so it
    // only ever lands once. See CLAUDE.md > Deferred Adjustments.
    const deferredResults: { name: string; amount: number; applied: boolean; note: string }[] = [];
    try {
      const deferredFormula = encodeURIComponent(
        `AND({Deferred To Month}='${invoiceMonth.label}', NOT({Deferred Applied}), {Deferred Amount})`
      );
      const carriers = await airtableRequestAll('Invoices',
        `?filterByFormula=${deferredFormula}&fields[]=Student&fields[]=Deferred Amount&fields[]=Deferred Note&fields[]=Deferred To Month`
      );

      for (const carrier of carriers.records || []) {
       try {
        const sid = carrier.fields['Student']?.[0];
        const amount: number = carrier.fields['Deferred Amount'] || 0;
        const note: string = (carrier.fields['Deferred Note'] || '').toString();
        const name = sid ? (studentsById[sid]?.fields?.['Student Name'] || sid) : '(unknown)';
        if (!sid || amount === 0) continue;

        // Find this student's invoice for the month being generated:
        // prefer one created in this batch, else an existing one for the month.
        let targetId = generatedInvoices.find((inv) => inv.studentId === sid)?.id || null;
        if (!targetId) {
          const existing = existingInvoicesData.records.find((r: any) => r.fields['Student']?.[0] === sid);
          targetId = existing?.id || null;
        }
        if (!targetId) {
          // No invoice this month to attach to — leave unapplied so it surfaces again next run.
          deferredResults.push({ name, amount, applied: false, note });
          continue;
        }

        // Fresh read so we stack on top of (not clobber) referral credits / other extras.
        const inv = await at('Invoices', `/${targetId}`);
        const existingExtra = inv.fields['Line Items Extra']
          ? JSON.parse(inv.fields['Line Items Extra'])
          : [];
        existingExtra.push({
          description: note || `Adjustment carried forward from ${carrier.fields['Deferred To Month'] || ''}`.trim(),
          amount: parseFloat(amount.toFixed(2)),
        });
        const newFinal = Math.max(0, (inv.fields['Final Amount'] || 0) + amount);
        const prevNotes = (inv.fields['Auto Notes'] || '').toString();
        const sign = amount >= 0 ? '+' : '−';
        const noteLine = `${note || 'Deferred adjustment'} (${sign}$${Math.abs(amount).toFixed(2)})`;
        const newNotes = prevNotes ? `${prevNotes}\n\n${noteLine}` : noteLine;

        await at('Invoices', `/${targetId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: {
            'Line Items Extra': JSON.stringify(existingExtra),
            'Final Amount': newFinal,
            'Auto Notes': newNotes,
          }}),
        });
        // Tick the carrier so it never applies twice.
        await at('Invoices', `/${carrier.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { 'Deferred Applied': true } }),
        });

        // Keep in-memory batch state consistent for any later steps.
        const gen = generatedInvoices.find((g) => g.id === targetId);
        if (gen) { gen.finalAmount = newFinal; gen.lineItemsExtra = existingExtra; }

        deferredResults.push({ name, amount, applied: true, note });
       } catch (oneErr: any) {
        console.error('[generate-invoices] Deferred adjustment (single record) error:', oneErr.message);
       }
      }
    } catch (deferredErr: any) {
      console.error('[generate-invoices] Deferred adjustment error:', deferredErr.message);
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

    let deferredSection = '';
    if (deferredResults.length > 0) {
      deferredSection = '\n\n\u23f0 <b>Deferred adjustments</b>\n';
      for (const d of deferredResults) {
        const sign = d.amount >= 0 ? '+' : '\u2212';
        const amt = `${sign}$${Math.abs(d.amount).toFixed(2)}`;
        deferredSection += d.applied
          ? `\u2705 ${d.name}: ${amt} applied${d.note ? ` \u2014 ${d.note}` : ''}\n`
          : `\u26a0\ufe0f ${d.name}: ${amt} pending \u2014 no ${invoiceMonth.label} invoice to attach to, apply manually\n`;
      }
    }

    await sendTelegram(
      `\ud83d\udccb <b>Draft invoices ready \u2014 ${invoiceMonth.label}</b>\n\n` +
        `${summaryLines}\n\n` +
        `Total: ${generated} invoices \u00b7 ${totalAmount.toFixed(2)}` +
        skipSection +
        referralSection +
        deferredSection +
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
