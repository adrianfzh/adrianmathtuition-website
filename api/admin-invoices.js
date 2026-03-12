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
    // Auth check — always runs first
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== `Bearer ${adminPassword}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    // Auth-only ping (used by login form to verify password)
    if (req.method === 'GET' && req.query?.auth === 'check') {
        return res.status(200).json({ ok: true });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!airtableToken || !baseId) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    if (req.method === 'GET') {
        const formula = encodeURIComponent(`OR({Status}='Draft',{Status}='Approved')`);
        const invoicesData = await at('Invoices', `?filterByFormula=${formula}&sort[0][field]=Student&sort[0][direction]=asc`);
        const invoices = invoicesData.records || [];

        const studentIds = [...new Set(invoices.map(r => r.fields['Student']?.[0]).filter(Boolean))];

        let studentsById = {};
        if (studentIds.length) {
            const studentsData = await at('Students',
                `?filterByFormula=OR(${studentIds.map(id => `RECORD_ID()='${id}'`).join(',')})` +
                `&fields[]=Student Name&fields[]=Parent Email`
            );
            studentsById = Object.fromEntries(studentsData.records.map(r => [r.id, r.fields]));
        }

        const result = invoices.map(r => {
            const f = r.fields;
            const studentId = f['Student']?.[0];
            const studentFields = studentsById[studentId] || {};
            const pdfAttachments = f['Invoice PDF'];
            const pdfUrl = Array.isArray(pdfAttachments) && pdfAttachments.length > 0
                ? pdfAttachments[0].url
                : null;
            return {
                id: r.id,
                studentName: studentFields['Student Name'] || '',
                parentEmail: studentFields['Parent Email'] || '',
                month: f['Month'] || '',
                lessonsCount: f['Lessons Count'] || 0,
                ratePerLesson: f['Rate Per Lesson'] || 0,
                baseAmount: f['Base Amount'] || 0,
                adjustmentAmount: f['Adjustment Amount'] ?? null,
                adjustmentNotes: f['Adjustment Notes'] || null,
                finalAmount: f['Final Amount'] || 0,
                autoNotes: f['Auto Notes'] || '',
                invoiceType: f['Invoice Type'] || '',
                status: f['Status'] || '',
                issueDate: f['Issue Date'] || '',
                dueDate: f['Due Date'] || '',
                pdfUrl,
            };
        });

        return res.json(result);
    }

    if (req.method === 'PATCH') {
        const { recordId, fields } = req.body || {};
        if (!recordId || !fields) {
            return res.status(400).json({ error: 'Missing recordId or fields' });
        }
        const updated = await at('Invoices', `/${recordId}`, {
            method: 'PATCH',
            body: JSON.stringify({ fields }),
        });
        return res.json(updated);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
