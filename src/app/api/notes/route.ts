import { NextRequest, NextResponse } from 'next/server';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function airtableFetch(baseId: string, token: string, path: string, options: RequestInit = {}) {
  const resp = await fetch(`https://api.airtable.com/v0/${baseId}/Notes${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  return resp.json();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: cors });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const subject  = sp.get('subject')  || '';
  const topic    = sp.get('topic')    || '';
  const slug     = sp.get('slug')     || '';
  const list     = sp.get('list')     || '';
  const password = (request.headers.get('authorization') || sp.get('password') || '').trim();

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: cors });
  }
  const at = (path: string, opts?: RequestInit) => airtableFetch(baseId, token, path, opts);
  const adminPw = (process.env.ADMIN_PASSWORD || '').trim();

  // Admin: list all notes
  if (list === 'all') {
    if (password !== adminPw) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    const data = await at('?fields[]=Topic&fields[]=Level&fields[]=Slug&sort[0][field]=Topic&sort[0][direction]=asc');
    return NextResponse.json(data.records || [], { headers: cors });
  }

  // Admin: fetch one by slug
  if (slug && password) {
    if (password !== adminPw) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    const formula = encodeURIComponent(`{Slug}='${slug}'`);
    const data = await at(`?filterByFormula=${formula}`);
    return NextResponse.json(data.records?.[0] || null, { headers: cors });
  }

  // Public: fetch by topic
  if (topic) {
    const s = `${topic.toLowerCase().replace(/\s+/g, '-')}-${(subject === 'JC2' || subject === 'JC') ? 'jc' : 'sec'}`;
    const formula = encodeURIComponent(`{Slug}='${s}'`);
    try {
      const resp = await at(`?filterByFormula=${formula}&fields[]=Content&fields[]=Generated%20Content&fields[]=Subtopics&fields[]=Visuals`);
      const record = resp.records?.[0]?.fields;
      if (!record) {
        return NextResponse.json(
          { content: '', generatedContent: '', subtopics: [], visuals: [] },
          { headers: { ...cors, 'Cache-Control': 's-maxage=30, stale-while-revalidate=10' } }
        );
      }
      let subtopics: unknown[] = [], visuals: unknown[] = [];
      try { subtopics = JSON.parse(record.Subtopics || '[]'); } catch { /* empty */ }
      try { visuals   = JSON.parse(record.Visuals   || '[]'); } catch { /* empty */ }
      return NextResponse.json(
        { content: record.Content || '', generatedContent: record['Generated Content'] || '', subtopics, visuals },
        { headers: { ...cors, 'Cache-Control': 's-maxage=30, stale-while-revalidate=10' } }
      );
    } catch (err) {
      console.error('[notes] error:', err);
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500, headers: cors });
    }
  }

  return NextResponse.json({ error: 'topic or slug+password required' }, { status: 400, headers: cors });
}

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const password = (request.headers.get('authorization') || sp.get('password') || '').trim();

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: cors });
  }
  const adminPw = (process.env.ADMIN_PASSWORD || '').trim();
  if (password !== adminPw) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* leave empty */ }

  const slug     = (sp.get('slug')    || body.slug    as string || '');
  const topic    = (sp.get('topic')   || body.topic   as string || '');
  const level    = (sp.get('level')   || body.level   as string || '');
  const content  = (body.content      as string ?? sp.get('content') ?? '');
  const subtopics = body.subtopics;

  if (!slug || !topic || !level) {
    return NextResponse.json(
      { error: 'slug, topic, level required', received: { slug, topic, level } },
      { status: 400, headers: cors }
    );
  }

  const at = (path: string, opts?: RequestInit) => airtableFetch(baseId, token, path, opts);

  const formula = encodeURIComponent(`{Slug}='${slug}'`);
  const existing = await at(`?filterByFormula=${formula}`);
  const existingRecord = existing.records?.[0];

  const fields: Record<string, unknown> = { Topic: topic, Level: level, Slug: slug, Content: content || '' };
  if (subtopics !== undefined) {
    fields.Subtopics = Array.isArray(subtopics) ? JSON.stringify(subtopics) : subtopics;
  }

  if (existingRecord) {
    const patchFields = { ...fields };
    delete patchFields.Level;
    const atResult = await at(`/${existingRecord.id}`, { method: 'PATCH', body: JSON.stringify({ fields: patchFields }) });
    if (atResult.error) return NextResponse.json({ error: 'Airtable error: ' + atResult.error }, { status: 500, headers: cors });
    return NextResponse.json({ success: true, action: 'updated', id: existingRecord.id }, { headers: cors });
  } else {
    const result = await at('', { method: 'POST', body: JSON.stringify({ fields }) });
    if (result.error) return NextResponse.json({ error: 'Airtable error: ' + result.error }, { status: 500, headers: cors });
    return NextResponse.json({ success: true, action: 'created', id: result.id }, { headers: cors });
  }
}
