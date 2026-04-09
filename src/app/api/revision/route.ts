import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ lessonData: null }, { headers: CORS });
  }

  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500, headers: CORS });
  }

  try {
    const formula = encodeURIComponent(`AND({Slug}='${slug}',{Status}='Published')`);
    const data = await airtableRequest('Revision', `?filterByFormula=${formula}&maxRecords=1`);
    const record = data.records?.[0];

    if (!record) {
      return NextResponse.json({ lessonData: null }, {
        headers: { ...CORS, 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
      });
    }

    const f = record.fields;
    let lessonData = null;
    try {
      lessonData = JSON.parse(f['Lesson Data'] || 'null');
    } catch {
      lessonData = null;
    }

    return NextResponse.json(
      {
        lessonData,
        topic: f['Topic'] || '',
        subtopic: f['Subtopic'] || '',
        level: f['Level'] || '',
      },
      { headers: { ...CORS, 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' } }
    );
  } catch (err: any) {
    console.error('[revision] Airtable error:', err.message);
    return NextResponse.json({ lessonData: null }, { headers: CORS });
  }
}
