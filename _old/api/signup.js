const crypto = require('crypto');

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
        slotId,
        level: rawLevel,
        subjects: subjectsParam,
        subjectLevel: subjectLevelParam,
        expires,
        sig,
        studentName,
        school,
        studentContact,
        parentName,
        parentContact,
        parentEmail,
        startDate,
        howHeard,
        referralType,
        referredBy,
    } = req.body || {};

    if (!slotId || !expires || !sig || !studentName || !parentName || !parentContact || !parentEmail || !startDate || !howHeard) {
        const missing = { slotId: !!slotId, expires: !!expires, sig: !!sig, studentName: !!studentName, parentName: !!parentName, parentContact: !!parentContact, parentEmail: !!parentEmail, startDate: !!startDate, howHeard: !!howHeard };
        console.error('[signup] Missing required fields:', missing);
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const at = (table, path, options) => airtableRequest(baseId, airtableToken, table, path, options);

    try {
        // Step 1: Validate HMAC signature
        console.log('[signup] Step 1: Validating HMAC signature...');
        const check = new URLSearchParams();
        check.set('slotId', slotId || '');
        check.set('level', rawLevel || '');
        check.set('subjects', subjectsParam || '');
        if (subjectLevelParam) check.set('subjectLevel', subjectLevelParam);
        check.set('expires', expires || '');
        const expectedSig = crypto
            .createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
            .update(check.toString()).digest('hex').slice(0, 16);
        if (sig !== expectedSig || Date.now() > parseInt(expires)) {
            console.error('[signup] Step 1: Invalid or expired sig. sig:', sig, '| expected:', expectedSig, '| expires:', expires);
            return res.status(400).json({ error: 'Invalid or expired signup link.' });
        }
        console.log('[signup] Step 1: Signature valid.');

        const level = LEVEL_MAP[rawLevel] || rawLevel;
        const subjectLevel = subjectLevelParam || '';
        const subjects = subjectsParam ? subjectsParam.split(',').map(s => s.trim()).filter(Boolean) : [];
        const slotIds = slotId ? [slotId] : [];
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
        if (referralType) studentFields['Referral Type'] = sanitize(referralType);
        if (referredBy) studentFields['Referred By Name'] = sanitize(referredBy);

        console.log('[signup] Step 2: Sending fields:', JSON.stringify(studentFields));
        const studentRecord = await at('Students', '', {
            method: 'POST',
            body: JSON.stringify({ fields: studentFields }),
        });
        const studentId = studentRecord.id;
        console.log('[signup] Step 2: Student created, id:', studentId);

        // Step 2b: Create registration token
        let registrationToken = null;
        console.log('[signup] Step 2b: Creating registration token...');
        try {
            const tokenValue = Array.from({length: 8}, () =>
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
            ).join('');
            await at('Tokens', '', {
                method: 'POST',
                body: JSON.stringify({ fields: {
                    Token:        tokenValue,
                    Student:      [studentId],
                    'Expires At': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    Status:       'Active',
                    'Created At': new Date().toISOString()
                }}),
            });
            registrationToken = tokenValue;
            console.log('[signup] Step 2b: Token created:', tokenValue);
        } catch (err) {
            console.error('[signup] Step 2b FAILED (non-fatal):', err.message);
        }

        // Step 3: Find Rate record (needed for Enrollment fields)
        console.log('[signup] Step 3: Looking up Rate...');
        let rateId = null;
        let ratePerLesson = null;
        let rateType = null;
        try {
            const rateLevel = level.startsWith('JC') ? 'JC' : 'Secondary';
            const rateParams = new URLSearchParams();
            rateParams.set('filterByFormula', `AND({Level}='${rateLevel}', {Is Current}=1)`);
            rateParams.set('maxRecords', '1');
            console.log('[signup] Step 3: rateLevel:', rateLevel, '| filter:', rateParams.get('filterByFormula'));
            const rateData = await at('Rates', `?${rateParams.toString()}`);
            if (rateData.records && rateData.records.length > 0) {
                const rateRecord = rateData.records[0];
                rateId = rateRecord.id;
                ratePerLesson = rateRecord.fields['Amount'] ? rateRecord.fields['Amount'] / 4 : null;
                rateType = 'Current';
                console.log('[signup] Step 3: Found Rate record, id:', rateId, '| fields:', JSON.stringify(rateRecord.fields));
            } else {
                console.warn('[signup] Step 3: No Rate record found for level:', rateLevel);
            }
        } catch (err) {
            console.error('[signup] Step 3 FAILED (non-fatal):', err.message);
        }

        // Step 4: Create Enrollment record
        console.log('[signup] Step 4: Creating Enrollment record...');
        let enrollmentId = null;
        try {
            const enrollmentFields = {
                'Student': [studentId],
                'Subjects In This Slot': subjects,
                'Start Date': startDate,
                'Status': 'Active',
            };
            if (slotId) enrollmentFields['Slot'] = [slotId];
            if (ratePerLesson !== null) enrollmentFields['Rate Per Lesson'] = ratePerLesson;
            if (rateType) enrollmentFields['Rate Type'] = rateType;

            console.log('[signup] Step 4: Sending fields:', JSON.stringify(enrollmentFields));
            const enrollmentRecord = await at('Enrollments', '', {
                method: 'POST',
                body: JSON.stringify({ fields: enrollmentFields }),
            });
            enrollmentId = enrollmentRecord.id;
            console.log('[signup] Step 4: Enrollment created, id:', enrollmentId);
        } catch (err) {
            console.error('[signup] Step 4 FAILED. Student ID:', studentId, '| Error:', err.message, '| Full:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
            return res.status(500).json({
                error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId})`,
                partialSuccess: true,
            });
        }

        // Step 5: Create Rate History record
        console.log('[signup] Step 5: rateId is', rateId, '— will', rateId ? 'create' : 'SKIP (no rate found)');
        if (rateId) {
            try {
                const rateHistoryFields = {
                    'Student': [studentId],
                    'Rate': [rateId],
                    'Effective From': startDate,
                };
                console.log('[signup] Step 5: Sending fields:', JSON.stringify(rateHistoryFields));
                await at('Rate History', '', {
                    method: 'POST',
                    body: JSON.stringify({ fields: rateHistoryFields }),
                });
                console.log('[signup] Step 5: Rate History created for student:', studentId);
            } catch (err) {
                console.error('[signup] Step 5 FAILED. Student:', studentId, '| Enrollment:', enrollmentId, '| Error:', err.message, '| Full:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
                return res.status(500).json({
                    error: `Registration partially completed. Please contact Adrian directly via WhatsApp. (Ref: Student ${studentId}, Enrollment ${enrollmentId})`,
                    partialSuccess: true,
                });
            }
        }

        // Step 6: Success
        console.log('[signup] Step 6: All done. Returning success for student:', sanitize(studentName));
        return res.status(200).json({
            success: true,
            studentName: sanitize(studentName),
            startDate,
            registrationToken,
        });
    } catch (error) {
        console.error('[signup] OUTER CATCH — unhandled error:', error.message);
        console.error('[signup] Full error:', error);
        return res.status(500).json({
            error: 'Something went wrong. Please try again or contact Adrian directly via WhatsApp.',
        });
    }
};
