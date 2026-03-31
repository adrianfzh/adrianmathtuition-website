module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { subject, topic } = req.query;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  const slug = `${topic.toLowerCase().replace(/\s+/g, '-')}-${subject === 'JC' ? 'jc' : 'sec'}`;
  const airtableToken = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!airtableToken || !baseId) return res.status(500).json({ error: 'Not configured' });

  try {
    const formula = encodeURIComponent(`{Slug}='${slug}'`);
    const resp = await fetch(
      `https://api.airtable.com/v0/${baseId}/Notes?filterByFormula=${formula}&fields[]=Content&fields[]=Generated%20Content&fields[]=Subtopics&fields[]=Visuals`,
      { headers: { Authorization: `Bearer ${airtableToken}` } }
    );
    const data = await resp.json();
    const record = data.records?.[0]?.fields;

    if (!record) return res.json({ content: '', generatedContent: '', subtopics: [], visuals: [] });

    const content = record.Content || '';
    const generatedContent = record['Generated Content'] || '';
    let subtopics = [];
    let visuals = [];
    try { subtopics = JSON.parse(record.Subtopics || '[]'); } catch(e) {}
    try { visuals = JSON.parse(record.Visuals || '[]'); } catch(e) {}

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.json({ content, generatedContent, subtopics, visuals });
  } catch (err) {
    console.error('[revise] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch' });
  }
};
