module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse body — Vercel sometimes auto-parses (req.body set), sometimes doesn't
  let body = req.body;
  if (req.method === 'POST' && (!body || !body.slug)) {
    // Either body wasn't parsed, or was parsed as empty — try reading the stream
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      if (raw) body = JSON.parse(raw);
    } catch(e) { /* leave body as-is */ }
  }
  body = body || {};

  const password = (req.headers?.authorization || req.query?.password || body.password || '').trim();

  const airtableToken = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!airtableToken || !baseId) return res.status(500).json({ error: 'Not configured' });

  const airtableFetch = async (path, options = {}) => {
    const resp = await fetch(`https://api.airtable.com/v0/${baseId}/Notes${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json', ...options.headers }
    });
    return resp.json();
  };

  // GET: public (for revise.html) or admin (for edit-notes.html)
  if (req.method === 'GET') {
    const { subject, topic, slug, list } = req.query;

    // Admin: list all notes
    if (list === 'all') {
      if (password !== (process.env.ADMIN_PASSWORD || '').trim()) return res.status(401).json({ error: 'Unauthorized' });
      const data = await airtableFetch('?fields[]=Topic&fields[]=Level&fields[]=Slug&sort[0][field]=Topic&sort[0][direction]=asc');
      return res.json(data.records || []);
    }

    // Admin: fetch one by slug (with password)
    if (slug && password) {
      if (password !== (process.env.ADMIN_PASSWORD || '').trim()) return res.status(401).json({ error: 'Unauthorized' });
      const formula = encodeURIComponent(`{Slug}='${slug}'`);
      const data = await airtableFetch(`?filterByFormula=${formula}`);
      return res.json(data.records?.[0] || null);
    }

    // Public: fetch by topic (for revise.html)
    if (topic) {
      const s = `${topic.toLowerCase().replace(/\s+/g, '-')}-${(subject === 'JC2' || subject === 'JC') ? 'jc' : 'sec'}`;
      const formula = encodeURIComponent(`{Slug}='${s}'`);
      try {
        const resp = await airtableFetch(`?filterByFormula=${formula}&fields[]=Content&fields[]=Generated%20Content&fields[]=Subtopics&fields[]=Visuals`);
        const record = resp.records?.[0]?.fields;
        if (!record) return res.json({ content: '', generatedContent: '', subtopics: [], visuals: [] });

        let subtopics = [], visuals = [];
        try { subtopics = JSON.parse(record.Subtopics || '[]'); } catch(e) {}
        try { visuals = JSON.parse(record.Visuals || '[]'); } catch(e) {}

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
        return res.json({
          content: record.Content || '',
          generatedContent: record['Generated Content'] || '',
          subtopics, visuals
        });
      } catch (err) {
        console.error('[notes] error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch' });
      }
    }

    return res.status(400).json({ error: 'topic or slug+password required' });
  }

  // POST: admin save (password-protected)
  if (req.method === 'POST') {
    console.log('[notes POST] query:', JSON.stringify(req.query));
    console.log('[notes POST] body keys:', Object.keys(body));
    if (password !== (process.env.ADMIN_PASSWORD || '').trim()) return res.status(401).json({ error: 'Unauthorized' });
    // slug/topic/level come from query params; content from body (may be large)
    const slug    = req.query.slug  || body.slug;
    const topic   = req.query.topic || body.topic;
    const level   = req.query.level || body.level;
    const content = body.content ?? req.query.content ?? '';
    const subtopics = body.subtopics;
    console.log('[notes POST] slug:', slug, 'topic:', topic, 'level:', level);
    if (!slug || !topic || !level) return res.status(400).json({ error: 'slug, topic, level required', received: { slug, topic, level, queryKeys: Object.keys(req.query) } });

    const formula = encodeURIComponent(`{Slug}='${slug}'`);
    const existing = await airtableFetch(`?filterByFormula=${formula}`);
    const existingRecord = existing.records?.[0];

    const fields = { Topic: topic, Level: level, Slug: slug, Content: content || '' };
    if (subtopics !== undefined) fields.Subtopics = Array.isArray(subtopics) ? JSON.stringify(subtopics) : subtopics;

    if (existingRecord) {
      await airtableFetch(`/${existingRecord.id}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
      return res.json({ success: true, action: 'updated', id: existingRecord.id });
    } else {
      const result = await airtableFetch('', { method: 'POST', body: JSON.stringify({ fields }) });
      return res.json({ success: true, action: 'created', id: result.id });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
