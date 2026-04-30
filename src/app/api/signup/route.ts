import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { sendTelegram } from '@/lib/telegram';

const sanitize = (str: unknown) => String(str || '').trim().replace(/[<>]/g, '').slice(0, 500);

const CNY_DATES = [
  '2026-02-17', '2026-02-18',
  '2027-02-06', '2027-02-07',
];
const NO_LESSON_DATES = [...CNY_DATES, '2026-12-25', '2027-12-25'];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const LEVEL_MAP: Record<string, string> = {
  Sec1: 'Sec 1', Sec2: 'Sec 2', Sec3: 'Sec 3',
  Sec4: 'Sec 4', Sec5: 'Sec 5', JC1: 'JC1', JC2: 'JC2',
};

async function airtableRequest(baseId: string, token: string, tableName: string, path: string, options: RequestInit = {}) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Airtable error [${tableName}${path}]: ${JSON.stringify(data)}`);
  return data;
}

export async function POST(request: NextRequest) {
  const airtableToken = process.env.AIRTABLE_TOKEN || '';
  const baseId        = process.env.AIRTABLE_BASE_ID || '';

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /**/ }

  const {
    slotId, level: rawLevel, subjects: subjectsParam, subjectLevel: subjectLevelParam,
    trialLessonId, lockedStartDate,
    expires, sig, studentName, school, studentContact,
    parentName, parentContact, parentEmail, startDate, howHeard, referralType, referredBy,
  } = body;

  if (!slotId || !expires || !sig || !studentName || !parentName || !parentContact || !parentEmail || !startDate || !howHeard) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const at = (table: string, path: string, opts?: RequestInit) =>
    airtableRequest(baseId, airtableToken, table, path, opts);

  try {
    // Step 1: Validate HMAC
    const check = new URLSearchParams();
    check.set('slotId', String(slotId || ''));
    check.set('level', String(rawLevel || ''));
    check.set('subjects', String(subjectsParam || ''));
    if (subjectLevelParam) check.set('subjectLevel', String(subjectLevelParam));
    if (trialLessonId) check.set('trialLessonId', String(trialLessonId));
    // lockedStartDate is the URL param that was included in the HMAC when admin prefilled a date
    if (lockedStartDate) check.set('startDate', String(lockedStartDate));
    check.set('expires', String(expires || ''));
    const expectedSig = createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
      .update(check.toString()).digest('hex').slice(0, 16);
    if (sig !== expectedSig || Date.now() > parseInt(String(expires))) {
      return NextResponse.json({ error: 'Invalid or expired signup link.' }, { status: 400 });
    }

    const level = LEVEL_MAP[String(rawLevel)] || String(rawLevel);
    const subjectLevel = String(subjectLevelParam || '');
    const subjects = subjectsParam
      ? String(subjectsParam).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const slotIds = slotId ? [String(slotId)] : [];

    // Step 1b: Validate start date falls on correct day of week
    if (slotIds.length > 0 && startDate) {
      try {
        const slotCheck = await at('Slots', `/${slotIds[0]}`);
        const slotDayRaw = (slotCheck.fields?.['Day'] || '').replace(/^\d+\s+/, '').trim();
        const dayMap: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
          Thursday: 4, Friday: 5, Saturday: 6,
        };
        const expectedDay = dayMap[slotDayRaw];
        const pickedDate = new Date(String(startDate) + 'T00:00:00');
        if (expectedDay !== undefined && pickedDate.getDay() !== expectedDay) {
          return NextResponse.json({
            error: `Start date ${startDate} is not a ${slotDayRaw}. Please go back and select a valid date.`,
          }, { status: 400 });
        }
      } catch (err) {
        console.error('[signup] Slot validation failed (non-fatal, continuing):', (err as Error).message);
      }
    }

    // Step 2: Create Student
    const studentFields: Record<string, unknown> = {
      'Student Name': sanitize(studentName),
      'Level': level,
      'Subject Level': subjectLevel,
      'Subjects': subjects,
      'Parent Name': sanitize(parentName),
      'Parent Contact': sanitize(parentContact),
      'Parent Email': sanitize(parentEmail),
      'Status': 'Active',
      'Join Date': startDate,
      'How Heard': sanitize(howHeard),
    };
    if (school) studentFields['School'] = sanitize(school);
    if (studentContact) studentFields['Student Contact'] = sanitize(studentContact);
    if (referralType) studentFields['Referral Type'] = sanitize(referralType);
    if (referredBy) studentFields['Referred By Name'] = sanitize(referredBy);

    const studentRecord = await at('Students', '', {
      method: 'POST',
      body: JSON.stringify({ fields: studentFields }),
    });
    const studentId = studentRecord.id;

    // Step 2b: Link trial lesson to new student (non-fatal)
    if (trialLessonId) {
      try {
        await at('Lessons', `/${String(trialLessonId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: {
            Student: [studentId],
            Notes: `Trial student: ${sanitize(studentName)}`,
          }}),
        });
      } catch (err) {
        console.error('[signup] Failed to link trial lesson:', (err as Error).message);
      }
    }

    // Step 2d: Create registration token (non-fatal)
    let registrationToken: string | null = null;
    try {
      const tokenValue = Array.from({ length: 8 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
      ).join('');
      await at('Tokens', '', {
        method: 'POST',
        body: JSON.stringify({ fields: {
          Token: tokenValue,
          Student: [studentId],
          'Expires At': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          Status: 'Active',
          'Created At': new Date().toISOString(),
        }}),
      });
      registrationToken = tokenValue;
    } catch (err) {
      console.error('[signup] Token creation failed (non-fatal):', (err as Error).message);
    }

    // Step 3: Find Rate (non-fatal)
    let rateId: string | null = null;
    let ratePerLesson: number | null = null;
    let rateType: string | null = null;
    try {
      const rateLevel = level.startsWith('JC') ? 'JC' : 'Secondary';
      const rateParams = new URLSearchParams();
      rateParams.set('filterByFormula', `AND({Level}='${rateLevel}', {Is Current}=1)`);
      rateParams.set('maxRecords', '1');
      const rateData = await at('Rates', `?${rateParams.toString()}`);
      if (rateData.records?.length > 0) {
        const rec = rateData.records[0];
        rateId = rec.id;
        ratePerLesson = rec.fields['Amount'] ? rec.fields['Amount'] / 4 : null;
        rateType = 'Current';
      }
    } catch (err) {
      console.error('[signup] Rate lookup failed (non-fatal):', (err as Error).message);
    }

    // Step 4: Create Enrollment
    let enrollmentId: string | null = null;
    try {
      const enrollmentFields: Record<string, unknown> = {
        'Student': [studentId],
        'Subjects In This Slot': subjects,
        'Start Date': startDate,
        'Status': 'Active',
      };
      if (slotIds.length) enrollmentFields['Slot'] = slotIds;
      if (ratePerLesson !== null) enrollmentFields['Rate Per Lesson'] = ratePerLesson;
      if (rateType) enrollmentFields['Rate Type'] = rateType;

      const enrollmentRecord = await at('Enrollments', '', {
        method: 'POST',
        body: JSON.stringify({ fields: enrollmentFields }),
      });
      enrollmentId = enrollmentRecord.id;
    } catch (err) {
      console.error('[signup] Enrollment creation failed:', (err as Error).message);
      return NextResponse.json({
        error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId})`,
        partialSuccess: true,
      }, { status: 500 });
    }

    // Step 5: Create Rate History
    if (rateId) {
      try {
        await at('Rate History', '', {
          method: 'POST',
          body: JSON.stringify({ fields: {
            'Student': [studentId],
            'Rate': [rateId],
            'Effective From': startDate,
          }}),
        });
      } catch (err) {
        console.error('[signup] Rate History failed:', (err as Error).message);
        return NextResponse.json({
          error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId}, Enrollment ${enrollmentId})`,
          partialSuccess: true,
        }, { status: 500 });
      }
    }

    // Step 6: Auto-generate prorated first invoice (non-fatal)
    let invoiceGenerated = false;
    let invoiceAmount: number | null = null;
    try {
      const start = new Date(String(startDate) + 'T00:00:00');
      const today = new Date();

      // Generate invoice if start date is in the current month OR a future month
      if (ratePerLesson && slotIds.length > 0) {
        const invoiceMonthLabel = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
        const lastDayOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);

        // Fetch slot to get day name and time
        const slotRecord = await at('Slots', `/${slotIds[0]}`);
        const dayRaw = slotRecord.fields?.['Day'] || '';
        const dayName = dayRaw.replace(/^\d+\s+/, '').trim();
        const slotTime = (slotRecord.fields?.['Time'] || '').trim();
        const dayLabel = slotTime ? `${dayName} ${slotTime}` : dayName;

        // Count lesson dates from start date to end of month
        const dayIndices: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
          Thursday: 4, Friday: 5, Saturday: 6,
        };
        const targetDay = dayIndices[dayName];
        const lineItems: { date: string; day: string; type: string; description: string }[] = [];

        if (targetDay !== undefined) {
          const subjectsStr = subjects.join(' & ');
          const description = `${level} ${subjectsStr} — ${invoiceMonthLabel}`;
          const current = new Date(start);
          // Advance to first occurrence of target day on or after start date
          while (current.getDay() !== targetDay) current.setDate(current.getDate() + 1);
          while (current <= lastDayOfMonth) {
            const iso = current.toISOString().split('T')[0];
            if (!NO_LESSON_DATES.includes(iso)) {
              lineItems.push({ date: iso, day: dayLabel, type: 'Regular', description });
            }
            current.setDate(current.getDate() + 7);
          }
        }

        const lessonCount = lineItems.length;
        if (lessonCount > 0) {
          const baseAmount = lessonCount * ratePerLesson;
          const todayStr = new Date().toISOString().split('T')[0];
          const firstLessonDate = lineItems[0].date;
          const formatDateLong = (iso: string) =>
            new Date(iso + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
          const firstLessonFormatted = formatDateLong(firstLessonDate);

          // Look up trial lesson date from Lessons table
          let trialLessonFormatted: string | null = null;
          try {
            const trialRes = await at('Lessons', `?filterByFormula=AND(SEARCH('${studentId}',ARRAYJOIN({Student})),{Type}='Trial')&maxRecords=1`);
            const trialRecord = trialRes.records?.[0];
            if (trialRecord?.fields?.['Date']) {
              trialLessonFormatted = formatDateLong(trialRecord.fields['Date'] as string);
            }
          } catch { /* non-fatal */ }

          const autoNotes = [
            `<b>First invoice</b> — prorated from ${firstLessonFormatted} (${lessonCount} lesson${lessonCount !== 1 ? 's' : ''})`,
            trialLessonFormatted ? `Trial lesson: ${trialLessonFormatted}` : null,
            `First lesson: ${firstLessonFormatted}`,
          ].filter(Boolean).join('\n');

          const invoiceFields: Record<string, unknown> = {
            'Student': [studentId],
            'Month': invoiceMonthLabel,
            'Lessons Count': lessonCount,
            'Rate Per Lesson': ratePerLesson,
            'Final Amount': baseAmount,
            'Line Items': JSON.stringify(lineItems),
            'Invoice Type': 'Regular',
            'Status': 'Draft',
            'Issue Date': todayStr,
            'Due Date': firstLessonDate,
            'Auto Notes': autoNotes,
          };

          const createdInvoice = await at('Invoices', '', {
            method: 'POST',
            body: JSON.stringify({ fields: invoiceFields }),
          });

          invoiceGenerated = true;
          invoiceAmount = baseAmount;

          // Generate PDF (non-fatal)
          if (process.env.VERCEL === '1') {
            try {
              const invoiceData = {
                studentName: sanitize(studentName) as string,
                month: invoiceMonthLabel,
                invoiceId: createdInvoice.id,
                issueDate: todayStr,
                dueDate: firstLessonDate,
                lessonsCount: lessonCount,
                ratePerLesson,
                baseAmount,
                finalAmount: baseAmount,
                status: 'Pending',
                makeupCredits: 0,
                notes: autoNotes,
                lineItems,
                lineItemsExtra: [],
              };
              const pdfBuffer = await generateInvoicePDF(invoiceData);
              const uploadRes = await fetch(
                `https://content.airtableapi.com/v0/${baseId}/Invoices/${createdInvoice.id}/uploadAttachment`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${airtableToken}`,
                    'Content-Type': 'application/octet-stream',
                    'X-Airtable-Attachment-Filename': `Invoice-${sanitize(studentName)}-${invoiceMonthLabel}.pdf`,
                    'X-Airtable-Field-Name': 'Invoice PDF',
                  },
                  body: pdfBuffer as unknown as BodyInit,
                }
              );
              if (!uploadRes.ok) throw new Error('Airtable upload failed: ' + await uploadRes.text());
              await closeBrowser();
            } catch (pdfError) {
              console.error('[signup] PDF generation failed (non-fatal):', (pdfError as Error).message);
              try { await closeBrowser(); } catch { /**/ }
            }
          }

          // Telegram notification (non-fatal)
          try {
            await sendTelegram(
              `📝 <b>New student signup: ${sanitize(studentName)} (${level})</b>\n` +
              `First invoice generated: $${baseAmount.toFixed(2)} (${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}, ${invoiceMonthLabel})\n` +
              `Status: Draft — review in admin dashboard.`
            );
          } catch (tgError) {
            console.error('[signup] Telegram notification failed (non-fatal):', (tgError as Error).message);
          }
        }
      }
    } catch (invoiceError) {
      console.error('[signup] Invoice generation failed (non-fatal):', (invoiceError as Error).message);
    }

    // Step 6b: Generate next-month invoice if monthly batch has already run
    // The batch runs on the 14th of each month to generate the FOLLOWING month's invoices.
    // If today >= 14th of startDate's month, this student missed the batch — generate it now.
    try {
      const start = new Date(String(startDate) + 'T00:00:00');
      const todayForBatch = new Date();
      const batchAlreadyRan =
        (todayForBatch.getFullYear() > start.getFullYear()) ||
        (todayForBatch.getFullYear() === start.getFullYear() &&
          todayForBatch.getMonth() > start.getMonth()) ||
        (todayForBatch.getFullYear() === start.getFullYear() &&
          todayForBatch.getMonth() === start.getMonth() &&
          todayForBatch.getDate() >= 14);

      if (batchAlreadyRan && ratePerLesson && slotIds.length > 0) {
        const nextMonthStart = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const nextMonthEnd   = new Date(start.getFullYear(), start.getMonth() + 2, 0);
        const nextMonthLabel = `${MONTH_NAMES[nextMonthStart.getMonth()]} ${nextMonthStart.getFullYear()}`;

        const slotRecord2 = await at('Slots', `/${slotIds[0]}`);
        const dayRaw2  = (slotRecord2.fields?.['Day'] || '').replace(/^\d+\s+/, '').trim();
        const dayName2 = dayRaw2;
        const slotTime2 = (slotRecord2.fields?.['Time'] || '').trim();
        const dayLabel2 = slotTime2 ? `${dayName2} ${slotTime2}` : dayName2;

        const dayIndices2: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
          Thursday: 4, Friday: 5, Saturday: 6,
        };
        const targetDay2 = dayIndices2[dayName2];
        const lineItems2: { date: string; day: string; type: string; description: string }[] = [];

        if (targetDay2 !== undefined) {
          const subjectsStr = subjects.join(' & ');
          const desc2 = `${level} ${subjectsStr} — ${nextMonthLabel}`;
          const cur2 = new Date(nextMonthStart);
          while (cur2.getDay() !== targetDay2) cur2.setDate(cur2.getDate() + 1);
          while (cur2 <= nextMonthEnd) {
            const iso = cur2.toISOString().split('T')[0];
            if (!NO_LESSON_DATES.includes(iso)) {
              lineItems2.push({ date: iso, day: dayLabel2, type: 'Regular', description: desc2 });
            }
            cur2.setDate(cur2.getDate() + 7);
          }
        }

        if (lineItems2.length > 0) {
          const nextAmount = lineItems2.length * ratePerLesson;
          const todayStr2 = todayForBatch.toISOString().split('T')[0];
          const nextDueDate = lineItems2[0].date;
          await at('Invoices', '', {
            method: 'POST',
            body: JSON.stringify({ fields: {
              'Student':        [studentId],
              'Month':          nextMonthLabel,
              'Lessons Count':  lineItems2.length,
              'Rate Per Lesson': ratePerLesson,
              'Final Amount':   nextAmount,
              'Line Items':     JSON.stringify(lineItems2),
              'Invoice Type':   'Regular',
              'Status':         'Draft',
              'Issue Date':     todayStr2,
              'Due Date':       nextDueDate,
              'Auto Notes':     `New student — ${nextMonthLabel} invoice (${lineItems2.length} lesson${lineItems2.length !== 1 ? 's' : ''})`,
            }}),
          });
          console.log(`[signup] Generated next-month invoice: ${nextMonthLabel} (${lineItems2.length} lessons, $${nextAmount.toFixed(2)})`);
          try {
            await sendTelegram(
              `📅 <b>Next-month invoice also created: ${sanitize(studentName)}</b>\n` +
              `${nextMonthLabel}: $${nextAmount.toFixed(2)} (${lineItems2.length} lesson${lineItems2.length !== 1 ? 's' : ''})\n` +
              `Status: Draft`
            );
          } catch { /* non-fatal */ }
        }
      }
    } catch (nextInvoiceError) {
      console.error('[signup] Next-month invoice generation failed (non-fatal):', (nextInvoiceError as Error).message);
    }

    // Step 7: Auto-generate lesson records (non-fatal)
    let lessonsCreated = 0;
    try {
      if (slotIds.length > 0 && enrollmentId) {
        const slotRecord = await at('Slots', `/${slotIds[0]}`);
        const dayRaw = (slotRecord.fields?.['Day'] || '').replace(/^\d+\s+/, '').trim();
        const dayIndicesForLessons: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
          Thursday: 4, Friday: 5, Saturday: 6,
        };
        const targetDay = dayIndicesForLessons[dayRaw];

        if (targetDay !== undefined) {
          const WEEKS_AHEAD = 9;
          const lessonStart = new Date(String(startDate) + 'T00:00:00');
          const lessonEnd = new Date(lessonStart);
          lessonEnd.setDate(lessonEnd.getDate() + WEEKS_AHEAD * 7);

          const startStr = lessonStart.toISOString().split('T')[0];
          const endStr = lessonEnd.toISOString().split('T')[0];

          // Fetch existing lessons for this student in the date range to avoid duplicates
          const existingSet = new Set<string>();
          try {
            const existingData = await at(
              'Lessons',
              `?filterByFormula=${encodeURIComponent(`AND(FIND('${studentId}',ARRAYJOIN({Student}))>0,{Date}>='${startStr}',{Date}<='${endStr}')`)}&fields[]=Date`
            );
            for (const r of existingData.records || []) {
              if (r.fields?.['Date']) existingSet.add(r.fields['Date'] as string);
            }
            if (existingSet.size > 0) {
              console.log(`[signup] Skipping ${existingSet.size} already-existing lessons for student ${studentId}`);
            }
          } catch (deupErr) {
            console.error('[signup] Dedup fetch failed (continuing):', (deupErr as Error).message);
          }

          // Advance to first occurrence of target day on or after start date
          const current = new Date(lessonStart);
          while (current.getDay() !== targetDay) current.setDate(current.getDate() + 1);

          while (current <= lessonEnd) {
            const iso = current.toISOString().split('T')[0];
            if (!existingSet.has(iso)) {
              const isHoliday = NO_LESSON_DATES.includes(iso);
              try {
                await at('Lessons', '', {
                  method: 'POST',
                  body: JSON.stringify({ fields: {
                    Type: 'Regular',
                    Student: [studentId],
                    Slot: slotIds,
                    Date: iso,
                    Status: isHoliday ? 'Cancelled' : 'Scheduled',
                    ...(isHoliday && { Notes: 'Public Holiday' }),
                  }}),
                });
                lessonsCreated++;
              } catch (lessonErr) {
                console.error(`[signup] Lesson creation failed for ${iso}:`, (lessonErr as Error).message);
              }
            }
            current.setDate(current.getDate() + 7);
          }
          console.log(`[signup] Generated ${lessonsCreated} lessons for student ${studentId}`);
        }
      }
    } catch (lessonGenError) {
      console.error('[signup] Lesson generation failed (non-fatal):', (lessonGenError as Error).message);
    }

    // Send Telegram notification if no invoice was generated (invoice block sends its own)
    if (!invoiceGenerated) {
      try {
        await sendTelegram(
          `📝 <b>New student signup: ${sanitize(studentName)} (${level})</b>\n` +
          `Start date: ${startDate}\n` +
          `Lessons created: ${lessonsCreated}\n` +
          `No invoice generated (start date may be in a future month).`
        );
      } catch (tgError) {
        console.error('[signup] Telegram notification failed (non-fatal):', (tgError as Error).message);
      }
    }

    return NextResponse.json({
      success: true,
      studentName: sanitize(studentName),
      startDate,
      registrationToken,
      invoiceGenerated,
      invoiceAmount,
    });
  } catch (error) {
    console.error('[signup] Unhandled error:', error);
    return NextResponse.json({
      error: 'Something went wrong. Please try again or contact Adrian directly via WhatsApp.',
    }, { status: 500 });
  }
}
