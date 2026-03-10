const CNY_DATES = [
    '2026-02-17', '2026-02-18', // CNY 2026
    '2027-02-06', '2027-02-07', // CNY 2027
];
const NO_LESSON_DATES = [...CNY_DATES, '2026-12-25', '2027-12-25'];

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

        const [studentsData, slotsData, rateHistoryData] = await Promise.all([
            studentIds.length ? at('Students', `?filterByFormula=OR(${studentIds.map(id => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Level&fields[]=Status&fields[]=Parent Email&fields[]=Parent Name&fields[]=Subject Level&fields[]=Subjects`) : { records: [] },
            slotIds.length ? at('Slots', `?filterByFormula=OR(${slotIds.map(id => `RECORD_ID()='${id}'`).join(',')})`) : { records: [] },
            at('Rate History', ''),
        ]);

        // Fetch Rate records to get Amount values
        const rateIds = [...new Set(rateHistoryData.records.map(r => r.fields['Rate']?.[0]).filter(Boolean))];
        const ratesData = rateIds.length ? await at('Rates', `?filterByFormula=OR(${rateIds.map(id => `RECORD_ID()='${id}'`).join(',')})`) : { records: [] };
        const ratesById = Object.fromEntries(ratesData.records.map(r => [r.id, r.fields['Amount']]));
        const rateHistoryByStudent = Object.fromEntries(
            rateHistoryData.records.map(r => [
                r.fields['Student']?.[0],
                ratesById[r.fields['Rate']?.[0]] || 0
            ])
        );
        console.log('[rate-debug] rateHistoryByStudent:', JSON.stringify(rateHistoryByStudent, null, 2));

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

                // 3d. Get Monthly Rate from Rate History
                const monthlyRate = rateHistoryByStudent[studentId] || 0;
                const ratePerLesson = monthlyRate > 0 ? monthlyRate / 4 : 0;
                if (ratePerLesson <= 0) {
                    console.warn('[generate-invoices] No valid monthly rate for student', student.fields['Student Name']);
                    errors.push({ student: student.fields['Student Name'], error: 'Missing or invalid monthly rate' });
                    continue;
                }

                // Combine all slots for this student
                const allLineItems = [];
                let notes = '';
                let hasLessons = false;

                for (const enrollment of studentEnrollments) {
                    const slotId = enrollment.fields['Slot']?.[0];
                    const slot = slotsById[slotId];
                    if (!slot) {
                        console.warn('[generate-invoices] Missing slot for enrollment', enrollment.id);
                        continue;
                    }

                    // 3a. Get slot day
                    const dayRaw = slot.fields['Day'] || '';
                    const dayName = dayRaw.replace(/^\d+\s+/, '').trim();
                    console.log('[generate-invoices] Processing student', student.fields['Student Name'], '- slot day:', dayName);

                    // 3b. Count occurrences in month (respect End Date if any)
                    const endDateStr = enrollment.fields['End Date'];
                    const endDate = endDateStr ? new Date(endDateStr + 'T00:00:00') : null;
                    const lineItems = countOccurrencesInMonth(dayName, invoiceMonth, endDate);
                    if (lineItems.length > 0) hasLessons = true;
                    allLineItems.push(...lineItems);

                    // 5. Handle End Date note (collect earliest end date if any)
                    if (endDate && endDate <= invoiceMonth.lastDay) {
                        if (!notes) notes = `Prorated — last lesson on ${formatDate(endDate)}`;
                        else if (new Date(notes.match(/\d{4}-\d{2}-\d{2}/)[0]) > endDate) {
                            notes = `Prorated — last lesson on ${formatDate(endDate)}`;
                        }
                    }
                }

                if (!hasLessons) {
                    console.log('[generate-invoices] No lessons in month for student', student.fields['Student Name']);
                    skipped += studentEnrollments.length;
                    continue;
                }

                // Sort line items by date
                allLineItems.sort((a, b) => a.date.localeCompare(b.date));
                const lessonCount = allLineItems.length;
                const baseAmount = lessonCount * ratePerLesson;

                // Build description string
                const subjects = Array.isArray(student.fields['Subjects']) ? student.fields['Subjects'].join(' & ') : '';
                const description = `${student.fields['Level'] || ''} ${subjects} — ${invoiceMonth.label}`;

                // Add description to each line item
                const lineItemsWithDescription = allLineItems.map(item => ({
                    ...item,
                    description
                }));

                // 6. Create Draft invoice
                const invoiceFields = {
                    'Student': [studentId],
                    'Month': invoiceMonth.label,
                    'Lessons Count': lessonCount,
                    'Rate Per Lesson': ratePerLesson,
                    'Line Items': JSON.stringify(lineItemsWithDescription),
                    'Invoice Type': 'Regular',
                    'Status': 'Draft',
                    'Issue Date': formatDate(new Date()),
                    'Due Date': formatDate(new Date(invoiceMonth.year, invoiceMonth.month - 1, 15)),
                };
                if (notes) invoiceFields['Notes'] = notes;

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
                        baseAmount: lessonCount * ratePerLesson,
                        finalAmount: lessonCount * ratePerLesson,
                        status: 'Pending',
                        makeupCredits: 0,
                        notes: notes || '',
                        lineItems: lineItemsWithDescription
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
        await sendTelegram(
          `📋 <b>Invoices Generated</b>\n\n` +
          `${generated} invoices created for ${invoiceMonth.label}.\n` +
          `Please review and approve in Airtable by tomorrow 9am.\n\n` +
          `Skipped: ${skipped} | Errors: ${errors.length}` 
        );
        
        return res.json({ generated, skipped, errors });
    } catch (error) {
        console.error('[generate-invoices] Unhandled error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
