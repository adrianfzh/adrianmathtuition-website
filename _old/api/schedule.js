const DAY_MAP = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
};

module.exports = async function handler(req, res) {
    const token = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = 'Slots';

    console.log('[schedule] AIRTABLE_BASE_ID:', baseId ? `${baseId.slice(0, 6)}... (length ${baseId.length})` : 'MISSING');
    console.log('[schedule] AIRTABLE_TOKEN:', token ? `${token.slice(0, 6)}... (length ${token.length})` : 'MISSING');

    if (!token || !baseId) {
        return res.status(500).json({ error: 'Missing Airtable credentials' });
    }

    try {
        const params = new URLSearchParams();
        params.set('filterByFormula', '{Is Active}=TRUE()');
        ['Day', 'Time', 'Level', 'Normal Capacity', 'Enrolled Count'].forEach(f => {
            params.append('fields[]', f);
        });

        const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${params.toString()}`;

        console.log('[schedule] Fetching URL:', url);

        const airtableRes = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!airtableRes.ok) {
            const errText = await airtableRes.text();
            console.error('Airtable error:', airtableRes.status, errText);
            return res.status(502).json({ error: 'Airtable API error', status: airtableRes.status });
        }

        const data = await airtableRes.json();

        const slots = data.records.map(record => {
            const f = record.fields;

            const dayRaw = f['Day'] || '';
            const dayWord = dayRaw.replace(/^\d+\s+/, '');
            const day = DAY_MAP[dayWord] || dayWord;

            const level = f['Level'] || '';
            const type = level === 'Secondary' ? 'Sec' : level;

            return {
                day,
                time: f['Time'] || '',
                type,
                filled: f['Enrolled Count'] || 0,
                capacity: f['Normal Capacity'] || 4,
            };
        });

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ slots });
    } catch (error) {
        console.error('Error fetching schedule from Airtable:', error);
        return res.status(500).json({ error: 'Failed to fetch schedule data' });
    }
};
