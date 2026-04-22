import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { batchId: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { batchId } = body;
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  // Find batch Airtable record
  const batchFormula = encodeURIComponent(`{Batch ID}="${batchId}"`);
  let batchAirtableId: string | null = null;
  try {
    const data = await airtableRequestAll('Batches', `?filterByFormula=${batchFormula}&maxRecords=1`);
    batchAirtableId = data.records?.[0]?.id || null;
  } catch (err) {
    console.error('[delete] batch lookup failed:', err);
  }

  if (!batchAirtableId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  // Soft delete: flip status to 'deleted'
  try {
    await airtableRequest('Batches', `/${batchAirtableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Status: 'deleted' } }),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: `Delete failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, batchId });
}
