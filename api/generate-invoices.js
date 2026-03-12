const CNY_DATES = [
    '2026-02-17', '2026-02-18', // CNY 2026
    '2027-02-06', '2027-02-07', // CNY 2027
];
const NO_LESSON_DATES = [...CNY_DATES, '2026-12-25', '2027-12-25'];

const PRORATION_MONTHS = [10, 11, 12]; // Oct, Nov, Dec (1-indexed)
function isProratedMonth(monthNum) { return PRORATION_MONTHS.includes(monthNum); }

const { generateInvoicePDF, closeBrowser } = require('./generate-pdf');
const { sendTelegram } = require('./telegram');

async function airtableRequest(baseId, airtableToken, tableName, path, options = {}) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${airtableToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Airtable error [${tableName}]: ${text}`);
    }
    return res.json();
}

function getInvoiceMonth(today = new Date()) {
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed
    // If today is 14th or later, invoice month is next month; else next month anyway per spec
    const invoiceMonth = new Date(year, month + 1, 1);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return {
        label: `${monthNames[invoiceMonth.getMonth()]} ${invoiceMonth.getFullYear()}`,
        year: invoiceMonth.getFullYear(),
        month: invoiceMonth.getMonth() + 1, // 1-indexed for calculations
        firstDay: new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth(), 1),
        lastDay: new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth() + 1, 0),
    };
}

function countOccurrencesInMonth(dayName, invoiceMonth, endDate = null) {
    const dayIndices = {
        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
        Thursday: 4, Friday: 5, Saturday: 6
    };
    const targetDay = dayIndices[dayName];
    if (targetDay === undefined) return [];

    const dates = [];
    let current = new Date(invoiceMonth.firstDay);
    // Move to first occurrence of target day
    while (current.getDay() !== targetDay) {
        current.setDate(current.getDate() + 1);
    }
    // Walk through month
    while (current <= invoiceMonth.lastDay && (!endDate || current <= endDate)) {
        const iso = current.toISOString().split('T')[0];
        if (!NO_LESSON_DATES.includes(iso)) {
            dates.push({
                date: iso,
                day: dayName,
                type: 'Regular',
            });
        }
        current.setDate(current.getDate() + 7);
    }
    return dates;
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function buildAutoNotes(studentFields, invoiceMonth, regularLessons, makeupLessons, additionalLessons, outstandingMakeups, isLastMonth) {
  const isProrated = isProratedMonth(invoiceMonth.month);
  const level = studentFields['Level'] || '';
  const subjectLevel = studentFields['Subject Level'] || '';

  function fmtDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  let notes = '';

  if (isProrated) {
    const dates = regularLessons.map(r => fmtDate(r.fields['Date'])).join(', ');
    const count = regularLessons.length;
    notes = `Lessons attended: ${dates} (${count} lesson${count !== 1 ? 's' : ''})`;
  } else {
    const dates = regularLessons.map(r => fmtDate(r.date)).join(', ');
    const count = regularLessons.length;
    notes = `Lessons: ${dates} (${count} lesson${count !== 1 ? 's' : ''})`;

    if (makeupLessons.length) {
      makeupLessons.forEach(r => {
        const makeupDate = fmtDate(r.fields['Date']);
        notes += `\nMakeup: ${makeupDate} — making up for missed lesson`;
      });
    }

    if (additionalLessons.length) {
      const addDates = additionalLessons.map(r => {
        const slotName = r.fields['Slot Name'] || '';
        return `${fmtDate(r.fields['Date'])}${slotName ? ` (${slotName})` : ''}`;
      }).join(', ');
      notes += `\nAdditional lessons: ${addDates}`;
    }

    if (outstandingMakeups.length) {
      const muDates = outstandingMakeups.map(r => fmtDate(r.fields['Date'])).join(', ');
      notes += `\nOutstanding makeups: ${outstandingMakeups.length} (missed ${muDates})`;
    }
  }

  if (isLastMonth) {
    const isJC2 = level === 'JC2';
    const isSec5 = level === 'Sec 5';
    const isSec4G3 = level === 'Sec 4' && subjectLevel === 'G3';
    const isSec4G2 = level === 'Sec 4' && subjectLevel === 'G2';
    const isIP = subjectLevel === 'IP';

    if (isIP) {
      notes += `\nIt's been a pleasure teaching you. We hope the lessons have been helpful — all the best in your studies ahead! 🌟`;
    } else if (isJC2) {
      notes += `\nWishing you all the best for your A-Levels! Work hard and trust your preparation. 💪`;
    } else if (isSec4G3 || isSec5) {
      notes += `\nWishing you all the best for your O-Levels! Work hard and trust your preparation. 💪`;
    } else if (isSec4G2) {
      notes += `\nWishing you all the best for your N-Levels! Work hard and trust your preparation. 💪`;
    } else {
      notes += `\nIt's been a pleasure teaching you. We hope the lessons have been helpful — all the best in your studies ahead! 🌟`;
    }
  }

  return notes;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Security check for cron jobs
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers['authorization'];

    // Allow if: valid cron secret OR request is from Vercel cron
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        // Also allow Vercel's own cron requests
        const isVercelCron = req.headers['x-vercel-cron'] === '1';
        if (!isVercelCron) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!airtableToken || !baseId) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    try {
        console.log('[generate-invoices] Starting invoice generation...');
        const invoiceMonth = getInvoiceMonth();
        console.log('[generate-invoices] Invoice month:', invoiceMonth.label);

        // 2. Fetch all active Enrollments with linked Student and Slot
        console.log('[generate-invoices] Fetching active enrollments...');
        const enrollParams = new URLSearchParams();
        enrollParams.set('filterByFormula', `{Status}='Active'`);
        const enrollmentsData = await at('Enrollments', `?${enrollParams.toString()}`);
        console.log('[generate-invoices] Found', enrollmentsData.records?.length || 0, 'active enrollments');

        if (!enrollmentsData.records || enrollmentsData.records.length === 0) {
            return res.json({ generated: 0, skipped: 0, errors: [] });
        }

        // Fetch related records in parallel
        const studentIds = [...new Set(enrollmentsData.records.map(r => r.fields['Student']?.[0]).filter(Boolean))];
        const slotIds = [...new Set(enrollmentsData.records.map(r => r.fields['Slot']?.[0]).filter(Boolean))];
        const invoiceCheckParams = new URLSearchParams();
        invoiceCheckParams.set('filterByFormula', `{Month}='${invoiceMonth.label}'`);
        const existingInvoicesData = await at('Invoices', `?${invoiceCheckParams.toString()}`);

        const [studentsData, slotsData] = await Promise.all([
            studentIds.length ? at('Students', `?filterByFormula=OR(${studentIds.map(id => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Level&fields[]=Status&fields[]=Parent Email&fields[]=Parent Name&fields[]=Subject Level&fields[]=Subjects`) : { records: [] },
            slotIds.length ? at('Slots', `?filterByFormula=OR(${slotIds.map(id => `RECORD_ID()='${id}'`).join(',')})`) : { records: [] },
        ]);

        const studentsById = Object.fromEntries(studentsData.records.map(r => [r.id, r]));
        const slotsById = Object.fromEntries(slotsData.records.map(r => [r.id, r]));
        const existingStudentIds = new Set(existingInvoicesData.records.map(r => r.fields['Student']?.[0]).filter(Boolean));

        // Group enrollments by student
        const enrollmentsByStudent = {};
        for (const enrollment of enrollmentsData.records) {
            const studentId = enrollment.fields['Student']?.[0];
            if (!studentId) continue;
            if (!enrollmentsByStudent[studentId]) enrollmentsByStudent[studentId] = [];
            enrollmentsByStudent[studentId].push(enrollment);
        }

        let generated = 0;
        const generatedList = [];
        let skipped = 0;
        const errors = [];

        for (const studentId in enrollmentsByStudent) {
            const studentEnrollments = enrollmentsByStudent[studentId];
            const student = studentsById[studentId];
            if (!student) {
                console.warn('[generate-invoices] Missing student for id', studentId);
                skipped += studentEnrollments.length;
                continue;
            }
            try {
                // Skip if invoice already exists
                if (existingStudentIds.has(studentId)) {
                    console.log('[generate-invoices] Skipping student', student.fields['Student Name'], '- invoice already exists');
                    skipped += studentEnrollments.length;
                    continue;
                }

                // Read rate directly from Enrollment — already a per-lesson amount
                const ratePerLesson = studentEnrollments[0].fields['Rate Per Lesson'] || 0;
                if (!ratePerLesson) {
                    console.warn(`[generate-invoices] WARNING: No Rate Per Lesson set for student ${student.fields['Student Name']} — skipping`);
                    skipped++;
                    continue;
                }

                // Determine if this is a proration month
                const isProrated = isProratedMonth(invoiceMonth.month);

                // For proration months: query Completed Regular lessons from Lessons table
                // For fixed months: keep existing countOccurrencesInMonth logic
                let allLineItems = [];
                let proratedLessonRecords = [];
                let hasLessons = false;

                if (isProrated) {
                    // Query completed Regular lessons this month for this student
                    const monthStart = formatDate(invoiceMonth.firstDay);
                    const monthEnd = formatDate(invoiceMonth.lastDay);
                    const lessonFormula = encodeURIComponent(
                        `AND({Student}='${studentId}',{Type}='Regular',{Status}='Completed',{Date}>='${monthStart}',{Date}<='${monthEnd}')`
                    );
                    const lessonData = await at('Lessons', `?filterByFormula=${lessonFormula}&sort[0][field]=Date&sort[0][direction]=asc`);
                    proratedLessonRecords = lessonData.records || [];
                    if (proratedLessonRecords.length > 0) hasLessons = true;
                } else {
                    // Fixed months: existing slot-day counting logic
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

                // Query makeup lessons completed this month
                const monthStart = formatDate(invoiceMonth.firstDay);
                const monthEnd = formatDate(invoiceMonth.lastDay);

                const makeupFormula = encodeURIComponent(
                    `AND({Student}='${studentId}',{Type}='Makeup',{Status}='Completed',{Date}>='${monthStart}',{Date}<='${monthEnd}')`
                );
                const additionalFormula = encodeURIComponent(
                    `AND({Student}='${studentId}',{Type}='Additional',{Status}='Completed',{Date}>='${monthStart}',{Date}<='${monthEnd}')`
                );
                const outstandingFormula = encodeURIComponent(
                    `AND({Student}='${studentId}',{Status}='Absent')`
                );

                const [makeupData, additionalData, outstandingData] = await Promise.all([
                    at('Lessons', `?filterByFormula=${makeupFormula}&sort[0][field]=Date&sort[0][direction]=asc`),
                    at('Lessons', `?filterByFormula=${additionalFormula}&sort[0][field]=Date&sort[0][direction]=asc`),
                    at('Lessons', `?filterByFormula=${outstandingFormula}&sort[0][field]=Date&sort[0][direction]=asc`)
                ]);

                const makeupLessons = makeupData.records || [];
                const additionalLessons = additionalData.records || [];
                const outstandingMakeups = outstandingData.records || [];

                // Compute lesson count and base amount
                const regularLessonRecords = isProrated ? proratedLessonRecords : allLineItems;
                const lessonCount = isProrated ? proratedLessonRecords.length : allLineItems.length;
                const additionalCount = additionalLessons.length;

                if (!hasLessons && !isProrated) {
                    console.log('[generate-invoices] No lessons in month for student', student.fields['Student Name']);
                    skipped += studentEnrollments.length;
                    continue;
                }
                if (isProrated && lessonCount === 0 && additionalCount === 0) {
                    console.log('[generate-invoices] No completed lessons in proration month for student', student.fields['Student Name']);
                    skipped += studentEnrollments.length;
                    continue;
                }

                // Sort fixed-month line items by date
                if (!isProrated) allLineItems.sort((a, b) => a.date.localeCompare(b.date));

                const baseAmount = lessonCount * ratePerLesson;
                const additionalAmount = additionalCount * ratePerLesson;
                const finalAmount = baseAmount + additionalAmount;

                // Check if this is the student's last month (end date falls within invoice month)
                const allEndDates = studentEnrollments.map(e => e.fields['End Date']).filter(Boolean);
                const isLastMonth = allEndDates.some(d => {
                    const endDt = new Date(d + 'T00:00:00');
                    return endDt >= invoiceMonth.firstDay && endDt <= invoiceMonth.lastDay;
                });

                // Build AUTO_NOTES
                const autoNotes = buildAutoNotes(
                    student.fields,
                    invoiceMonth,
                    regularLessonRecords,
                    makeupLessons,
                    additionalLessons,
                    outstandingMakeups,
                    isLastMonth
                );

                // Build description
                const subjects = Array.isArray(student.fields['Subjects']) ? student.fields['Subjects'].join(' & ') : '';
                const description = `${student.fields['Level'] || ''} ${subjects} — ${invoiceMonth.label}`;

                // Build line items array
                const lineItemsForInvoice = [];

                if (isProrated) {
                    // Proration month: one line item per completed lesson
                    proratedLessonRecords.forEach(r => {
                        lineItemsForInvoice.push({ date: r.fields['Date'], day: '', type: 'Regular', description });
                    });
                } else {
                    allLineItems.forEach(item => lineItemsForInvoice.push({ ...item, description }));
                }

                // Additional lessons as separate line items
                if (additionalCount > 0) {
                    additionalLessons.forEach(r => {
                        lineItemsForInvoice.push({
                            date: r.fields['Date'],
                            day: '',
                            type: 'Additional',
                            description: `Additional Lesson — ${invoiceMonth.label}`
                        });
                    });
                }

                // 6. Create Draft invoice
                const invoiceFields = {
                    'Student': [studentId],
                    'Month': invoiceMonth.label,
                    'Lessons Count': lessonCount,
                    'Rate Per Lesson': ratePerLesson,
                    'Base Amount': baseAmount,
                    'Adjustment Amount': additionalAmount > 0 ? additionalAmount : undefined,
                    'Adjustment Notes': additionalAmount > 0 ? `Additional lessons: ${additionalCount} × ${ratePerLesson}` : undefined,
                    'Final Amount': finalAmount,
                    'Line Items': JSON.stringify(lineItemsForInvoice),
                    'Invoice Type': 'Regular',
                    'Status': 'Draft',
                    'Issue Date': formatDate(new Date()),
                    'Due Date': formatDate(new Date(invoiceMonth.year, invoiceMonth.month - 1, 15)),
                    'Auto Notes': autoNotes,
                };
                // Remove undefined fields
                Object.keys(invoiceFields).forEach(k => invoiceFields[k] === undefined && delete invoiceFields[k]);

                console.log('[generate-invoices] Sending invoiceFields:', JSON.stringify(invoiceFields, null, 2));
                console.log('[generate-invoices] Creating invoice for student', student.fields['Student Name'], '—', lessonCount, 'lessons across', studentEnrollments.length, 'slots');
                
                const createdRecord = await at('Invoices', '', {
                    method: 'POST',
                    body: JSON.stringify({ fields: invoiceFields }),
                });

                console.log('[generate-invoices] Created record:', 
                  JSON.stringify(createdRecord, null, 2));
                console.log('[generate-invoices] Created record ID:', 
                  createdRecord?.id);
                
                // Only generate and upload PDFs in production (Vercel)
                // Local Mac cannot access content.airtableapi.com
                if (process.env.VERCEL === '1') {
                  try {
                    console.log('[generate-invoices] Generating PDF for invoice', createdRecord.id);
                    
                    const invoiceData = {
                        studentName: student.fields['Student Name'],
                        month: invoiceMonth.label,
                        invoiceId: createdRecord.id,
                        issueDate: formatDate(new Date()),
                        dueDate: formatDate(new Date(invoiceMonth.year, invoiceMonth.month - 1, 15)),
                        lessonsCount: lessonCount,
                        ratePerLesson: ratePerLesson,
                        baseAmount: baseAmount,
                        additionalAmount: additionalAmount,
                        finalAmount: finalAmount,
                        status: 'Pending',
                        makeupCredits: 0,
                        notes: autoNotes,
                        lineItems: lineItemsForInvoice
                    };
                    
                    const pdfBuffer = await generateInvoicePDF(invoiceData);
                    
                    // Upload PDF directly to Airtable attachment API
                    const uploadRes = await fetch(
                      `https://content.airtableapi.com/v0/${baseId}/Invoices/${createdRecord.id}/uploadAttachment`,
                      {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${airtableToken}`,
                          'Content-Type': 'application/octet-stream',
                          'X-Airtable-Attachment-Filename': `Invoice-${student.fields['Student Name']}-${invoiceMonth.label}.pdf`,
                          'X-Airtable-Field-Name': 'Invoice PDF',
                        },
                        body: pdfBuffer
                      }
                    );

                    if (!uploadRes.ok) {
                      const errText = await uploadRes.text();
                      throw new Error('Airtable upload failed: ' + errText);
                    }

                    console.log('[generate-invoices] PDF uploaded for invoice', createdRecord.id);
                  } catch (pdfError) {
                    console.error('[generate-invoices] PDF error:', pdfError.message);
                  }
                } else {
                  console.log('[generate-invoices] Skipping PDF upload in local dev mode');
                }
                
                generatedList.push({ name: student.fields['Student Name'], amount: finalAmount, count: lessonCount });
                generated++;
                console.log('[generate-invoices] Invoice created for student', student.fields['Student Name']);
            } catch (err) {
                const studentName = student?.fields['Student Name'] || 'Unknown';
                console.error('[generate-invoices] Error processing student', studentName, ':', err.message);
                errors.push({ student: studentName, error: err.message });
            }
        }

        // Clean up browser instance
        await closeBrowser();
        
        console.log('[generate-invoices] Done. Generated:', generated, 'Skipped:', skipped, 'Errors:', errors.length);
        
        // Send Telegram notification
        const summaryLines = generatedList.map(g => `${g.name} — ${g.amount.toFixed(2)} (${g.count} lesson${g.count !== 1 ? 's' : ''})`).join('\n');
        const totalAmount = generatedList.reduce((sum, g) => sum + g.amount, 0);
        await sendTelegram(
          `📋 <b>Draft invoices ready — ${invoiceMonth.label}</b>\n\n` +
          `${summaryLines}\n\n` +
          `Total: ${generated} invoices · ${totalAmount.toFixed(2)}\n\n` +
          `Review and hold any before 15th via /amend [name].\n` +
          `Invoices send automatically at 8am tomorrow.`
        );
        
        return res.json({ generated, skipped, errors });
    } catch (error) {
        console.error('[generate-invoices] Unhandled error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
