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

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const recordId = req.query?.id;
    if (!recordId) {
        return res.status(400).json({ error: 'Missing id parameter' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!airtableToken || !baseId) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    // 1. Fetch invoice record
    const invoiceRecord = await at('Invoices', `/${recordId}`);
    const f = invoiceRecord.fields;

    // If a pre-generated blob URL exists, redirect to it directly
    if (f['PDF URL']) {
        return res.redirect(f['PDF URL']);
    }

    // 2. Fetch linked student via direct record lookup
    const studentId = f['Student']?.[0];
    let studentName = '';
    let parentEmail = '';
    if (studentId) {
        const studentRes = await fetch(
            `https://api.airtable.com/v0/${baseId}/Students/${studentId}`,
            { headers: { Authorization: `Bearer ${airtableToken}` } }
        );
        const studentRecord = await studentRes.json();
        studentName = studentRecord.fields['Student Name'] || '';
        parentEmail = studentRecord.fields['Parent Email'] || '';
    }

    // 3. Build invoiceData and generate PDF
    const lineItems = f['Line Items'] ? JSON.parse(f['Line Items']) : [];
    const invoiceData = {
        studentName,
        parentEmail,
        month: f['Month'] || '',
        invoiceId: recordId,
        issueDate: f['Issue Date'] || '',
        dueDate: f['Due Date'] || '',
        lessonsCount: f['Lessons Count'] || 0,
        ratePerLesson: f['Rate Per Lesson'] || 0,
        baseAmount: f['Base Amount'] || 0,
        adjustmentAmount: f['Adjustment Amount'] || 0,
        adjustmentNotes: f['Adjustment Notes'] || '',
        finalAmount: f['Final Amount'] || 0,
        status: f['Status'] || 'Draft',
        makeupCredits: 0,
        notes: f['Auto Notes'] || '',
        lineItems,
    };

    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // 4. Return PDF
    const filename = `Invoice-${studentName}-${f['Month'] || recordId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
};
