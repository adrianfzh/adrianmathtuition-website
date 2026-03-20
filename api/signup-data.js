const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawQuery = req.url.split('?')[1] || '';
  const params = new URLSearchParams(rawQuery);

  const slotId       = params.get('slotId');
  const level        = params.get('level');
  const subjectsRaw  = params.get('subjects') || '';
  const subjectLevel = params.get('subjectLevel') || '';
  const expires      = params.get('expires');
  const sig          = params.get('sig');

  if (!slotId || !level || !expires || !sig) {
    return res.status(400).json({ error: 'Invalid signup link.' });
  }

  if (Date.now() > parseInt(expires)) {
    return res.status(400).json({ error: 'This signup link has expired.' });
  }

  // Verify HMAC signature
  const check = new URLSearchParams();
  check.set('slotId', slotId);
  check.set('level', level);
  check.set('subjects', subjectsRaw);
  if (subjectLevel) check.set('subjectLevel', subjectLevel);
  check.set('expires', expires);
  const expectedSig = crypto
    .createHmac('sha256', process.env.SIGNUP_SECRET || 'fallback-secret')
    .update(check.toString()).digest('hex').slice(0, 16);

  if (sig !== expectedSig) {
    return res.status(400).json({ error: 'Invalid signup link.' });
  }

  // Fetch slot details from Airtable
  const airtableToken = process.env.AIRTABLE_TOKEN;
  const baseId        = process.env.AIRTABLE_BASE_ID;
  const headers       = { Authorization: `Bearer ${airtableToken}` };

  try {
    const slotRes = await fetch(
      `https://api.airtable.com/v0/${baseId}/Slots/${slotId}`,
      { headers }
    );
    if (!slotRes.ok) return res.status(400).json({ error: 'Invalid slot.' });
    const slotData = await slotRes.json();
    const sf = slotData.fields;
    const dayRaw  = (sf['Day'] || '').replace(/^\d+\s+/, '').trim();
    const slotName = `${dayRaw} ${sf['Time'] || ''}`.trim();
    const slotTime = sf['Time'] || '';
    const subjects = subjectsRaw ? subjectsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    return res.status(200).json({
      level, subjects, subjectLevel,
      slotId, slotName, slotDay: dayRaw, slotTime,
    });
  } catch (err) {
    console.error('signup-data error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
