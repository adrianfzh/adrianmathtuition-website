
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

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function buildEmailHtml(invoice) {
    return `
        <p>Dear Parent/Student,</p>
        <p>Please find attached the invoice for ${invoice.studentName} for ${invoice.month} — <strong>$${invoice.finalAmount}</strong>, due by <strong>${invoice.dueDate}</strong>.</p>
        <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${invoice.paymentRef}</strong>.</p>
        <p>Please feel free to reach out if you have any questions.</p>
        <p>Best regards,<br>Adrian</p>
    `;
}

async function downloadPdf(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`PDF download failed: ${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.error('Error downloading PDF:', error.message);
        return null;
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Security check — allow cron secret, admin password, or Vercel cron header
    const cronSecret = process.env.CRON_SECRET;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = req.headers['authorization'];
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const validCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const validAdmin = adminPassword && authHeader === `Bearer ${adminPassword}`;
    if (!isVercelCron && !validCron && !validAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!airtableToken || !baseId || !resendApiKey) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    const { recordId: singleRecordId } = req.body || {};

    try {
        console.log('[send-invoices] Starting invoice sending...');

        // STEP 1 — Fetch invoice(s)
        let invoiceRecords;
        if (singleRecordId) {
            console.log('[send-invoices] Fetching single invoice:', singleRecordId);
            const record = await at('Invoices', `/${singleRecordId}`);
            invoiceRecords = [record];
        } else {
            console.log('[send-invoices] Fetching Approved invoices...');
            const invoiceParams = new URLSearchParams();
            invoiceParams.set('filterByFormula', `{Status}='Approved'`);
            const invoicesData = await at('Invoices', `?${invoiceParams.toString()}`);
            invoiceRecords = invoicesData.records || [];
        }

        if (invoiceRecords.length === 0) {
            console.log('[send-invoices] No invoices found');
            return res.json({ sent: 0, failed: 0, errors: [] });
        }

        // Wrap single-record fetch into the same shape as list fetch
        console.log(`[send-invoices] Found ${invoiceRecords.length} invoice(s)`);

        // Fetch linked Student records
        const studentIds = [...new Set(invoiceRecords.map(r => r.fields['Student']?.[0]).filter(Boolean))];
        const studentsData = studentIds.length ? await at('Students', `?filterByFormula=OR(${studentIds.map(id => `RECORD_ID()='${id}'`).join(',')})`) : { records: [] };
        const studentsById = Object.fromEntries(studentsData.records.map(r => [r.id, r.fields]));

        // Process invoices and build email data
        const emails = [];
        const invoiceMap = new Map(); // Map invoice ID to record for updating later

        for (const invoiceRecord of invoiceRecords) {
            const studentId = invoiceRecord.fields['Student']?.[0];
            const student = studentsById[studentId];
            
            if (!student) {
                console.warn('[send-invoices] Missing student for invoice', invoiceRecord.id);
                continue;
            }

            const invoice = {
                id: invoiceRecord.id,
                studentName: student['Student Name'],
                parentEmail: student['Parent Email'],
                parentName: student['Parent Name'],
                month: invoiceRecord.fields['Month'],
                finalAmount: invoiceRecord.fields['Final Amount'] || 0,
                dueDate: invoiceRecord.fields['Due Date'],
                paymentRef: `${(student['Student Name'] || '').toUpperCase()} – ${(invoiceRecord.fields['Month'] || '').toUpperCase()}`
            };

            // STEP 2 — Fetch PDF from Vercel Blob URL
            const pdfUrl = invoiceRecord.fields['PDF URL'] || null;
            let pdfBuffer = null;

            if (pdfUrl) {
                pdfBuffer = await downloadPdf(pdfUrl);
                if (pdfBuffer) {
                    console.log(`[send-invoices] Downloaded PDF for invoice ${invoiceRecord.id}`);
                } else {
                    console.warn(`[send-invoices] Failed to download PDF for invoice ${invoiceRecord.id}`);
                }
            } else {
                console.warn(`[send-invoices] No PDF URL found for invoice ${invoiceRecord.id}`);
            }

            // STEP 3 — Build email object
            const emailData = {
                from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
                to: invoice.parentEmail,
                subject: `Invoice for ${invoice.month} – ${invoice.studentName}`,
                html: buildEmailHtml(invoice)
            };

            // Add attachment if PDF was downloaded
            if (pdfBuffer) {
                emailData.attachments = [{
                    filename: `AdriansMathTuition-Invoice-${(invoice.studentName || '').replace(/\s+/g, '-')}-${(invoice.month || '').replace(/\s+/g, '-')}.pdf`,
                    content: pdfBuffer.toString('base64'),
                    type: 'application/pdf',
                    disposition: 'attachment'
                }];
            }

            emails.push(emailData);
            invoiceMap.set(invoice.id, invoiceRecord);
        }

        if (emails.length === 0) {
            console.log('[send-invoices] No valid emails to send');
            return res.json({ sent: 0, failed: 0, errors: [] });
        }

        // STEP 4 — Send via Resend batch
        console.log(`[send-invoices] Sending ${emails.length} emails via Resend batch...`);
        
        const batchRes = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emails)
        });

        if (!batchRes.ok) {
          const errText = await batchRes.text();
          throw new Error('Resend batch failed: ' + errText);
        }

        const result = await batchRes.json();

        console.log('[send-invoices] Resend batch result:', JSON.stringify(result, null, 2));

        // STEP 5 — Update sent invoices in Airtable
        const updates = [];
        const errors = [];
        let sentCount = 0;
        let failedCount = 0;

        if (result.data && Array.isArray(result.data)) {
            for (let i = 0; i < result.data.length; i++) {
                const emailResult = result.data[i];
                const invoiceId = Array.from(invoiceMap.keys())[i];
                const invoiceRecord = invoiceMap.get(invoiceId);

                if (emailResult.id) {
                    // Successfully sent
                    try {
                        await at('Invoices', `/${invoiceId}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                fields: {
                                    'Status': 'Sent',
                                    'Sent At': new Date().toISOString()
                                }
                            })
                        });
                        sentCount++;
                        console.log(`[send-invoices] Updated invoice ${invoiceId} to Sent`);
                    } catch (updateError) {
                        console.error(`[send-invoices] Failed to update invoice ${invoiceId}:`, updateError.message);
                        errors.push({ invoiceId, error: 'Update failed: ' + updateError.message });
                    }
                } else {
                    // Failed to send
                    failedCount++;
                    const errorMsg = emailResult.error?.message || 'Unknown error';
                    console.error(`[send-invoices] Failed to send invoice ${invoiceId}:`, errorMsg);
                    errors.push({ invoiceId, error: errorMsg });
                }
            }
        }

        // STEP 6 — Return summary
        console.log(`[send-invoices] Done. Sent: ${sentCount}, Failed: ${failedCount}, Errors: ${errors.length}`);
        
        // Check for remaining Draft invoices
        const draftParams = new URLSearchParams();
        draftParams.set('filterByFormula', `{Status}='Draft'`);
        const draftData = await at('Invoices', 
          `?${draftParams.toString()}&fields[]=Month`);
        
        // Get current month from first sent invoice or use current date
        const currentMonth = emails.length > 0 && emails[0].subject 
          ? emails[0].subject.match(/for (\w+ \d{4})/)?.[1] 
          : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        const draftThisMonth = draftData.records.filter(
          r => r.fields['Month'] === currentMonth
        ).length;
        
        // Send Telegram notification
        await sendTelegram(
          `✅ <b>Invoices Sent</b>\n\n` +
          `${sentCount} invoices sent for ${currentMonth}.\n` +
          (draftThisMonth > 0 
            ? `⚠️ ${draftThisMonth} invoices still in Draft — please review!` 
            : `All invoices processed.`)
        );
        
        return res.json({ 
            sent: sentCount, 
            failed: failedCount, 
            errors: errors,
            total: emails.length
        });

    } catch (error) {
        console.error('[send-invoices] Unhandled error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
