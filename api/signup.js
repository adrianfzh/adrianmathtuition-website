const sanitize = (str) => String(str || '').trim().replace(/[<>]/g, '').slice(0, 500);

const LEVEL_MAP = {
    'Sec1': 'Sec 1', 'Sec2': 'Sec 2', 'Sec3': 'Sec 3',
    'Sec4': 'Sec 4', 'Sec5': 'Sec 5', 'JC1': 'JC1', 'JC2': 'JC2',
};

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
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Airtable error [${tableName}${path}]: ${JSON.stringify(data)}`);
    }
    return data;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;

    console.log('[signup] AIRTABLE_BASE_ID:', baseId ? `${baseId.slice(0, 6)}... (len ${baseId.length})` : 'MISSING');
    console.log('[signup] AIRTABLE_TOKEN:  ', airtableToken ? `${airtableToken.slice(0, 6)}... (len ${airtableToken.length})` : 'MISSING');
    console.log('[signup] req.body:', JSON.stringify(req.body));

    const {
        token: signupToken,
        studentName,
        school,
        studentContact,
        parentName,
        parentContact,
        parentEmail,
        startDate,
        howHeard,
        referredBy,
    } = req.body || {};

    if (!signupToken || !studentName || !parentName || !parentContact || !parentEmail || !startDate || !howHeard) {
        const missing = { signupToken: !!signupToken, studentName: !!studentName, parentName: !!parentName, parentContact: !!parentContact, parentEmail: !!parentEmail, startDate: !!startDate, howHeard: !!howHeard };
        console.error('[signup] Missing required fields:', missing);
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    try {
        // Step 1: Re-validate token
        console.log('[signup] Step 1: Looking up token:', signupToken);
        const tokenParams = new URLSearchParams();
        tokenParams.set('filterByFormula', `{Token}='${signupToken}'`);
        tokenParams.set('maxRecords', '1');
        const tokenData = await at('Tokens', `?${tokenParams.toString()}`);
        console.log('[signup] Step 1: Token lookup returned', tokenData.records?.length ?? 0, 'records');

        if (!tokenData.records || tokenData.records.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired registration link.' });
        }

        const tokenRecord = tokenData.records[0];
        const tf = tokenRecord.fields;
        console.log('[signup] Step 1: Token fields — Status:', tf['Status'], '| Expires At:', tf['Expires At']);

        if (tf['Status'] !== 'Pending') {
            return res.status(400).json({ error: 'This registration link has already been used.' });
        }
        if (tf['Expires At'] && new Date(tf['Expires At']) < new Date()) {
            return res.status(400).json({ error: 'This registration link has expired.' });
        }

        const rawLevel = tf['Level'] || '';
        const level = LEVEL_MAP[rawLevel] || rawLevel;
        const subjectLevel = tf['Subject Level'] || '';
        const subjectsRaw = tf['Subjects'] || '';
        const subjects = Array.isArray(subjectsRaw)
            ? subjectsRaw
            : String(subjectsRaw).split(',').map(s => s.trim()).filter(Boolean);
        const slotIds = tf['Slot'] || [];
        const slotId = slotIds[0] || '';
        console.log('[signup] Step 1: Extracted — rawLevel:', rawLevel, '→ level:', level, '| subjectLevel:', subjectLevel, '| subjects:', subjects, '| slotId:', slotId);

        // Step 2: Create Student record
        console.log('[signup] Step 2: Creating Student record...');
        const studentFields = {
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
        if (referredBy) studentFields['Referred By Name'] = sanitize(referredBy);

        console.log('[signup] Step 2: Sending fields:', JSON.stringify(studentFields));
        const studentRecord = await at('Students', '', {
            method: 'POST',
            body: JSON.stringify({ fields: studentFields }),
        });
        const studentId = studentRecord.id;
        console.log('[signup] Step 2: Student created, id:', studentId);

        // Step 2b: Link student to token and extend expiry to 7 days (non-fatal)
        console.log('[signup] Step 2b: Linking student to token and extending expiry...');
        try {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await at('Tokens', `/${tokenRecord.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    fields: {
                        'Student': [studentId],
                        'Expires At': expiresAt,
                        'Status': 'Active',
                    },
                }),
            });
            console.log('[signup] Step 2b: Token updated — student linked, expires:', expiresAt);
        } catch (err) {
            console.error('[signup] Step 2b FAILED (non-fatal). Token:', tokenRecord.id, '| Error:', err.message);
        }

        // Step 3: Create Enrollment record
        console.log('[signup] Step 3: Creating Enrollment record...');
        let enrollmentId = null;
        try {
            const enrollmentFields = {
                'Student': [studentId],
                'Subjects In This Slot': subjects,
                'Start Date': startDate,
                'Status': 'Active',
            };
            if (slotId) enrollmentFields['Slot'] = [slotId];

            console.log('[signup] Step 3: Sending fields:', JSON.stringify(enrollmentFields));
            const enrollmentRecord = await at('Enrollments', '', {
                method: 'POST',
                body: JSON.stringify({ fields: enrollmentFields }),
            });
            enrollmentId = enrollmentRecord.id;
            console.log('[signup] Step 3: Enrollment created, id:', enrollmentId);
        } catch (err) {
            console.error('[signup] Step 3 FAILED. Student ID:', studentId, '| Error:', err.message);
            return res.status(500).json({
                error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId})`,
                partialSuccess: true,
            });
        }

        // Step 4: Find Rate record
        console.log('[signup] Step 4: Looking up Rate...');
        let rateId = null;
        try {
            const rateLevel = level.startsWith('JC') ? 'JC' : 'Secondary';
            const rateParams = new URLSearchParams();
            rateParams.set('filterByFormula', `AND({Level}='${rateLevel}', FIND('Standard', {Rate Name}))`);
            rateParams.set('maxRecords', '1');
            console.log('[signup] Step 4: rateLevel:', rateLevel, '| filter:', rateParams.get('filterByFormula'));
            const rateData = await at('Rates', `?${rateParams.toString()}`);
            if (rateData.records && rateData.records.length > 0) {
                rateId = rateData.records[0].id;
                console.log('[signup] Step 4: Found Rate record, id:', rateId);
            } else {
                console.warn('[signup] Step 4: No Rate record found for level:', rateLevel);
            }
        } catch (err) {
            console.error('[signup] Step 4 FAILED (non-fatal):', err.message);
        }

        // Step 5: Create Rate History record
        console.log('[signup] Step 5: rateId is', rateId, '— will', rateId ? 'create' : 'SKIP (no rate found)');
        if (rateId) {
            try {
                await at('Rate History', '', {
                    method: 'POST',
                    body: JSON.stringify({
                        fields: {
                            'Student': [studentId],
                            'Rate': [rateId],
                            'Effective From': startDate,
                        },
                    }),
                });
            } catch (err) {
                console.error('[signup] Step 5 FAILED. Student:', studentId, '| Enrollment:', enrollmentId, '| Error:', err.message);
                return res.status(500).json({
                    error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId}, Enrollment ${enrollmentId})`,
                    partialSuccess: true,
                });
            }
        }

        // Step 6: Mark token as Used
        console.log('[signup] Step 6: Marking token as Used, record id:', tokenRecord.id);
        try {
            await at('Tokens', `/${tokenRecord.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    fields: { 'Status': 'Active', 'Student': [studentId] },
                }),
            });
        } catch (err) {
            console.error('[signup] Step 6 FAILED (non-fatal). Token:', tokenRecord.id, '| Error:', err.message);
        }

        // Step 7: Success
        console.log('[signup] Step 7: All done. Returning success for student:', sanitize(studentName));
        return res.status(200).json({
            success: true,
            studentName: sanitize(studentName),
            startDate,
        });
    } catch (error) {
        console.error('[signup] OUTER CATCH — unhandled error:', error.message);
        console.error('[signup] Full error:', error);
        return res.status(500).json({
            error: 'Something went wrong. Please try again or contact Adrian directly via WhatsApp.',
        });
    }
};
