const { put } = require('@vercel/blob');
const { generateInvoicePDF } = require('./generate-pdf');

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

module.exports = async function handler(req, res) {
    // Auth check
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== `Bearer ${adminPassword}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!airtableToken || !baseId) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    const { recordId: singleRecordId, force } = req.body || {};

    // Fetch invoices — single or all Draft
    let invoices;
    if (singleRecordId) {
        const record = await at('Invoices', `/${singleRecordId}`);
        invoices = [record];
    } else {
        const formula = encodeURIComponent(`{Status}='Draft'`);
        const data = await at('Invoices', `?filterByFormula=${formula}`);
        invoices = data.records || [];
    }

    let generated = 0;
    let skipped = 0;
    const errors = [];

    console.log('[generate-pdf-batch] Processing', invoices.length, 'invoices sequentially');

    for (const record of invoices) {
        const id = record.id;
        const f = record.fields;
        let studentName = '';
        try {
            // Skip invoices that already have a PDF URL unless force is set.
            // Single-invoice path always regenerates (singleRecordId implies force).
            if (!force && !singleRecordId && f['PDF URL']) {
                skipped++;
                continue;
            }

            // Resolve student name
            const studentId = f['Student']?.[0];
            if (studentId) {
                const studentRes = await fetch(
                    `https://api.airtable.com/v0/${baseId}/Students/${studentId}`,
                    { headers: { Authorization: `Bearer ${airtableToken}` } }
                );
                const studentRecord = await studentRes.json();
                studentName = studentRecord.fields['Student Name'] || '';
            }

            // Build invoice data
            const lineItems = f['Line Items'] ? JSON.parse(f['Line Items']) : [];
            const invoiceData = {
                studentName,
                month: f['Month'] || '',
                invoiceId: id,
                issueDate: f['Issue Date'] || '',
                dueDate: f['Due Date'] || '',
                lessonsCount: f['Lessons Count'] || 0,
                ratePerLesson: f['Rate Per Lesson'] || 0,
                baseAmount: f['Base Amount'] || 0,
                finalAmount: f['Final Amount'] || 0,
                status: f['Status'] || 'Draft',
                makeupCredits: 0,
                notes: f['Auto Notes'] || '',
                lineItems,
                lineItemsExtra: (() => {
                    try { return JSON.parse(f['Line Items Extra'] || '[]'); } catch { return []; }
                })(),
            };

            // Generate PDF
            const pdfBuffer = await generateInvoicePDF(invoiceData);

            // Upload to Vercel Blob
            const blob = await put(`invoices/${id}.pdf`, pdfBuffer, {
                access: 'public',
                contentType: 'application/pdf',
                allowOverwrite: true,
            });

            // Store blob URL and update Issue Date in Airtable
            const issueDate = new Date();
            issueDate.setDate(15);
            const issueDateStr = issueDate.toISOString().split('T')[0];
            await at('Invoices', `/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ fields: { 'PDF URL': blob.url, 'Issue Date': issueDateStr } }),
            });

            generated++;
            console.log('[generate-pdf-batch] Done:', studentName);
        } catch (err) {
            console.error(`[generate-pdf-batch] Error for ${id}:`, err.message);
            errors.push({ studentName, error: err.message });
        }
    }

    return res.json({ generated, skipped, errors });
};
