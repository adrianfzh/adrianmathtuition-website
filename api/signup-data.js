module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const airtableToken = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const { token: signupToken } = req.query;

    if (!signupToken) {
        return res.status(400).json({ error: 'No token provided' });
    }

    const headers = { Authorization: `Bearer ${airtableToken}` };

    try {
        const params = new URLSearchParams();
        params.set('filterByFormula', `{Token}='${signupToken}'`);
        params.set('maxRecords', '1');

        const tokenRes = await fetch(
            `https://api.airtable.com/v0/${baseId}/Tokens?${params.toString()}`,
            { headers }
        );

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            console.error('Airtable Tokens lookup error:', tokenRes.status, err);
            return res.status(500).json({ error: 'Failed to validate token' });
        }

        const tokenData = await tokenRes.json();

        if (!tokenData.records || tokenData.records.length === 0) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const record = tokenData.records[0];
        const f = record.fields;

        if (f['Status'] !== 'Unused') {
            return res.status(400).json({ error: 'Token already used' });
        }

        if (f['Expires At']) {
            const expiresAt = new Date(f['Expires At']);
            if (expiresAt < new Date()) {
                return res.status(400).json({ error: 'Token expired' });
            }
        }

        const slotIds = f['Slot'] || [];
        let slotId = '';
        let slotName = '';
        let slotDay = '';
        let slotTime = '';

        if (slotIds.length > 0) {
            slotId = slotIds[0];
            const slotRes = await fetch(
                `https://api.airtable.com/v0/${baseId}/${encodeURIComponent('Slots')}/${slotId}`,
                { headers }
            );
            if (slotRes.ok) {
                const slotData = await slotRes.json();
                slotName = slotData.fields['Slot Name'] || slotData.fields['Name'] || '';
                // Day field is e.g. "2 Tuesday" — strip leading number+space
                const dayRaw = slotData.fields['Day'] || '';
                slotDay = dayRaw.replace(/^\d+\s+/, '').trim();
                // Time field e.g. "3-5pm"
                slotTime = slotData.fields['Time'] || '';
            }
        }

        const subjectsRaw = f['Subjects'] || '';
        const subjects = Array.isArray(subjectsRaw)
            ? subjectsRaw
            : String(subjectsRaw).split(',').map(s => s.trim()).filter(Boolean);

        return res.status(200).json({
            level: f['Level'] || '',
            subjects,
            slotId,
            slotName,
            slotDay,
            slotTime,
        });
    } catch (error) {
        console.error('Error in signup-data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
